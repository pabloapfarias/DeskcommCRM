/**
 * CATÁLOGO DO COMMAND CODE, TRADUZIDO PARA ai_models.
 *
 * O endpoint do Command Code não publica preço nem uma flag explícita de
 * tool-calling: ele publica os endpoints que cada modelo aceita. O Deskcomm
 * lista somente modelos que falam Chat Completions, que é o wire que executa
 * as ferramentas locais do CRM. A API documenta que tools/function tools são
 * executadas pelo cliente e passadas pelo endpoint compatível.
 */
import type { LinhaDeCatalogo } from "./openrouter";

export interface ModeloDoCommandCode {
  id: string;
  name?: string | null;
  context_length?: number | null;
  supported_endpoints?: string[] | null;
}

export const FONTE_COMMANDCODE = "commandcode";
export const ENDPOINT_DO_CATALOGO_COMMANDCODE =
  "https://api.commandcode.ai/provider/v1/models";

const TIMEOUT_MS = 20_000;

/**
 * Traduz UM modelo. Modelos que só aceitam /messages (por exemplo, Claude)
 * ficam fora porque o adaptador deste provider usa o wire OpenAI Chat.
 */
export function traduzirModeloCommandCode(
  modelo: ModeloDoCommandCode,
): LinhaDeCatalogo | null {
  const id = (modelo.id ?? "").trim();
  if (id === "") return null;

  const endpoints = (modelo.supported_endpoints ?? []).map((endpoint) =>
    endpoint.trim(),
  );
  if (!endpoints.includes("/chat/completions")) return null;

  const nome = (modelo.name ?? "").trim();
  const textoDoModelo = (id + " " + nome).toLowerCase();

  return {
    provider: FONTE_COMMANDCODE,
    model_id: id,
    display_name: nome || id,
    description: null,
    context_window:
      typeof modelo.context_length === "number" &&
      Number.isFinite(modelo.context_length)
        ? modelo.context_length
        : null,
    input_price_per_million_cents: null,
    output_price_per_million_cents: null,
    // O endpoint não fornece esta coluna. Para modelos Chat Completions, a
    // própria API aceita function tools e o cliente executa as ferramentas.
    supports_tools: true,
    supports_vision: /vision|omni/.test(textoDoModelo),
    source: FONTE_COMMANDCODE,
  };
}

export function traduzirCatalogoCommandCode(
  modelos: readonly ModeloDoCommandCode[],
): LinhaDeCatalogo[] {
  const porId = new Map<string, LinhaDeCatalogo>();
  for (const modelo of modelos) {
    const linha = traduzirModeloCommandCode(modelo);
    if (linha !== null) porId.set(linha.model_id, linha);
  }
  return [...porId.values()];
}

/**
 * Busca o catálogo usando a chave já validada da organização. A chave vive
 * apenas no escopo desta chamada e nunca entra no retorno ou no log.
 */
export async function buscarCatalogoCommandCode(
  apiKey: string,
): Promise<ModeloDoCommandCode[]> {
  const resposta = await fetch(ENDPOINT_DO_CATALOGO_COMMANDCODE, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: "application/json",
      Authorization: "Bearer " + apiKey,
    },
  });
  if (!resposta.ok) {
    throw new Error("catalogo_commandcode_status_" + resposta.status);
  }
  const json = (await resposta.json()) as { data?: ModeloDoCommandCode[] };
  if (!Array.isArray(json.data)) {
    throw new Error(
      "catalogo_commandcode_shape_inesperado — a resposta não trouxe data como lista",
    );
  }
  return json.data;
}
