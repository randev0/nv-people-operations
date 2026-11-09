/**
 * Deterministic stand-in for the Codex bridge, used only by the integration/e2e runner.
 * It speaks the same unix-socket protocol as deploy/codex-bridge/bridge.mjs, so the
 * app's real provider → validation → storage path is exercised without a live model.
 * Behaviour is chosen by the request title:
 *   "[ai-fail] …"    → provider failure
 *   "[ai-invalid] …" → output with invented IDs (must be rejected by the app)
 *   "[ai-slow] …"    → never answers in time (app timeout path)
 *   anything else     → valid suggestion built from the allowed options in the prompt
 */
import http from "node:http";

type Options = {
  categories: { id: string; code: string; defaultDepartmentId: string }[];
  departments: { id: string; name: string }[];
  candidates: { id: string; departmentId: string }[];
};

export function startFakeBridge(socketPath: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (b: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(b));
      };
      const { user } = JSON.parse(raw) as { user: string };
      const title = /Title: (.*)/.exec(user)?.[1] ?? "";
      if (title.startsWith("[ai-fail]")) return send({ ok: false, reason: "PROVIDER_ERROR" });
      if (title.startsWith("[ai-slow]")) {
        setTimeout(() => { if (!res.writableEnded && !res.destroyed) send({ ok: false, reason: "TIMEOUT" }); }, 10_000);
        return;
      }
      const opts = JSON.parse(user.split("\n")[1]) as Options;
      if (title.startsWith("[ai-invalid]")) {
        return send({ ok: true, output: { categoryId: "invented", priority: "HIGH", suggestedDepartmentId: "nope", suggestedAssigneeId: "admin", explanation: "x" } });
      }
      const cat = opts.categories.find((c) => c.code === "IT_EQUIPMENT") ?? opts.categories[0];
      const person = opts.candidates.find((c) => c.departmentId === cat.defaultDepartmentId) ?? null;
      send({
        ok: true,
        output: {
          categoryId: cat.id,
          priority: "HIGH",
          suggestedDepartmentId: cat.defaultDepartmentId,
          suggestedAssigneeId: person?.id ?? null,
          explanation: "Deterministic test suggestion: hardware problem blocking work.",
        },
      });
    });
  });
  return new Promise((resolve) => server.listen(socketPath, () => resolve(server)));
}
