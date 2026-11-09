/**
 * Integration test runner. Never resets an existing database: it creates a fresh,
 * uniquely named database on the TEST_DATABASE_URL server, applies migrations,
 * seeds it, starts the production build against it on port 3100, runs the HTTP
 * tests, stops the server and drops only the database it created in this run.
 * Requires `npm run build` first.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFakeBridge } from "./fake-bridge";

const testUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required");
if (testUrl === appUrl) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
if (!/test/i.test(new URL(testUrl).pathname)) throw new Error("Refusing: test database name must contain 'test'");

const PORT = 3100;
const runDb = `${new URL(testUrl).pathname.slice(1)}_run_${Date.now()}`;
const runUrl = (() => {
  const u = new URL(testUrl);
  u.pathname = `/${runDb}`;
  return u.toString();
})();
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: runUrl,
  APP_URL: `http://localhost:${PORT}`,
  ALLOW_ASSESSMENT_SEED: "true",
  DEMO_PASSWORD: process.env.DEMO_PASSWORD ?? "integration-test-password",
  ANTHROPIC_API_KEY: "", // no real AI provider in tests
  AI_PROVIDER: "codex", // points at the deterministic fake bridge below
  CODEX_BRIDGE_SOCKET: join(mkdtempSync(join(tmpdir(), "po-fake-bridge-")), "bridge.sock"),
  LOGIN_RATE_LIMIT: "10",
  AI_RATE_LIMIT_PER_MINUTE: "3",
};
(env as Record<string, string>).NODE_ENV = "production";

/**
 * Async child process. The runner hosts the fake AI bridge in-process, so the test
 * child must NOT be started with spawnSync (that blocks the event loop and the
 * bridge never answers — see WORKLOG 2026-11-09).
 */
function runAsync(cmd: string, args: string[], extraEnv: Record<string, string> = {}, shell = false): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...env, ...extraEnv }, stdio: "inherit", shell });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

async function main() {
  const admin = new PrismaClient({ datasources: { db: { url: testUrl } } });
  if (!/^[a-z0-9_]+$/.test(runDb)) throw new Error("unexpected database name");
  await admin.$executeRawUnsafe(`CREATE DATABASE "${runDb}"`);
  console.log(`Created run database ${runDb}`);
  try {
    await runSuite();
  } finally {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${runDb}" WITH (FORCE)`); // only the database created above
    await admin.$disconnect();
  }
}

async function runSuite() {
  const bridge = await startFakeBridge(env.CODEX_BRIDGE_SOCKET!);
  try {
    await runSuiteInner();
  } finally {
    bridge.close();
  }
}

async function runSuiteInner() {
  run("npx", ["prisma", "migrate", "deploy"]);
  run("npx", ["tsx", "prisma/seed.ts"]);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) break;
      } catch {
        /* not up yet */
      }
      await sleep(500);
    }
    const e2e = process.argv.includes("--e2e");
    const files = process.argv.slice(2).filter((a) => a !== "--e2e");
    if (e2e) {
      process.exitCode = await runAsync("npx", ["playwright", "test", ...files], { BASE_URL: `http://localhost:${PORT}` });
      return;
    }
    if (!files.length) files.push("tests/integration");
    process.exitCode = await runAsync(
      "npx",
      ["tsx", "--test", "--test-concurrency=1", ...files.map((f) => (f.endsWith(".ts") ? f : `${f}/*.test.ts`))],
      { BASE_URL: `http://localhost:${PORT}` },
      true,
    );
  } finally {
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {
      /* already stopped */
    }
    if (process.exitCode) console.error("--- server log (tail) ---\n" + log.split("\n").slice(-40).join("\n"));
  }
}

main();
