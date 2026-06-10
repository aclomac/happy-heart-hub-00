import { test, expect, type Page } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "./helpers";

/**
 * Browser smoke for the Sale Invoice row action menu.
 * Skips gracefully when the demo company has no invoices.
 */

const MENU_LABELS = [
  /^View\/Edit$/,
  /^Receive Payment$/,
  /^Convert To Return$/,
  /^Preview Delivery Challan$/,
  /^Cancel Invoice$/,
  /^Delete$/,
  /^Duplicate$/,
  /^Open PDF$/,
  /^Preview$/,
  /^Print$/,
  /^View History$/,
];

async function gotoSales(page: Page) {
  await loginAsDemo(page);
  await ensureInsideApp(page);
  await page.goto("/app/sales", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /sale invoices?/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function openFirstRowMenu(page: Page): Promise<boolean> {
  const trigger = page.getByRole("button", { name: /^Actions for / }).first();
  if (!(await trigger.isVisible().catch(() => false))) return false;
  await trigger.click();
  // Menu content marker
  await expect(page.getByRole("menuitem", { name: /View\/Edit/ })).toBeVisible({
    timeout: 10_000,
  });
  return true;
}

test.describe("Sale Invoice row action menu", () => {
  test("renders all expected menu items", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded for demo company — skipping");
    for (const label of MENU_LABELS) {
      await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
    }
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("View/Edit navigates to /app/sales/:id/edit", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    await Promise.all([
      page.waitForURL(/\/app\/sales\/[^/]+\/edit/, { timeout: 15_000 }),
      page.getByRole("menuitem", { name: /^View\/Edit$/ }).click(),
    ]);
    await expect(
      page.getByRole("heading", { name: /edit sale invoice|sale invoice/i }),
    ).toBeVisible({ timeout: 15_000 });
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Duplicate navigates to /app/sales/new?duplicate=<id>", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    await Promise.all([
      page.waitForURL(/\/app\/sales\/new\?duplicate=/, { timeout: 15_000 }),
      page.getByRole("menuitem", { name: /^Duplicate$/ }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /new sale invoice/i })).toBeVisible({
      timeout: 15_000,
    });
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Receive Payment navigates with source param (when not fully paid)", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    const item = page.getByRole("menuitem", { name: /^Receive Payment$/ });
    const disabled =
      (await item.getAttribute("data-disabled")) !== null ||
      (await item.getAttribute("aria-disabled")) === "true";
    test.skip(disabled, "First invoice is fully paid/cancelled — Receive Payment disabled");
    await Promise.all([
      page.waitForURL(/\/app\/payments-in\/new\?source=/, { timeout: 15_000 }),
      item.click(),
    ]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Convert To Return navigates with source param", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    await Promise.all([
      page.waitForURL(/\/app\/credit-notes\/new\?source=/, { timeout: 15_000 }),
      page.getByRole("menuitem", { name: /^Convert To Return$/ }).click(),
    ]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Preview Delivery Challan navigates with source param", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    await Promise.all([
      page.waitForURL(/\/app\/delivery-challans\/new\?source=/, { timeout: 15_000 }),
      page.getByRole("menuitem", { name: /^Preview Delivery Challan$/ }).click(),
    ]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Cancel Invoice opens confirm dialog (does not confirm)", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    const item = page.getByRole("menuitem", { name: /^Cancel Invoice$/ });
    const disabled = (await item.getAttribute("data-disabled")) !== null;
    test.skip(disabled, "Invoice already cancelled");
    await item.click();
    await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/cancel invoice/i).first()).toBeVisible();
    // Dismiss without confirming
    await page.keyboard.press("Escape");
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Delete opens confirm dialog (does not confirm)", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    await page.getByRole("menuitem", { name: /^Delete$/ }).click();
    await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/delete invoice/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("View History opens scoped audit modal", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    await page.getByRole("menuitem", { name: /^View History$/ }).click();
    await expect(page.getByText(/invoice history/i)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Open PDF triggers without runtime errors", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    await page.getByRole("menuitem", { name: /^Open PDF$/ }).click();
    // Allow async PDF build to settle
    await page.waitForTimeout(1500);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Print triggers without runtime errors", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoSales(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No sale invoices seeded");
    // Stub window.print to avoid a real print dialog
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).print = () => {};
    });
    await page.getByRole("menuitem", { name: /^Print$/ }).click();
    await page.waitForTimeout(1500);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});
