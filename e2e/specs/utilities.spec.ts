import { test, expect } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "../smoke/helpers";

/**
 * Utilities smoke: every card on /app/utilities must respond — either navigate
 * to a real utility route, or surface a "Coming soon" toast for intentionally
 * disabled actions. Fails on console/page/network errors.
 */

const UTILITY_ROUTES = [
  "/app/utilities",
  "/app/utilities/import-items",
  "/app/utilities/import-parties",
  "/app/utilities/export-items",
  "/app/utilities/bulk-update-items",
  "/app/utilities/barcode-generator",
  "/app/utilities/close-financial-year",
];

test.describe("Utilities smoke", () => {
  test("every utility route renders cleanly", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await loginAsDemo(page);
    await ensureInsideApp(page);

    const failures: string[] = [];
    for (const route of UTILITY_ROUTES) {
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
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    }

    expect(failures, failures.join("\n")).toEqual([]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("coming-soon utilities surface a toast and do not navigate away", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await loginAsDemo(page);
    await ensureInsideApp(page);

    await page.goto("/app/utilities", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /utilities/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    for (const label of [/export to tally/i, /refer & earn/i]) {
      const card = page.getByRole("button", { name: label }).first();
      await card.click();
      // Toast surfaces "Coming soon" — assert at least one is present.
      await expect(page.getByText(/coming soon/i).first()).toBeVisible({ timeout: 5_000 });
      expect(page.url()).toContain("/app/utilities");
    }

    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});
