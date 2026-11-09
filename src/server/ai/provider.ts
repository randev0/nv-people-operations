import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { toolInputJsonSchema } from "./schema";

export type ProviderResult =
  | { ok: true; toolInput: unknown }
  | { ok: false; reason: "UNCONFIGURED" | "TIMEOUT" | "PROVIDER_ERROR" | "NO_TOOL_OUTPUT" };

export interface RoutingProvider {
  suggest(system: string, user: string): Promise<ProviderResult>;
}

export const TOOL_NAME = "submit_routing_suggestion";

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
        const msg = await client.messages.create({
          model,
          max_tokens: 400,
          temperature: 0,
          system,
          messages: [{ role: "user", content: user }],
          tools: [
            {
              name: TOOL_NAME,
              description: "Return the routing suggestion for the request.",
              input_schema: toolInputJsonSchema as unknown as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: TOOL_NAME },
        });
        const block = msg.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
        if (!block || block.type !== "tool_use") return { ok: false, reason: "NO_TOOL_OUTPUT" };
        return { ok: true, toolInput: block.input };
      } catch (err) {
        if (err instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: "TIMEOUT" };
        return { ok: false, reason: "PROVIDER_ERROR" };
      }
    },
  };
}
