import { test, expect } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "./helpers";

/**
 * Phase 10 publish-readiness smoke suite. Each test attaches a console +
 * pageerror + network-failure watcher and asserts the bag is empty.
 */

const CORE_ROUTES = [
  "/app",
  "/app/parties",
  "/app/items",
  "/app/sales",
  "/app/sales/new",
  "/app/sale-orders",
  "/app/sale-orders/new",
  "/app/pos",
  "/app/purchases",
  "/app/purchases/new",
  "/app/expenses",
  "/app/expenses/new",
  "/app/cash",
  "/app/reports/inventory",
  "/app/payroll",
  "/app/reports",
  "/app/settings",
  "/app/subscription",
  "/app/audit",
  "/app/recycle-bin",
];

test.describe("Login page smoke", () => {
  test("login page renders cleanly", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 15_000 });
    expect(bag.all()).toEqual([]);
  });
});

test.describe("Demo login & dashboard smoke", () => {
  test("logs in as demo admin and lands inside the app", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await loginAsDemo(page);
    await ensureInsideApp(page);
    expect(page.url()).toMatch(/\/app(\/|$)/);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    expect(bag.all()).toEqual([]);
  });

  test("dashboard shows sidebar/nav chrome on desktop", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await loginAsDemo(page);
    await ensureInsideApp(page);
    await page.goto("/app");
    await expect(page.locator("aside, nav").first()).toBeVisible({ timeout: 15_000 });
    expect(bag.all()).toEqual([]);
  });

  test("topbar Add Sale click opens the sale invoice form", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await loginAsDemo(page);
    await ensureInsideApp(page);
    await page.goto("/app");
    await expect(page.locator("header").getByRole("link", { name: /^add sale$/i })).toBeVisible({
      timeout: 15_000,
    });

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/app/sales/new", { timeout: 15_000 }),
      page
        .locator("header")
        .getByRole("link", { name: /^add sale$/i })
        .click(),
    ]);

    await expect(page.getByRole("heading", { name: /new sale invoice/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /save invoice/i })).toBeVisible();
    expect(page.url()).toContain("/app/sales/new");
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});

test.describe("Sale Order smoke", () => {
  test("Sale Orders list opens and New Sale Order form renders fields", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await loginAsDemo(page);
    await ensureInsideApp(page);

    await page.goto("/app/sale-orders", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /sale orders/i })).toBeVisible({
      timeout: 15_000,
    });

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/app/sale-orders/new", { timeout: 15_000 }),
      page
        .getByRole("link", { name: /add sale order/i })
        .first()
        .click(),
    ]);

    await expect(page.getByRole("heading", { name: /new sale order/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /save sale order/i })).toBeVisible();
    // No payment block on Sale Orders (no stock/cash impact until invoice).
    await expect(page.getByText(/received/i)).toHaveCount(0);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});

test.describe("Core route smoke", () => {
  test("every core route renders without crashes or failed requests", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await loginAsDemo(page);
    await ensureInsideApp(page);

    const failures: string[] = [];
    for (const route of CORE_ROUTES) {
      const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      if (resp && resp.status() >= 500) {
        failures.push(`${route} → HTTP ${resp.status()}`);
        continue;
      }
      const bodyText =
        (await page
          .locator("body")
          .innerText()
          .catch(() => "")) || "";
      if (bodyText.trim().length < 5) failures.push(`${route} → empty body`);
      // let async queries flush so request failures attribute to the right route
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    }

    expect(failures, failures.join("\n")).toEqual([]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});

test.describe("Mobile responsive smoke", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("dashboard fits mobile viewport with no overflow or errors", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await loginAsDemo(page);
    await ensureInsideApp(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});
