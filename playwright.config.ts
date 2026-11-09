import { defineConfig, devices } from "@playwright/test";

// Run through `npm run test:e2e`, which starts the production build on a fresh
// per-run database (tests/integration/run.ts --e2e) and sets BASE_URL.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
