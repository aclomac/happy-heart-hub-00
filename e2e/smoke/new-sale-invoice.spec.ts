import { test, expect, type Page } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "./helpers";

/**
 * Smoke coverage for /app/sales/new — proves the Save Invoice button
 * is actually wired, validation toasts appear, the New Customer modal
 * opens (no permission block in personal/local mode), the item picker
 * adds a row, and a valid save lands on the Sale Invoices list.
 */

async function gotoNewSale(page: Page) {
  await loginAsDemo(page);
  await ensureInsideApp(page);
  await page.goto("/app/sales/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /new sale invoice/i })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("/app/sales/new", () => {
  test("page loads with Save Invoice button", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoNewSale(page);
    await expect(page.getByTestId("sales-test-click-btn")).toBeVisible();
    await expect(page.getByTestId("save-invoice-btn")).toBeVisible();
    await expect(page.getByTestId("save-invoice-btn-bottom")).toBeVisible();
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("TEST CLICK and Save Invoice fire immediate click feedback", async ({ page }) => {
    await gotoNewSale(page);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("TEST CLICK WORKS");
      await dialog.accept();
    });
    await page.getByTestId("sales-test-click-btn").click();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("SAVE_INVOICE_CLICKED");
      await dialog.accept();
    });
    await page.getByTestId("save-invoice-btn").click();
    await expect(page.getByText(/save invoice clicked/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("empty save shows validation toast", async ({ page }) => {
    await gotoNewSale(page);
    page.once("dialog", async (dialog) => await dialog.accept());
    await page.getByTestId("save-invoice-btn").click();
    // Either no-customer or no-items toast is acceptable depending on prefill.
    await expect(
      page
        .getByText(
          /please select a customer\.|please add at least one item before saving invoice\./i,
        )
        .first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("New Customer button opens the quick-add modal", async ({ page }) => {
    await gotoNewSale(page);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("NEW_CUSTOMER_CLICKED");
      await dialog.accept();
    });
    await page.getByTestId("quick-add-customer-btn").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/add new customer/i)).toBeVisible();
    // No permission error toast/text should appear.
    await expect(page.getByText(/don't have permission to add customers/i)).toHaveCount(0);
  });

  test("picking an item adds an invoice row", async ({ page }) => {
    await gotoNewSale(page);
    await page.getByTestId("item-picker-trigger").first().click();
    const firstOption = page.getByTestId("item-picker-option").first();
    await expect(firstOption).toBeVisible({ timeout: 5_000 });
    await firstOption.click();
    // Subtotal should be non-zero after picking a priced item.
    const subtotal = page.getByTestId("totals-subtotal");
    await expect(subtotal).not.toHaveText(/৳\s*0$/);
  });

  test("valid invoice saves and appears in the Sale Invoices list", async ({ page }) => {
    await gotoNewSale(page);

    // Pick first available customer.
    const customerTrigger = page
      .getByRole("combobox")
      .filter({ hasText: /select customer/i })
      .first();
    await customerTrigger.click();
    const firstCustomer = page.getByRole("option").first();
    await expect(firstCustomer).toBeVisible({ timeout: 5_000 });
    await firstCustomer.click();

    // Pick first available item.
    await page.getByTestId("item-picker-trigger").first().click();
    const firstOption = page.getByTestId("item-picker-option").first();
    await expect(firstOption).toBeVisible({ timeout: 5_000 });
    await firstOption.click();

    // Save and wait for the success dialog or list navigation.
    await page.getByTestId("save-invoice-btn").click();
    const saved = page
      .getByText(/sale invoice saved/i)
      .or(page.getByTestId("invoice-saved-dialog"));
    await expect(saved.first()).toBeVisible({ timeout: 10_000 });

    // Close the success dialog (if present) → lands on /app/sales.
    const close = page.getByRole("button", { name: /^close$/i });
    if (await close.isVisible().catch(() => false)) {
      await close.click();
    }
    await page.waitForURL(/\/app\/sales(\?|$)/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /sale invoices?/i })).toBeVisible();
  });
});
