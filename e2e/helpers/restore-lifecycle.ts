import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { requireEnv } from "./env";
import { expectAuditEntry } from "./audit";
import { clickUndoOnToast, waitForUndoToast } from "./toast";
import {
  doubleRestoreFromBin,
  filterBinByModule,
  findBinRow,
  gotoRecycleBin,
  restoreFromBin,
} from "./recycle-bin";

export interface ModuleSpec {
  /** Display name used in test titles. */
  label: string;
  /** Route to the module's list page (e.g. "/app/sales"). */
  listRoute: string;
  /** Module value as stored in audit_logs / recycle_bin. */
  module: string;
  /** Friendly module label shown inside the Recycle Bin select. */
  binModuleLabel: string;
  /**
   * Seeds a record directly via Supabase service-role client and returns
   * an opaque handle with the row id + a unique reference string that
   * shows up in both module list and recycle bin.
   */
  seed: () => Promise<{ id: string; reference: string }>;
  /** Optional: balance/stock snapshot taken before delete. */
  snapshot?: () => Promise<number>;
  /** Returns true if a blocked-restore scenario is implemented. */
  blockedRestoreSetup?: (id: string) => Promise<void>;
  blockedRestoreCleanup?: (id: string) => Promise<void>;
}

async function deleteRowFromList(page: Page, reference: string) {
  await expect(page.getByRole("row").filter({ hasText: reference })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: reference });
  // Open the row's action menu — UI uses a "more" button on each row.
  const more = row.getByRole("button", { name: /more|actions|menu|ações/i });
  if (await more.count()) {
    await more.first().click();
    await page.getByRole("menuitem", { name: /delete|excluir/i }).click();
  } else {
    await row
      .getByRole("button", { name: /delete|excluir/i })
      .first()
      .click();
  }
  const confirm = page.getByRole("alertdialog");
  if (await confirm.count()) {
    await confirm.getByRole("button", { name: /delete|excluir|confirm/i }).click();
  }
}

/**
 * Runs the full restore lifecycle suite for a given module. Each module
 * spec just calls this helper with its config so test names stay uniform
 * and any future flow tweak only needs to happen in one place.
 */
export function describeRestoreLifecycle(spec: ModuleSpec) {
  const companyId = requireEnv("E2E_COMPANY_ID");

  test.describe(`${spec.label} restore lifecycle`, () => {
    test("delete shows undo toast, removes from list, appears in recycle bin, audits delete", async ({
      page,
    }) => {
      const { id, reference } = await spec.seed();
      const since = new Date().toISOString();

      await page.goto(spec.listRoute);
      await deleteRowFromList(page, reference);
      await waitForUndoToast(page);

      await expect(page.getByRole("row").filter({ hasText: reference })).toHaveCount(0, {
        timeout: 8_000,
      });

      await gotoRecycleBin(page);
      await filterBinByModule(page, spec.binModuleLabel);
      await findBinRow(page, reference);

      await expectAuditEntry({
        companyId,
        recordId: id,
        action: "deleted",
        within: { sinceISO: since },
      });
    });

    test("undo toast restores record, no duplicate balance/stock posting, audits restore", async ({
      page,
    }) => {
      const { id, reference } = await spec.seed();
      const before = spec.snapshot ? await spec.snapshot() : 0;
      const since = new Date().toISOString();

      await page.goto(spec.listRoute);
      await deleteRowFromList(page, reference);
      await clickUndoOnToast(page);

      await page.reload();
      await expect(page.getByRole("row").filter({ hasText: reference })).toBeVisible();

      await expectAuditEntry({
        companyId,
        recordId: id,
        action: "restored",
        within: { sinceISO: since },
      });

      if (spec.snapshot) {
        const after = await spec.snapshot();
        expect(after).toBeCloseTo(before, 2);
      }
    });

    test("recycle bin restore returns record and double-click is idempotent", async ({ page }) => {
      const { id, reference } = await spec.seed();
      const before = spec.snapshot ? await spec.snapshot() : 0;

      await page.goto(spec.listRoute);
      await deleteRowFromList(page, reference);
      await waitForUndoToast(page);

      await gotoRecycleBin(page);
      await filterBinByModule(page, spec.binModuleLabel);
      await doubleRestoreFromBin(page, reference);

      await page.goto(spec.listRoute);
      await expect(page.getByRole("row").filter({ hasText: reference })).toBeVisible();

      if (spec.snapshot) {
        const after = await spec.snapshot();
        expect(after, "double-click restore must not duplicate balance/stock").toBeCloseTo(
          before,
          2,
        );
      }

      // Exactly one restored entry — proves the second click was a no-op.
      await expectAuditEntry({
        companyId,
        recordId: id,
        action: "restored",
        exactCount: 1,
      });
    });

    if (spec.blockedRestoreSetup) {
      test("blocked restore surfaces clear message and audits blocked_restore", async ({
        page,
      }) => {
        const { id, reference } = await spec.seed();

        await page.goto(spec.listRoute);
        await deleteRowFromList(page, reference);
        await waitForUndoToast(page);

        await spec.blockedRestoreSetup!(id);

        await gotoRecycleBin(page);
        await filterBinByModule(page, spec.binModuleLabel);
        await restoreFromBin(page, reference).catch(() => {
          /* expected to surface as toast error rather than throw */
        });

        await expect(
          page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /cannot restore|blocked|missing/i })
            .first(),
        ).toBeVisible({ timeout: 8_000 });

        await expectAuditEntry({
          companyId,
          recordId: id,
          action: "blocked_restore",
        });

        await spec.blockedRestoreCleanup?.(id);
      });
    }
  });
}
