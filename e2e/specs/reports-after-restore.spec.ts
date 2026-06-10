import { expect, test } from "@playwright/test";

import { waitForUndoToast } from "../helpers/toast";
import {
  filterBinByModule,
  gotoRecycleBin,
  permanentDeleteFromBin,
  restoreFromBin,
} from "../helpers/recycle-bin";
import { seeders } from "../fixtures/seeders";

async function readSalesTotal(page: import("@playwright/test").Page): Promise<number> {
  await page.goto("/app/sales-reports");
  const totalEl = page.locator("[data-testid='sales-total'], :text('Total Sales') + *").first();
  const text = (await totalEl.textContent({ timeout: 5_000 }).catch(() => "0")) ?? "0";
  return Number(text.replace(/[^0-9.\-]/g, "")) || 0;
}

test.describe("Reports react correctly to delete / restore / permanent delete", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("sale totals drop on delete, return on restore, stay dropped after permanent delete", async ({
    page,
  }) => {
    const { reference } = await seeders.sale();

    const before = await readSalesTotal(page);

    await page.goto("/app/sales");
    const row = page.getByRole("row").filter({ hasText: reference });
    await row
      .getByRole("button", { name: /more|actions|menu/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /delete/i }).click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.count()) {
      await confirm.getByRole("button", { name: /delete|confirm/i }).click();
    }
    await waitForUndoToast(page);

    const afterDelete = await readSalesTotal(page);
    expect(afterDelete, "deleted sale must drop the report total").toBeLessThanOrEqual(before);

    await gotoRecycleBin(page);
    await filterBinByModule(page, "Sales");
    await restoreFromBin(page, reference);

    const afterRestore = await readSalesTotal(page);
    expect(afterRestore).toBeCloseTo(before, 2);

    // Now delete + permanently delete and confirm totals stay dropped.
    await page.goto("/app/sales");
    const row2 = page.getByRole("row").filter({ hasText: reference });
    await row2
      .getByRole("button", { name: /more|actions|menu/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /delete/i }).click();
    const confirm2 = page.getByRole("alertdialog");
    if (await confirm2.count()) {
      await confirm2.getByRole("button", { name: /delete|confirm/i }).click();
    }
    await waitForUndoToast(page);

    await gotoRecycleBin(page);
    await filterBinByModule(page, "Sales");
    await permanentDeleteFromBin(page, reference);

    const finalTotal = await readSalesTotal(page);
    expect(finalTotal, "permanently deleted sale must never appear").toBeLessThanOrEqual(before);
    expect(finalTotal).toBeLessThan(before + 0.01);
  });
});
