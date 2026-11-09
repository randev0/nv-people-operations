import "server-only";
import { env } from "../env";
import { outputJsonSchema } from "./schema";
import type { ProviderResult, RoutingProvider } from "./provider";

const ENDPOINT = "https://api.openai.com/v1/responses";
const ATTEMPT_TIMEOUT_MS = 7_000;

type ResponsesOutput = {
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
};

/** Extracts the structured JSON text from a Responses API payload. */
export function extractOutputText(body: ResponsesOutput): string | null {
  for (const item of body.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) if (c.type === "output_text" && c.text) return c.text;
  }
  return null;
}

/**
 * Server-only OpenAI adapter (Responses API, strict JSON-schema structured output).
 * Uses a platform API key (OPENAI_API_KEY) and the
 * model from OPENAI_MODEL. ~15 s budget: 7 s per attempt, one retry on 429/5xx/timeout.
 */
export function openaiProvider(fetchImpl: typeof fetch = fetch): RoutingProvider {
  return {
    async suggest(system, user): Promise<ProviderResult> {
      const apiKey = env.openaiKey();
      const model = env.openaiModel();
      if (!apiKey || !model) return { ok: false, reason: "UNCONFIGURED" };
      const body = JSON.stringify({
        model,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_output_tokens: 600,
        store: false,
        text: { format: { type: "json_schema", name: "routing_suggestion", schema: outputJsonSchema, strict: true } },
      });
      let last: ProviderResult = { ok: false, reason: "PROVIDER_ERROR" };
      for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
        try {
          const res = await fetchImpl(ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body,
            signal: ctrl.signal,
          });
          if (res.status === 429 || res.status >= 500) {
            last = { ok: false, reason: "PROVIDER_ERROR" };
            continue; // transient: one retry
          }
          if (!res.ok) return { ok: false, reason: "PROVIDER_ERROR" };
          const text = extractOutputText((await res.json()) as ResponsesOutput);
          if (!text) return { ok: false, reason: "NO_STRUCTURED_OUTPUT" };
          try {
            return { ok: true, output: JSON.parse(text) as unknown };
          } catch {
            return { ok: false, reason: "NO_STRUCTURED_OUTPUT" };
          }
        } catch (err) {
          last = { ok: false, reason: (err as Error)?.name === "AbortError" ? "TIMEOUT" : "PROVIDER_ERROR" };
        } finally {
          clearTimeout(timer);
        }
      }
      return last;
    },
  };
}
