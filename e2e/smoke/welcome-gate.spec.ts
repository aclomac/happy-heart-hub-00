import { test, expect } from "@playwright/test";
import { attachErrorWatch, loginAsDemo } from "./helpers";

/**
 * /welcome first-launch chooser gating.
 *
 * Verifies:
 *  - anon visitor with no launch-mode chosen is redirected from
 *    /login and /signup to /welcome
 *  - anon visitor with launch-mode set reaches /login and /signup directly
 *  - authenticated demo user visiting /welcome is sent to /app
 *  - clicking a chooser tile persists the mode and routes to /signup
 *  - protected /app routes redirect anon-without-mode to /welcome
 */

async function clearLaunchMode(page: import("@playwright/test").Page) {
  // Ensure we're on the app origin before touching localStorage.
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("erpovo:launch-mode");
    window.localStorage.removeItem("erpovo:demo-session");
  });
}

async function presetLaunchMode(
  page: import("@playwright/test").Page,
  mode: "local" | "cloud",
) {
  await page.goto("/");
  await page.evaluate((m) => {
    window.localStorage.setItem("erpovo:launch-mode", m);
  }, mode);
}

test.describe("/welcome first-launch gate", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("anon + no mode: /login redirects to /welcome", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await clearLaunchMode(page);

    await page.goto("/login");
    await page.waitForURL(/\/welcome$/, { timeout: 15_000 });

    await expect(
      page.getByRole("heading", { name: /how should we store your data/i }),
    ).toBeVisible();
    expect(bag.all()).toEqual([]);
  });

  test("anon + no mode: /signup redirects to /welcome", async ({ page }) => {
    await clearLaunchMode(page);
    await page.goto("/signup");
    await page.waitForURL(/\/welcome$/, { timeout: 15_000 });
  });

  test("anon + no mode: protected /app redirects to /welcome", async ({ page }) => {
    await clearLaunchMode(page);
    await page.goto("/app/items");
    await page.waitForURL(/\/welcome$/, { timeout: 15_000 });
  });

  test("anon + mode set: /login is reachable directly", async ({ page }) => {
    await presetLaunchMode(page, "cloud");
    await page.goto("/login");
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10_000 });
  });

  test("anon + mode set: /signup is reachable directly", async ({ page }) => {
    await presetLaunchMode(page, "local");
    await page.goto("/signup");
    await page.waitForURL(/\/signup$/, { timeout: 15_000 });
  });

  test("choosing Local persists mode and routes to /signup", async ({ page }) => {
    await clearLaunchMode(page);
    await page.goto("/welcome");
    await page.getByRole("button", { name: /continue with local/i }).click();
    await page.waitForURL(/\/signup$/, { timeout: 15_000 });

    const stored = await page.evaluate(() =>
      window.localStorage.getItem("erpovo:launch-mode"),
    );
    expect(stored).toBe("local");
  });

  test("choosing Cloud persists mode and routes to /signup", async ({ page }) => {
    await clearLaunchMode(page);
    await page.goto("/welcome");
    await page.getByRole("button", { name: /continue with cloud/i }).click();
    await page.waitForURL(/\/signup$/, { timeout: 15_000 });

    const stored = await page.evaluate(() =>
      window.localStorage.getItem("erpovo:launch-mode"),
    );
    expect(stored).toBe("cloud");
  });
});

test.describe("/welcome with authenticated session", () => {
  test("authenticated demo user visiting /welcome → /app", async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForURL((url) => url.pathname.startsWith("/app"), {
      timeout: 30_000,
    });

    await page.goto("/welcome");
    await page.waitForURL(/\/app(\/|$)/, { timeout: 15_000 });
    expect(page.url()).not.toMatch(/\/welcome$/);
  });
});
