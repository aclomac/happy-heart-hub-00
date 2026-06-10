import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Waits for the soft-delete "Undo" toast (from sonner) to appear and
 * returns a handle for further actions.
 */
export async function waitForUndoToast(page: Page) {
  const toast = page.locator("[data-sonner-toast]").filter({
    hasText: /deleted|moved to recycle bin|excluí|removido/i,
  });
  await expect(toast.first()).toBeVisible({ timeout: 8_000 });
  return toast.first();
}

export async function clickUndoOnToast(page: Page) {
  const toast = await waitForUndoToast(page);
  await toast.getByRole("button", { name: /undo|desfazer/i }).click();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: /restored|restaurado/i })
      .first(),
  ).toBeVisible({ timeout: 8_000 });
}
