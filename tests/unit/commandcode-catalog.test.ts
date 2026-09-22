import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";

import { createDefaultRegistry } from "@/lib/agent-engine/edge/llm/providers";
import {
  traduzirCatalogoCommandCode,
  type ModeloDoCommandCode,
} from "@/lib/ai/catalogo/commandcode";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Command Code", () => {
  it("usa Chat Completions para o loop de ferramentas", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(
          typeof input === "string" || input instanceof URL
            ? String(input)
            : input.url,
        );
        return new Response(
          JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "ok" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await generateText({
      model: createDefaultRegistry().commandcode!(
        "k",
        "deepseek/deepseek-v4-flash",
      ),
      prompt: "oi",
      maxRetries: 0,
    });

    expect(urls).toEqual([
      "https://api.commandcode.ai/provider/v1/chat/completions",
    ]);
  });

  it("lista somente modelos com wire Chat Completions e marca tools", () => {
    const modelos: ModeloDoCommandCode[] = [
      {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        context_length: 1000000,
        supported_endpoints: ["/chat/completions", "/responses"],
      },
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        supported_endpoints: ["/messages"],
      },
    ];

    expect(traduzirCatalogoCommandCode(modelos)).toEqual([
      {
        provider: "commandcode",
        model_id: "deepseek/deepseek-v4-flash",
        display_name: "DeepSeek V4 Flash",
        description: null,
        context_window: 1000000,
        input_price_per_million_cents: null,
        output_price_per_million_cents: null,
        supports_tools: true,
        supports_vision: false,
        source: "commandcode",
      },
    ]);
  });
});
