import "server-only";
import http from "node:http";
import { outputJsonSchema } from "./schema";
import type { ProviderResult, RoutingProvider } from "./provider";

/** The bridge kills codex at 45 s; the app gives up slightly later. Overridable for tests. */
const timeoutMs = () => Number(process.env.CODEX_BRIDGE_TIMEOUT_MS ?? 50_000);

type Requester = (socketPath: string, body: string) => Promise<{ status: number; text: string }>;

const unixRequest: Requester = (socketPath, body) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path: "/suggest", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }, timeout: timeoutMs() },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
    req.on("error", reject);
    req.end(body);
  });

/**
 * Talks to the local Codex bridge (deploy/codex-bridge), which runs `codex exec` as a
 * separate unprivileged user with its own credentials. The app never sees them.
 */
export function codexBridgeProvider(socketPath = process.env.CODEX_BRIDGE_SOCKET || "", request: Requester = unixRequest): RoutingProvider {
  return {
    async suggest(system, user): Promise<ProviderResult> {
      if (!socketPath) return { ok: false, reason: "UNCONFIGURED" };
      try {
        const res = await request(socketPath, JSON.stringify({ system, user, schema: outputJsonSchema }));
        if (res.status !== 200) return { ok: false, reason: "PROVIDER_ERROR" };
        const parsed = JSON.parse(res.text) as ProviderResult;
        if (parsed && typeof parsed === "object" && "ok" in parsed) {
          if (parsed.ok) return { ok: true, output: parsed.output };
          const reasons = ["UNCONFIGURED", "TIMEOUT", "PROVIDER_ERROR", "NO_STRUCTURED_OUTPUT"] as const;
          return { ok: false, reason: reasons.includes(parsed.reason) ? parsed.reason : "PROVIDER_ERROR" };
        }
        return { ok: false, reason: "PROVIDER_ERROR" };
      } catch (err) {
        return { ok: false, reason: (err as Error)?.name === "TimeoutError" ? "TIMEOUT" : "PROVIDER_ERROR" };
      }
    },
  };
}
