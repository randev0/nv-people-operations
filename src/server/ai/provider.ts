import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { outputJsonSchema } from "./schema";

export type ProviderResult =
  | { ok: true; output: unknown }
  | { ok: false; reason: "UNCONFIGURED" | "TIMEOUT" | "PROVIDER_ERROR" | "NO_STRUCTURED_OUTPUT" };

export interface RoutingProvider {
  suggest(system: string, user: string): Promise<ProviderResult>;
}

/** Server-only Anthropic adapter. Model id comes from ANTHROPIC_MODEL; no hardcoded model string. */
export function anthropicProvider(): RoutingProvider {
  return {
    async suggest(system, user) {
      const apiKey = env.anthropicKey();
      const model = env.anthropicModel();
      if (!apiKey || !model) return { ok: false, reason: "UNCONFIGURED" };
      // ~15s total budget: 7s per attempt, one SDK retry for transient errors.
      const client = new Anthropic({ apiKey, timeout: 7_000, maxRetries: 1 });
      try {
        // Structured outputs (output_config.format) constrain the reply to our JSON schema;
        // the result is still re-validated against live database IDs in router.ts.
        const msg = await client.messages.create({
          model,
          max_tokens: 600,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { format: { type: "json_schema", schema: outputJsonSchema } },
        });
        const text = msg.content.find((b) => b.type === "text");
        if (!text || text.type !== "text") return { ok: false, reason: "NO_STRUCTURED_OUTPUT" };
        try {
          return { ok: true, output: JSON.parse(text.text) as unknown };
        } catch {
          return { ok: false, reason: "NO_STRUCTURED_OUTPUT" };
        }
      } catch (err) {
        if (err instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: "TIMEOUT" };
        return { ok: false, reason: "PROVIDER_ERROR" };
      }
    },
  };
}
