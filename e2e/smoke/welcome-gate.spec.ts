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

test.describe("/welcome mode persistence across reloads", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const mode of ["local", "cloud"] as const) {
    test(`${mode} mode survives full reload and keeps routing away from /welcome`, async ({
      page,
    }) => {
      await clearLaunchMode(page);

      // 1. Pick the mode via the chooser UI.
      await page.goto("/welcome");
      const label = mode === "local" ? /continue with local/i : /continue with cloud/i;
      await page.getByRole("button", { name: label }).click();
      await page.waitForURL(/\/signup$/, { timeout: 15_000 });

      // 2. Hard reload — full browser reload, not SPA navigation.
      await page.reload({ waitUntil: "domcontentloaded" });

      // Flag must still be in localStorage.
      const afterReload = await page.evaluate(() =>
        window.localStorage.getItem("erpovo:launch-mode"),
      );
      expect(afterReload).toBe(mode);

      // 3. Going back to /welcome directly must NOT show the chooser —
      //    the gate redirects away because a mode is already chosen.
      await page.goto("/login");
      await page.waitForURL(/\/login$/, { timeout: 15_000 });
      await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10_000 });

      await page.goto("/signup");
      await page.waitForURL(/\/signup$/, { timeout: 15_000 });

      // 4. Protected /app no longer redirects to /welcome (anon-with-mode → /login).
      await page.goto("/app/items");
      await page.waitForURL(/\/login$/, { timeout: 15_000 });

      // Confirm the flag is still there after all those navigations.
      const finalValue = await page.evaluate(() =>
        window.localStorage.getItem("erpovo:launch-mode"),
      );
      expect(finalValue).toBe(mode);
    });
  }
});

test.describe("/welcome mode persistence across logout", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("chosen mode survives logout and next login skips /welcome", async ({ page }) => {
    await clearLaunchMode(page);

    // 1. Pick Cloud via the chooser.
    await page.goto("/welcome");
    await page.getByRole("button", { name: /continue with cloud/i }).click();
    await page.waitForURL(/\/signup$/, { timeout: 15_000 });

    // 2. Log in as demo (this establishes an authenticated session).
    await loginAsDemo(page);
    await page.waitForURL((url) => url.pathname.startsWith("/app"), {
      timeout: 30_000,
    });

    // Confirm the launch-mode flag survived the login.
    const afterLogin = await page.evaluate(() =>
      window.localStorage.getItem("erpovo:launch-mode"),
    );
    expect(afterLogin).toBe("cloud");

    // 3. Log out — clear all auth-related state but preserve launch-mode.
    await page.evaluate(() => {
      const keep = window.localStorage.getItem("erpovo:launch-mode");
      // Clear Supabase session + demo session + everything else.
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k !== "erpovo:launch-mode") keysToRemove.push(k);
      }
      for (const k of keysToRemove) window.localStorage.removeItem(k);
      // Defensive: re-set the preserved value in case of races.
      if (keep) window.localStorage.setItem("erpovo:launch-mode", keep);
    });
    // Clear cookies too so Supabase auth-cookie based sessions are gone.
    await page.context().clearCookies();

    // 4. Hard reload — we're now unauthenticated but with mode chosen.
    await page.reload({ waitUntil: "domcontentloaded" });

    const afterLogout = await page.evaluate(() =>
      window.localStorage.getItem("erpovo:launch-mode"),
    );
    expect(afterLogout).toBe("cloud");

    // 5. Visiting /welcome directly now: protected /app should send
    //    anon-with-mode to /login (NOT /welcome).
    await page.goto("/app/items");
    await page.waitForURL(/\/login$/, { timeout: 15_000 });

    // 6. Next login flow: /login is reachable directly, no /welcome gate.
    await page.goto("/login");
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10_000 });

    // 7. Actually log back in and confirm we land in /app, not /welcome.
    await loginAsDemo(page);
    await page.waitForURL((url) => url.pathname.startsWith("/app"), {
      timeout: 30_000,
    });
    expect(page.url()).not.toMatch(/\/welcome/);

    const finalValue = await page.evaluate(() =>
      window.localStorage.getItem("erpovo:launch-mode"),
    );
    expect(finalValue).toBe("cloud");
  });
});

test.describe("/welcome mode cleared on logout", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("clearing launch-mode on logout forces next login through /welcome", async ({
    page,
  }) => {
    await clearLaunchMode(page);

    // 1. Pick Local via the chooser, then log in as demo.
    await page.goto("/welcome");
    await page.getByRole("button", { name: /continue with local/i }).click();
    await page.waitForURL(/\/signup$/, { timeout: 15_000 });

    await loginAsDemo(page);
    await page.waitForURL((url) => url.pathname.startsWith("/app"), {
      timeout: 30_000,
    });

    const afterLogin = await page.evaluate(() =>
      window.localStorage.getItem("erpovo:launch-mode"),
    );
    expect(afterLogin).toBe("local");

    // 2. Log out AND delete the launch-mode flag (simulating "reset device"
    //    or a full logout that wipes the first-launch choice).
    await page.evaluate(() => {
      window.localStorage.clear();
    });
    await page.context().clearCookies();
    await page.reload({ waitUntil: "domcontentloaded" });

    const afterLogout = await page.evaluate(() =>
      window.localStorage.getItem("erpovo:launch-mode"),
    );
    expect(afterLogout).toBeNull();

    // 3. /login and /signup must now redirect back to /welcome.
    await page.goto("/login");
    await page.waitForURL(/\/welcome$/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /how should we store your data/i }),
    ).toBeVisible();

    await page.goto("/signup");
    await page.waitForURL(/\/welcome$/, { timeout: 15_000 });

    // 4. Protected /app routes also redirect to /welcome (not /login).
    await page.goto("/app/items");
    await page.waitForURL(/\/welcome$/, { timeout: 15_000 });

    // 5. Pick a (different) mode and proceed; next login lands in /app.
    await page.getByRole("button", { name: /continue with cloud/i }).click();
    await page.waitForURL(/\/signup$/, { timeout: 15_000 });

    const reChosen = await page.evaluate(() =>
      window.localStorage.getItem("erpovo:launch-mode"),
    );
    expect(reChosen).toBe("cloud");

    await loginAsDemo(page);
    await page.waitForURL((url) => url.pathname.startsWith("/app"), {
      timeout: 30_000,
    });
    expect(page.url()).not.toMatch(/\/welcome/);
  });
});


