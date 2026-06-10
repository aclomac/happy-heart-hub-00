import type { FullConfig } from "@playwright/test";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { requireEnv } from "../helpers/env";

async function saveStorageState(baseURL: string, email: string, password: string, outFile: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await Promise.all([
    page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 30_000 }),
    page.getByRole("button", { name: /sign in|log in|entrar/i }).click(),
  ]);

  await mkdir(path.dirname(outFile), { recursive: true });
  await context.storageState({ path: outFile });
  await browser.close();
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use.baseURL ?? process.env.E2E_BASE_URL ?? "http://localhost:8080";

  const required = [
    "E2E_OWNER_EMAIL",
    "E2E_OWNER_PASSWORD",
    "E2E_USER_EMAIL",
    "E2E_USER_PASSWORD",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_COMPANY_ID",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `[e2e] Missing required env vars: ${missing.join(", ")}.\n` +
        `      See e2e/README.md for setup. Use \`bash scripts/run-e2e.sh --skip-if-unconfigured\`\n` +
        `      from CI when these credentials are intentionally unavailable.`,
    );
  }

  const ownerEmail = requireEnv("E2E_OWNER_EMAIL");
  const ownerPassword = requireEnv("E2E_OWNER_PASSWORD");
  const userEmail = requireEnv("E2E_USER_EMAIL");
  const userPassword = requireEnv("E2E_USER_PASSWORD");

  const ownerFile = "e2e/.auth/owner.json";
  const userFile = "e2e/.auth/user.json";

  if (!existsSync(ownerFile) || process.env.E2E_FORCE_LOGIN === "1") {
    await saveStorageState(baseURL, ownerEmail, ownerPassword, ownerFile);
  }
  if (!existsSync(userFile) || process.env.E2E_FORCE_LOGIN === "1") {
    await saveStorageState(baseURL, userEmail, userPassword, userFile);
  }

  // Stash a marker for teardown to know setup ran
  await writeFile("e2e/.auth/.ready", new Date().toISOString());
}
