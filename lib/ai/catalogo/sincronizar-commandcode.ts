/**
 * Sincroniza o catálogo autenticado do Command Code em ai_models.
 *
 * A tabela é global por desenho: o catálogo descreve modelos do provedor, não
 * dados de uma organização. A chave usada para ler /models continua sendo
 * descartada no fim da chamada e nunca é escrita no catálogo.
 */
import type { createAdminClient } from "@/lib/supabase/admin";

import {
  buscarCatalogoCommandCode,
  FONTE_COMMANDCODE,
  traduzirCatalogoCommandCode,
} from "./commandcode";
import {
  CatalogoSuspeitoError,
  planejarSincronizacao,
  type ModeloExistente,
} from "./sincronizar";

export interface ResultadoDaSincronizacaoCommandCode {
  fonte: string;
  recebidos: number;
  gravados: number;
  depreciados: number;
  ressuscitados: number;
}

export async function sincronizarCatalogoCommandCode(
  admin: ReturnType<typeof createAdminClient>,
  apiKey: string,
): Promise<ResultadoDaSincronizacaoCommandCode> {
  const linhas = traduzirCatalogoCommandCode(
    await buscarCatalogoCommandCode(apiKey),
  );

  const { data: existentes, error: erroLeitura } = await admin
    .from("ai_models")
    .select("model_id, deprecated_at")
    .eq("source", FONTE_COMMANDCODE);
  if (erroLeitura) {
    throw new Error("catalogo_commandcode_leitura_falhou: " + erroLeitura.message);
  }

  const plano = planejarSincronizacao(
    linhas,
    (existentes ?? []) as ModeloExistente[],
  );
  const agora = new Date().toISOString();

  if (plano.paraGravar.length > 0) {
    const { error } = await admin.from("ai_models").upsert(
      plano.paraGravar.map((linha) => ({
        ...linha,
        synced_at: agora,
        deprecated_at: null,
      })),
      { onConflict: "provider,model_id" },
    );
    if (error) {
      throw new Error(
        "catalogo_commandcode_upsert_falhou: " + error.message,
      );
    }
  }

  if (plano.paraDepreciar.length > 0) {
    const { error } = await admin
      .from("ai_models")
      .update({ deprecated_at: agora })
      .eq("source", FONTE_COMMANDCODE)
      .in("model_id", plano.paraDepreciar);
    if (error) {
      throw new Error(
        "catalogo_commandcode_depreciacao_falhou: " + error.message,
      );
    }
  }

  return {
    fonte: FONTE_COMMANDCODE,
    recebidos: linhas.length,
    gravados: plano.paraGravar.length,
    depreciados: plano.paraDepreciar.length,
    ressuscitados: plano.paraRessuscitar.length,
  };
}

export function catalogoCommandCodeIndisponivel(err: unknown): string {
  if (err instanceof CatalogoSuspeitoError) return "catalogo_suspeito";
  return err instanceof Error ? err.message : String(err);
}
