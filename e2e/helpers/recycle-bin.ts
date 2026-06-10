import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function gotoRecycleBin(page: Page) {
  await page.goto("/app/recycle-bin");
  await expect(page.getByRole("heading", { name: /recycle bin/i })).toBeVisible();
}

export async function filterBinByModule(page: Page, moduleLabel: string) {
  // The Recycle Bin page exposes module + status selects; identify by combobox role.
  const moduleSelect = page.getByRole("combobox").nth(0);
  await moduleSelect.click();
  await page.getByRole("option", { name: new RegExp(moduleLabel, "i") }).click();
}

export async function findBinRow(page: Page, reference: string) {
  const row = page.getByRole("row").filter({ hasText: reference });
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

export async function restoreFromBin(page: Page, reference: string) {
  const row = await findBinRow(page, reference);
  await row.getByRole("button", { name: /restore|restaurar/i }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: /restored|restaurado/i })
      .first(),
  ).toBeVisible({ timeout: 8_000 });
}

/**
 * Performs a double-click on the Restore button to verify idempotency —
 * a second restore must not duplicate balance/stock postings.
 */
export async function doubleRestoreFromBin(page: Page, reference: string) {
  const row = await findBinRow(page, reference);
  const btn = row.getByRole("button", { name: /restore|restaurar/i });
  await btn.click({ clickCount: 2, delay: 50 });
}

export async function permanentDeleteFromBin(page: Page, reference: string) {
  const row = await findBinRow(page, reference);
  await row.getByRole("button", { name: /delete forever|permanently|permanente/i }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  // Strong confirm: the dialog contains a confirm button.
  await dialog.getByRole("button", { name: /delete forever|confirm|permanent/i }).click();
}
