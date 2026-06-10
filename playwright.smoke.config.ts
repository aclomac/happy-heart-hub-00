import { defineConfig, devices } from "@playwright/test";

/**
 * Lightweight smoke config for Phase 10 publish readiness.
 *
 * Unlike the full E2E config, this one:
 *   - requires only E2E_BASE_URL (no Supabase service role key, no seeded company)
 *   - has no globalSetup / storageState — every spec logs in itself with demo creds
 *   - runs only the specs under e2e/smoke/
 *
 * Demo credentials default to the seeded demo admin and can be overridden via
 * E2E_DEMO_EMAIL / E2E_DEMO_PASSWORD.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const useExternal = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e/smoke",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-smoke", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "smoke", use: { ...devices["Desktop Chrome"] } }],
  webServer: useExternal
    ? undefined
    : {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
