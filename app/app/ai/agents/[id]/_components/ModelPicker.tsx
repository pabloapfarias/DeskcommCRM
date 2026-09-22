"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PROVEDORES } from "@/lib/ai/pontos/provedores";
import { useT } from "@/hooks/i18n/useT";

/**
 * Derivado de `lib/ai/pontos/provedores.ts` — a mesma lista única da tela de
 * Credenciais e da rota. Como literal aqui, o seletor de modelo do agente não
 * conseguia representar um agente publicado em OpenRouter.
 */
export type Provider = (typeof PROVEDORES)[number]["id"];

export interface ModelOption {
  provider: Provider;
  model_id: string;
  display_name: string;
  context_window: number | null;
  is_default_for_provider: boolean;
  /** Modelo salvo na versão, mas que ainda não aparece no catálogo local. */
  current_only?: boolean;
}

const EMPTY_MODELS: ModelOption[] = [];

interface Props {
  provider: Provider;
  value: string;
  onChange: (modelId: string, ctx?: { contextWindow: number | null }) => void;
  disabled?: boolean;
  id?: string;
  /**
   * Texto do estado "nada escolhido". Existe porque nem todo uso deste seletor
   * trata vazio como erro: no papel Operador, vazio SIGNIFICA "usa o mesmo
   * modelo que conversa", e chamar isso de "Selecione um modelo" mentiria.
   */
  placeholder?: string;
}

interface ApiResponse {
  data: { models: ModelOption[] };
}

export function ModelPicker({ provider, value, onChange, disabled, id, placeholder }: Props) {
  const t = useT();
  const query = useQuery({
    queryKey: ["ai", "providers", provider, "models"],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse>(`/api/v1/ai/providers/${provider}/models`);
      return res.data.models;
    },
    staleTime: 60_000,
  });

  const models = query.data ?? EMPTY_MODELS;
  const modeloAtualForaDoCatalogo =
    value.trim() !== "" && models.length > 0 && !models.some((m) => m.model_id === value);
  const opcoes = React.useMemo(() => {
    if (!modeloAtualForaDoCatalogo) return models;
    return [
      {
        provider,
        model_id: value,
        display_name: value,
        context_window: null,
        is_default_for_provider: false,
        current_only: true,
      },
      ...models,
    ];
  }, [modeloAtualForaDoCatalogo, models, provider, value]);

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{t("Modelo")}</Label>
      {models.length === 0 && !query.isLoading ? (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value, { contextWindow: null })}
          placeholder={t("Digite o identificador do modelo")}
          disabled={disabled}
        />
      ) : (
        <Select
          value={value || undefined}
          onValueChange={(v) => {
            const m = opcoes.find((m) => m.model_id === v);
            onChange(v, { contextWindow: m?.context_window ?? null });
          }}
          disabled={disabled || query.isLoading}
        >
          <SelectTrigger id={id}>
            <SelectValue
              placeholder={
                query.isLoading ? t("Carregando…") : (placeholder ?? t("Selecione um modelo"))
              }
            />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((m) => (
              <SelectItem key={m.model_id} value={m.model_id}>
                {m.display_name}
                {m.is_default_for_provider ? ` · ${t("default")}` : ""}
                {m.current_only ? ` · ${t("salvo fora do catálogo")}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {query.isError ? (
        <p className="text-xs text-destructive" role="status">
          {t(
            "Não foi possível carregar o catálogo de modelos. O identificador salvo ainda pode ser testado.",
          )}
        </p>
      ) : null}
      {modeloAtualForaDoCatalogo ? (
        <p
          className="text-xs text-amber-700 dark:text-amber-400"
          role="status"
          data-testid="modelo-fora-do-catalogo"
        >
          {t(
            "O modelo salvo não está no catálogo atual. Ele continua disponível para esta versão até o catálogo ser atualizado.",
          )}
        </p>
      ) : null}
    </div>
  );
}

export function useModelMeta(provider: Provider, modelId: string): ModelOption | null {
  const query = useQuery({
    queryKey: ["ai", "providers", provider, "models"],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse>(`/api/v1/ai/providers/${provider}/models`);
      return res.data.models;
    },
    staleTime: 60_000,
  });
  return (query.data ?? []).find((m) => m.model_id === modelId) ?? null;
}
