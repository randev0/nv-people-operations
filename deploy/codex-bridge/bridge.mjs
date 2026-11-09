#!/usr/bin/env node
// People Operations — Codex bridge.
// Runs as the dedicated, unprivileged `peopleops-ai` user with its OWN Codex login
// (separate CODEX_HOME, separate token session). Listens only on a unix socket that
// the app's group can reach. Each request runs one locked-down, ephemeral `codex exec`:
// read-only sandbox, shell/exec/browser/apps/plugins disabled, no web search, empty
// working directory, strict JSON output schema. Nothing about the app is readable by
// this user (env file and app directory are not accessible to it).
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOCKET = process.env.BRIDGE_SOCKET ?? "/run/peopleops-ai/bridge.sock";
const MODEL = process.env.CODEX_MODEL ?? "gpt-6.1-sol";
const TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS ?? 45_000);
const MAX_CONCURRENT = Number(process.env.CODEX_MAX_CONCURRENT ?? 2);
const DISABLED = ["shell_tool", "unified_exec", "apps", "plugins", "browser_use", "browser_use_external", "in_app_browser", "computer_use", "view_image", "skill_mcp_dependency_install", "tool_suggest"];

let running = 0;

function runCodex(prompt, schema) {
  return new Promise(async (resolve) => {
    const dir = await mkdtemp(join(tmpdir(), "po-ai-"));
    const schemaFile = join(dir, "schema.json");
    const outFile = join(dir, "out.txt");
    const work = join(dir, "work");
    await writeFile(schemaFile, JSON.stringify(schema));
    await mkdir(work);
    const args = [
      "exec", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
      "-s", "read-only", "-m", MODEL, "-C", work,
      "-c", 'approval_policy="never"', "-c", 'web_search="disabled"',
      ...DISABLED.flatMap((f) => ["--disable", f]),
      "--output-schema", schemaFile, "-o", outFile, "-",
    ];
    const child = spawn("codex", args, { cwd: work, stdio: ["pipe", "ignore", "pipe"], env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME } });
    let stderr = "";
    child.stderr.on("data", (d) => { if (stderr.length < 4000) stderr += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.on("close", async (code, signal) => {
      clearTimeout(timer);
      let text = null;
      try { text = await readFile(outFile, "utf8"); } catch { /* no output */ }
      await rm(dir, { recursive: true, force: true });
      if (signal === "SIGKILL") return resolve({ ok: false, reason: "TIMEOUT" });
      if (code !== 0 || !text) {
        console.error(JSON.stringify({ event: "codex.fail", code, stderrTail: stderr.slice(-400).replace(/\s+/g, " ") }));
        return resolve({ ok: false, reason: "PROVIDER_ERROR" });
      }
      try { resolve({ ok: true, output: JSON.parse(text) }); } catch { resolve({ ok: false, reason: "NO_STRUCTURED_OUTPUT" }); }
    });
    child.stdin.end(prompt);
  });
}

const server = http.createServer((req, res) => {
  const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "GET" && req.url === "/health") return send(200, { status: "ok", model: MODEL });
  if (req.method !== "POST" || req.url !== "/suggest") return send(404, { error: "not found" });
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 64_000) req.destroy(); });
  req.on("end", async () => {
    let body;
    try { body = JSON.parse(raw); } catch { return send(400, { ok: false, reason: "BAD_REQUEST" }); }
    if (typeof body.system !== "string" || typeof body.user !== "string" || typeof body.schema !== "object") return send(400, { ok: false, reason: "BAD_REQUEST" });
    if (running >= MAX_CONCURRENT) return send(200, { ok: false, reason: "PROVIDER_ERROR" });
    running++;
    const started = Date.now();
    try {
      const prompt = `${body.system}\n\n${body.user}\n\nRespond only with the JSON object required by the output schema. Do not run commands or read files.`;
      const result = await runCodex(prompt, body.schema);
      console.info(JSON.stringify({ event: "codex.suggest", ms: Date.now() - started, ok: result.ok, reason: result.reason }));
      send(200, result);
    } finally { running--; }
  });
});

try { await unlink(SOCKET); } catch { /* none */ }
server.listen(SOCKET, async () => {
  await chmod(SOCKET, 0o660); // group (peopleops) may connect; others may not
  console.info(JSON.stringify({ event: "bridge.listening", socket: SOCKET, model: MODEL }));
});
