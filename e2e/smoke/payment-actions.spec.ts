import { test, expect, type Page } from "@playwright/test";
import { attachErrorWatch, ensureInsideApp, loginAsDemo } from "./helpers";

/**
 * Browser smoke for the Payment In / Payment Out row action menus.
 * Skips gracefully when the demo company has no rows.
 */

const IN_LABELS = [
  /^View\/Edit$/,
  /^Open Receipt PDF$/,
  /^Preview Receipt$/,
  /^Print Receipt$/,
  /^Delete$/,
  /^Duplicate$/,
  /^View History$/,
];

const OUT_LABELS = [
  /^View\/Edit$/,
  /^Open Voucher PDF$/,
  /^Preview Voucher$/,
  /^Print Voucher$/,
  /^Delete$/,
  /^Duplicate$/,
  /^View History$/,
];

async function gotoPath(page: Page, path: string, headingRe: RegExp) {
  await loginAsDemo(page);
  await ensureInsideApp(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: headingRe })).toBeVisible({
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

function describeDirection(opts: {
  title: string;
  path: string;
  heading: RegExp;
  labels: RegExp[];
  duplicateUrl: RegExp;
  editUrl: RegExp;
}) {
  test.describe(opts.title, () => {
    test("renders all expected menu items", async ({ page }) => {
      const bag = attachErrorWatch(page);
      await gotoPath(page, opts.path, opts.heading);
      const opened = await openFirstRowMenu(page);
      test.skip(!opened, `No ${opts.title} rows seeded — skipping`);
      for (const label of opts.labels) {
        await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
      }
      expect(bag.all(), bag.all().join("\n")).toEqual([]);
    });

    test("View/Edit navigates to edit route", async ({ page }) => {
      const bag = attachErrorWatch(page);
      await gotoPath(page, opts.path, opts.heading);
      const opened = await openFirstRowMenu(page);
      test.skip(!opened, `No ${opts.title} rows`);
      await page.getByRole("menuitem", { name: /View\/Edit/ }).click();
      await expect(page).toHaveURL(opts.editUrl, { timeout: 10_000 });
      expect(bag.all()).toEqual([]);
    });

    test("Duplicate opens new form with duplicate source", async ({ page }) => {
      const bag = attachErrorWatch(page);
      await gotoPath(page, opts.path, opts.heading);
      const opened = await openFirstRowMenu(page);
      test.skip(!opened, `No ${opts.title} rows`);
      await page.getByRole("menuitem", { name: /Duplicate/ }).click();
      await expect(page).toHaveURL(opts.duplicateUrl, { timeout: 10_000 });
      expect(bag.all()).toEqual([]);
    });

    test("View History opens scoped modal", async ({ page }) => {
      const bag = attachErrorWatch(page);
      await gotoPath(page, opts.path, opts.heading);
      const opened = await openFirstRowMenu(page);
      test.skip(!opened, `No ${opts.title} rows`);
      await page.getByRole("menuitem", { name: /View History/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
      expect(bag.all()).toEqual([]);
    });

    test("Delete opens confirm dialog (does not confirm)", async ({ page }) => {
      const bag = attachErrorWatch(page);
      await gotoPath(page, opts.path, opts.heading);
      const opened = await openFirstRowMenu(page);
      test.skip(!opened, `No ${opts.title} rows`);
      await page.getByRole("menuitem", { name: /^Delete$/ }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5_000 });
      expect(bag.all()).toEqual([]);
    });
  });
}

describeDirection({
  title: "Payment In action menu",
  path: "/app/payments-in",
  heading: /payments?\s*in|receipts?/i,
  labels: IN_LABELS,
  duplicateUrl: /\/app\/payments-in\/new\?.*duplicate=/,
  editUrl: /\/app\/payments-in\/[^/]+\/edit/,
});

describeDirection({
  title: "Payment Out action menu",
  path: "/app/payment-out",
  heading: /payments?\s*out|vouchers?/i,
  labels: OUT_LABELS,
  duplicateUrl: /\/app\/payment-out\/new\?.*duplicate=/,
  editUrl: /\/app\/payment-out\/[^/]+\/edit/,
});
