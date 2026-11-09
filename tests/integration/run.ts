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
  ANTHROPIC_API_KEY: "", // AI provider is never called by integration tests
  LOGIN_RATE_LIMIT: "10",
  AI_RATE_LIMIT_PER_MINUTE: "3",
};
(env as Record<string, string>).NODE_ENV = "production";

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
      const t = spawnSync("npx", ["playwright", "test", ...files], { env: { ...env, BASE_URL: `http://localhost:${PORT}` }, stdio: "inherit" });
      process.exitCode = t.status ?? 1;
      return;
    }
    if (!files.length) files.push("tests/integration");
    const t = spawnSync("npx", ["tsx", "--test", "--test-concurrency=1", ...files.map((f) => (f.endsWith(".ts") ? f : `${f}/*.test.ts`))], {
      env: { ...env, BASE_URL: `http://localhost:${PORT}` },
      stdio: "inherit",
      shell: true,
    });
    process.exitCode = t.status ?? 1;
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
