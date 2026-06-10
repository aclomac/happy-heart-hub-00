import { test, expect, type Page } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "./helpers";

/**
 * Browser smoke for the Purchase Bill row action menu.
 * Skips gracefully when the demo company has no bills.
 */

const MENU_LABELS = [
  /^View\/Edit$/,
  /^Make Payment$/,
  /^Convert To Debit Note$/,
  /^Cancel Bill$/,
  /^Delete$/,
  /^Duplicate$/,
  /^Open PDF$/,
  /^Preview$/,
  /^Print$/,
  /^View History$/,
];

async function gotoPurchases(page: Page) {
  await loginAsDemo(page);
  await ensureInsideApp(page);
  await page.goto("/app/purchases", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /purchase bills?|purchases/i })).toBeVisible({
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

test.describe("Purchase Bill row action menu", () => {
  test("renders all expected menu items", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded for demo company — skipping");
    for (const label of MENU_LABELS) {
      await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
    }
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("View/Edit navigates to /app/purchases/:id/edit", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    await Promise.all([
      page.waitForURL(/\/app\/purchases\/[^/]+\/edit/, { timeout: 15_000 }),
      page.getByRole("menuitem", { name: /^View\/Edit$/ }).click(),
    ]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Duplicate navigates to /app/purchases/new?duplicate=<id>", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    await Promise.all([
      page.waitForURL(/\/app\/purchases\/new\?duplicate=/, { timeout: 15_000 }),
      page.getByRole("menuitem", { name: /^Duplicate$/ }).click(),
    ]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Make Payment navigates with source param (when not fully paid)", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    const item = page.getByRole("menuitem", { name: /^Make Payment$/ });
    const disabled =
      (await item.getAttribute("data-disabled")) !== null ||
      (await item.getAttribute("aria-disabled")) === "true";
    test.skip(disabled, "First bill is fully paid/cancelled — Make Payment disabled");
    await Promise.all([
      page.waitForURL(/\/app\/payment-out\/new\?source=/, { timeout: 15_000 }),
      item.click(),
    ]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Convert To Debit Note navigates with source param", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    await Promise.all([
      page.waitForURL(/\/app\/debit-notes\/new\?source=/, { timeout: 15_000 }),
      page.getByRole("menuitem", { name: /^Convert To Debit Note$/ }).click(),
    ]);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Cancel Bill opens confirm dialog (does not confirm)", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    const item = page.getByRole("menuitem", { name: /^Cancel Bill$/ });
    const disabled = (await item.getAttribute("data-disabled")) !== null;
    test.skip(disabled, "Bill already cancelled");
    await item.click();
    await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/cancel bill/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Delete opens confirm dialog (does not confirm)", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    await page.getByRole("menuitem", { name: /^Delete$/ }).click();
    await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/delete bill/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("View History opens scoped audit modal", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    await page.getByRole("menuitem", { name: /^View History$/ }).click();
    await expect(page.getByText(/bill history/i)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Open PDF triggers without runtime errors", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    await page.getByRole("menuitem", { name: /^Open PDF$/ }).click();
    await page.waitForTimeout(1500);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });

  test("Print triggers without runtime errors", async ({ page }) => {
    const bag = attachErrorWatch(page);
    await gotoPurchases(page);
    const opened = await openFirstRowMenu(page);
    test.skip(!opened, "No purchase bills seeded");
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).print = () => {};
    });
    await page.getByRole("menuitem", { name: /^Print$/ }).click();
    await page.waitForTimeout(1500);
    expect(bag.all(), bag.all().join("\n")).toEqual([]);
  });
});
