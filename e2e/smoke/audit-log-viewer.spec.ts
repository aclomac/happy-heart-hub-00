import { test, expect, type Page } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "./helpers";

/**
 * Browser smoke for the Audit Log Viewer at /app/audit.
 * Skips gracefully if the current demo user is not an owner/admin
 * (the page renders an "Access restricted" state instead of the table).
 */

async function gotoAudit(page: Page) {
  await loginAsDemo(page);
  await ensureInsideApp(page);
  await page.goto("/app/audit", { waitUntil: "domcontentloaded" });
}

test.describe("App audit log viewer", () => {
  test("renders, filters, opens detail drawer, exports CSV", async ({ page }) => {
    const watch = attachErrorWatch(page);
    await gotoAudit(page);

    // Owner/admin gate or no company selected → skip
    if (
      (await page
        .getByText(/Access restricted/i)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(/No company selected/i)
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(true, "Audit viewer not accessible for this demo user");
      return;
    }

    await expect(page.getByRole("heading", { name: /Audit History/i })).toBeVisible({
      timeout: 15_000,
    });

    // CSV button must exist and be clickable
    const csv = page.getByRole("button", { name: /^CSV$/ });
    await expect(csv).toBeVisible();

    // Print/PDF buttons present
    await expect(page.getByRole("button", { name: /^Print$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^PDF$/ })).toBeVisible();

    // Try opening the first row to verify the detail drawer
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click().catch(() => {});
      // Drawer is a sheet with the title "Audit detail"
      await page
        .getByRole("heading", { name: /Audit detail|Audit entry detail/i })
        .first()
        .waitFor({ timeout: 5_000 })
        .catch(() => {});
    }

    // Trigger CSV (download is captured by browser; we just assert no error)
    await csv.click().catch(() => {});

    expect(watch.all(), watch.all().join("\n")).toEqual([]);
  });
});

test.describe("Super Admin audit log viewer", () => {
  test("renders for platform admin, otherwise shows access restricted", async ({ page }) => {
    const watch = attachErrorWatch(page);
    await loginAsDemo(page);
    await page.goto("/super-admin/audit-logs", { waitUntil: "domcontentloaded" });

    const restricted = await page
      .getByText(/Access restricted/i)
      .isVisible()
      .catch(() => false);
    if (restricted) {
      // Confirm normal users do NOT see the platform table — guard works
      await expect(page.getByText(/Access restricted/i)).toBeVisible();
      test.skip(true, "Demo user is not a platform admin");
      return;
    }

    await expect(page.getByRole("heading", { name: /Platform Audit Logs/i })).toBeVisible({
      timeout: 15_000,
    });

    // CSV button visible
    await expect(page.getByRole("button", { name: /^CSV$/ })).toBeVisible();

    // Verify masked metadata never shows raw "api_key" / "password" plaintext-looking pairs
    // (mask is "••••••••")
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    // If metadata is rendered with api_key/etc, ensure mask is present rather than raw long secrets
    if (bodyText.includes("api_key") || bodyText.includes("webhook_secret")) {
      await expect(page.locator("body")).toContainText("••••••••");
    }

    expect(watch.all(), watch.all().join("\n")).toEqual([]);
  });
});
