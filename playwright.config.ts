import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const useExternal = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e/specs",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "owner",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/owner.json" },
    },
    {
      name: "user",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    },
  ],
  globalSetup: "./e2e/fixtures/global-setup.ts",
  globalTeardown: "./e2e/fixtures/global-teardown.ts",
  webServer: useExternal
    ? undefined
    : {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
