/**
 * Leitura pública do marketplace eMenu/eBig Food.
 *
 * O Deskcomm não acessa o banco do eBig. Esta ferramenta usa apenas as páginas
 * públicas da vitrine e lê o JSON-LD que o próprio marketplace publica para
 * buscadores: cidades atendidas e lojas publicadas. Não cria pedido, não altera
 * cadastro e não recebe uma URL arbitrária (defesa contra SSRF).
 */
import { z } from "zod";

import type { McpToolDefinition } from "../types";

const MARKETPLACE_BASE_URL = "https://ebig.food";
const MARKETPLACE_HOST = "ebig.food";
const MARKETPLACE_CITIES_URL = `${MARKETPLACE_BASE_URL}/delivery/cidades`;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_HTML_CHARS = 2_000_000;

const marketplaceInputShape = {
  cidade: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .describe("cidade onde o cliente quer encontrar uma loja, com ou sem UF"),
  termo: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .optional()
    .describe("nome ou tipo de loja procurado, por exemplo hamburgueria ou pizza"),
  categoria: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .optional()
    .describe("categoria opcional, por exemplo hamburgueria, pizza ou restaurante"),
  limite: z.number().int().min(1).max(20).optional().default(10),
};

type JsonObject = Record<string, unknown>;

export interface MarketplaceCidadePublica {
  name: string;
  slug: string;
  url: string;
}

export interface MarketplaceLojaPublica {
  name: string;
  url: string | null;
  whatsapp: string | null;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Chave de comparação que trata acentos, hífen, barra e caixa como variações
 * da mesma entrada ("São Mateus - ES", "sao mateus es").
 */
export function normalizarChaveMarketplace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function decodificarHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function tipoSchema(value: unknown, wanted: string): boolean {
  return value === wanted || (Array.isArray(value) && value.includes(wanted));
}

function documentosJsonLd(html: string): JsonObject[] {
  const documentos: JsonObject[] = [];
  const matcher = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(matcher)) {
    const bruto = match[1]?.trim();
    if (!bruto) continue;
    try {
      const documento = asObject(JSON.parse(bruto));
      if (documento) documentos.push(documento);
    } catch {
      // Um JSON-LD inválido não pode derrubar a busca dos demais blocos.
    }
  }

  return documentos;
}

function valorUrlPublico(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname !== MARKETPLACE_HOST && parsed.hostname !== "wa.me") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function itensDeLista(
  documento: JsonObject,
  tipo: string,
): Array<{ name: string; url: string | null }> {
  if (!tipoSchema(documento["@type"], "ItemList")) return [];
  const elementos = Array.isArray(documento.itemListElement) ? documento.itemListElement : [];
  const itens: Array<{ name: string; url: string | null }> = [];

  for (const elemento of elementos) {
    const linha = asObject(elemento);
    const item = asObject(linha?.item) ?? linha;
    if (!item || !tipoSchema(item["@type"], tipo)) continue;

    const name = asString(item.name);
    if (!name) continue;

    itens.push({
      name: decodificarHtml(name),
      url: valorUrlPublico(item.url),
    });
  }

  return itens;
}

function slugDaUrlPublica(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== MARKETPLACE_HOST) return null;
    const match = parsed.pathname.match(/^\/delivery\/([a-z0-9-]+)$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function extrairCidadesMarketplace(html: string): MarketplaceCidadePublica[] {
  const cidades: MarketplaceCidadePublica[] = [];
  const vistas = new Set<string>();

  for (const documento of documentosJsonLd(html)) {
    for (const item of itensDeLista(documento, "City")) {
      const slug = slugDaUrlPublica(item.url);
      if (!slug || vistas.has(slug)) continue;
      vistas.add(slug);
      cidades.push({ name: item.name, slug, url: item.url! });
    }
  }

  return cidades;
}

export function extrairLojasMarketplace(html: string): MarketplaceLojaPublica[] {
  const lojas: MarketplaceLojaPublica[] = [];
  const vistas = new Set<string>();

  for (const documento of documentosJsonLd(html)) {
    for (const item of itensDeLista(documento, "Restaurant")) {
      const chave = `${item.name.toLowerCase()}|${item.url ?? ""}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      lojas.push({
        name: item.name,
        url: item.url,
        whatsapp: item.url?.startsWith("https://wa.me/") ? item.url : null,
      });
    }
  }

  return lojas;
}

function slugificarMarketplace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function lerMarketplace(url: string): Promise<string> {
  const resposta = await fetch(url, {
    headers: {
      accept: "text/html",
      "user-agent": "DeskcommCRM marketplace reader/1.0",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!resposta.ok) {
    throw new Error(`marketplace_http_${resposta.status}`);
  }

  const html = await resposta.text();
  if (html.length > MAX_HTML_CHARS) {
    throw new Error("marketplace_resposta_grande_demais");
  }
  return html;
}

async function resolverCidade(
  entrada: string,
): Promise<
  | { ok: true; cidade: MarketplaceCidadePublica }
  | { ok: false; error: { code: string; message: string; cidades?: string[] } }
> {
  const chave = normalizarChaveMarketplace(entrada);
  const pareceSlug =
    /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z]{2}$/i.test(entrada.trim()) && !entrada.includes(" ");

  if (pareceSlug) {
    return {
      ok: true,
      cidade: {
        name: entrada.replace(/-/g, " "),
        slug: entrada.toLowerCase(),
        url: `${MARKETPLACE_BASE_URL}/delivery/${entrada.toLowerCase()}`,
      },
    };
  }

  const cidades = extrairCidadesMarketplace(await lerMarketplace(MARKETPLACE_CITIES_URL));
  const exatas = cidades.filter((cidade) => {
    const nomeCompleto = normalizarChaveMarketplace(cidade.name);
    const nomeSemUf = nomeCompleto.replace(/\s+[a-z]{2}$/, "");
    return nomeCompleto === chave || nomeSemUf === chave;
  });

  if (exatas.length === 1) return { ok: true, cidade: exatas[0]! };

  if (exatas.length > 1) {
    return {
      ok: false,
      error: {
        code: "cidade_ambigua",
        message: "Encontrei mais de uma cidade com esse nome. Peça a UF ao cliente.",
        cidades: exatas.map((cidade) => cidade.name),
      },
    };
  }

  const aproximadas = cidades
    .filter((cidade) => normalizarChaveMarketplace(cidade.name).includes(chave))
    .slice(0, 8)
    .map((cidade) => cidade.name);

  return {
    ok: false,
    error: {
      code: "cidade_nao_encontrada",
      message: "A cidade não apareceu na lista pública de cidades atendidas.",
      cidades: aproximadas,
    },
  };
}

export type MotivoDeVazioMarketplace = "nao_encontrado";

export function motivoDoVazioDaBuscaMarketplace(resultado: unknown): string | null {
  const resposta = asObject(resultado);
  if (!resposta || !Array.isArray(resposta.lojas) || resposta.lojas.length > 0) return null;
  return resposta.motivo === "nao_encontrado" ? "nao_encontrado" : null;
}

export const crmSearchMarketplace: McpToolDefinition<typeof marketplaceInputShape> = {
  name: "crm_search_marketplace",
  description:
    "Consulta a vitrine pública atual do eMenu/eBig Food para encontrar lojas publicadas por cidade. " +
    "Use quando o cliente perguntar quais restaurantes, lanchonetes ou parceiros existem em uma cidade, " +
    "ou quando pedir uma opção por nome, termo ou categoria. A cidade é obrigatória; se o cliente não " +
    "informar a cidade, pergunte antes. Se houver mais de uma cidade com o mesmo nome, peça a UF. " +
    "Os resultados são lojas publicadas e links públicos de contato, não são prova de preço, cardápio, " +
    "horário aberto, taxa ou prazo de entrega: não invente esses dados e não diga que fez um pedido. " +
    "A ferramenta é somente leitura e os dados são consultados no momento da chamada.",
  inputSchema: marketplaceInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  motivoDoVazio: motivoDoVazioDaBuscaMarketplace,
  handler: async (input) => {
    try {
      const resolucao = await resolverCidade(input.cidade);
      if (!resolucao.ok) {
        return { ok: false, error: resolucao.error };
      }

      const url = new URL(resolucao.cidade.url);
      if (input.categoria) {
        url.pathname = `${url.pathname.replace(/\/$/, "")}/categoria/${slugificarMarketplace(input.categoria)}`;
      }
      if (input.termo) url.searchParams.set("q", input.termo);

      const lojasEncontradas = extrairLojasMarketplace(await lerMarketplace(url.toString()));
      const lojas = lojasEncontradas.slice(0, input.limite);
      return {
        ok: true,
        fonte: "marketplace_publico_ebig_food",
        cidade: resolucao.cidade.name,
        cidade_url: resolucao.cidade.url,
        consulta: {
          termo: input.termo ?? null,
          categoria: input.categoria ?? null,
        },
        total_encontrado: lojasEncontradas.length,
        lojas,
        ...(lojas.length === 0
          ? {
              motivo: "nao_encontrado" as const,
              observacao: "Nenhuma loja publicada correspondeu aos filtros informados.",
            }
          : {}),
        observacao:
          "Resultado da vitrine pública no momento da consulta. Confirme preço, cardápio, horário, taxa e prazo diretamente com a loja antes de prometer ao cliente.",
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "marketplace_indisponivel",
          message:
            "Não consegui consultar a vitrine pública agora. Não invente uma loja; ofereça confirmar com a equipe.",
        },
      };
    }
  },
};
