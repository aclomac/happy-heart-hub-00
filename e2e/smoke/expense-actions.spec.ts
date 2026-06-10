import { test, expect, type Page } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "./helpers";

/**
 * Browser smoke for the Expense Voucher row action menu.
 * Skips gracefully when the demo company has no expenses.
 */

const MENU_LABELS = [
  /^View\/Edit$/,
  /^Open Voucher PDF$/,
  /^Preview Voucher$/,
  /^Print Voucher$/,
  /^Delete$/,
  /^Duplicate$/,
  /^View History$/,
];

async function gotoExpenses(page: Page) {
  await loginAsDemo(page);
  await ensureInsideApp(page);
  await page.goto("/app/expenses", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /expenses?/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function openFirstRowMenu(page: Page): Promise<boolean> {
  const trigger = page.getByRole("button", { name: /^Actions for / }).first();
  if (!(await trigger.isVisible().catch(() => false))) return false;
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: /View\/Edit/ })).toBeVisible({
    timeout: 10_000,
  });
  return true;
}

test.describe("Expense row action menu", () => {
  test("renders all expected menu items", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoExpenses(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No expenses seeded for demo company — skipping");
    for (const label of MENU_LABELS) {
      await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
    }
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("View/Edit navigates to /app/expenses/:id/edit", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoExpenses(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No expenses");
    await page.getByRole("menuitem", { name: /View\/Edit/ }).click();
    await expect(page).toHaveURL(/\/app\/expenses\/[^/]+\/edit/, { timeout: 10_000 });
    expect(bag.all()).toEqual([]);
  });

  test("Duplicate opens new expense form with duplicate source", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoExpenses(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No expenses");
    await page.getByRole("menuitem", { name: /Duplicate/ }).click();
    await expect(page).toHaveURL(/\/app\/expenses\/new\?.*duplicate=/, {
      timeout: 10_000,
    });
    expect(bag.all()).toEqual([]);
  });

  test("View History opens scoped modal", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoExpenses(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No expenses");
    await page.getByRole("menuitem", { name: /View History/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    expect(bag.all()).toEqual([]);
  });

  test("Delete opens confirm dialog (does not confirm)", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoExpenses(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No expenses");
    await page.getByRole("menuitem", { name: /^Delete$/ }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5_000 });
    expect(bag.all()).toEqual([]);
  });

  test("Open PDF / Preview / Print run without console or network errors", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoExpenses(page);
    for (const label of [/Open Voucher PDF/, /Preview Voucher/, /Print Voucher/]) {
      const opened = await openFirstRowMenu(page);
      test.skip(!opened, "No expenses");
      await page.getByRole("menuitem", { name: label }).click();
      // Give the PDF pipeline a moment to settle.
      await page.waitForTimeout(800);
      // Close any opened print/preview window if it appeared.
      await page.keyboard.press("Escape").catch(() => {});
    }
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});
