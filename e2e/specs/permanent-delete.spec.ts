import { expect, test } from "@playwright/test";

import { requireEnv } from "../helpers/env";
import { expectAuditEntry } from "../helpers/audit";
import { waitForUndoToast } from "../helpers/toast";
import {
  filterBinByModule,
  findBinRow,
  gotoRecycleBin,
  permanentDeleteFromBin,
} from "../helpers/recycle-bin";
import { seeders } from "../fixtures/seeders";

test.describe("Permanent delete", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("owner sees strong confirm dialog and audit history is preserved", async ({ page }) => {
    const companyId = requireEnv("E2E_COMPANY_ID");
    const { id, reference } = await seeders.expense();

    await page.goto("/app/expenses");
    const row = page.getByRole("row").filter({ hasText: reference });
    await expect(row).toBeVisible();
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

    await gotoRecycleBin(page);
    await filterBinByModule(page, "Expenses");
    await findBinRow(page, reference);
    await permanentDeleteFromBin(page, reference);

    await expect(page.getByRole("row").filter({ hasText: reference })).toHaveCount(0, {
      timeout: 8_000,
    });

    await expectAuditEntry({ companyId, recordId: id, action: "deleted" });
    await expectAuditEntry({ companyId, recordId: id, action: "permanent_delete" });
  });
});

test.describe("Permanent delete (normal user)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("normal user cannot reach permanent delete", async ({ page }) => {
    await page.goto("/app/recycle-bin");
    await expect(page.getByRole("button", { name: /delete forever|permanently/i })).toHaveCount(0);
  });
});
