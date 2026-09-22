// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  crmSearchMarketplace,
  extrairCidadesMarketplace,
  extrairLojasMarketplace,
} from "./marketplace";

const CITIES_HTML =
  '<script type="application/ld+json">' +
  '{"@type":"ItemList","itemListElement":[' +
  '{"item":{"@type":"City","name":"Santa Juliana - MG","url":"https://ebig.food/delivery/santa-juliana-mg"}},' +
  '{"item":{"@type":"City","name":"Almeida Campos - MG","url":"https://ebig.food/delivery/almeida-campos-mg"}}' +
  "]}</script>";

const STORES_HTML =
  '<script type="application/ld+json">' +
  '{"@type":"ItemList","numberOfItems":2,"itemListElement":[' +
  '{"item":{"@type":"Restaurant","name":"Casa da mama hamburgueria","url":"https://wa.me/5534999098703"}},' +
  '{"item":{"@type":"Restaurant","name":"Bunker Burger e Brasa","url":"https://wa.me/5534996608765"}}' +
  "]}</script>";

describe("crm_search_marketplace", () => {
  it("lê cidades e lojas do JSON-LD público", () => {
    expect(extrairCidadesMarketplace(CITIES_HTML)).toEqual([
      {
        name: "Santa Juliana - MG",
        slug: "santa-juliana-mg",
        url: "https://ebig.food/delivery/santa-juliana-mg",
      },
      {
        name: "Almeida Campos - MG",
        slug: "almeida-campos-mg",
        url: "https://ebig.food/delivery/almeida-campos-mg",
      },
    ]);
    expect(extrairLojasMarketplace(STORES_HTML)).toEqual([
      {
        name: "Casa da mama hamburgueria",
        url: "https://wa.me/5534999098703",
        whatsapp: "https://wa.me/5534999098703",
      },
      {
        name: "Bunker Burger e Brasa",
        url: "https://wa.me/5534996608765",
        whatsapp: "https://wa.me/5534996608765",
      },
    ]);
  });

  it("resolve o nome da cidade, preserva a busca e limita o retorno", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      text: async () => (url.endsWith("/cidades") ? CITIES_HTML : STORES_HTML),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = (await crmSearchMarketplace.handler(
      { cidade: "Santa Juliana", termo: "burger", limite: 1 },
      undefined as never,
    )) as {
      ok: boolean;
      cidade: string;
      lojas: Array<{ name: string }>;
    };

    expect(resultado.ok).toBe(true);
    expect(resultado.cidade).toBe("Santa Juliana - MG");
    expect(resultado.lojas).toHaveLength(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://ebig.food/delivery/santa-juliana-mg?q=burger",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "text/html" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
