import { expect, test } from "@playwright/test";

test.describe("Recycle Bin permission gate", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("owner can access the Recycle Bin", async ({ page }) => {
    await page.goto("/app/recycle-bin");
    await expect(page.getByRole("heading", { name: /recycle bin/i })).toBeVisible();
    await expect(page.getByText(/access restricted/i)).toHaveCount(0);
  });
});

test.describe("Recycle Bin permission gate (normal user)", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("normal user without permission is blocked from the Recycle Bin", async ({ page }) => {
    await page.goto("/app/recycle-bin");
    // Either an access-denied empty state renders, or the route guard redirects away.
    const denied = page.getByText(/access restricted|only owners and admins/i);
    const redirected = page.waitForURL((url) => !/\/app\/recycle-bin/.test(url.pathname), {
      timeout: 5_000,
    });
    await Promise.race([denied.first().waitFor({ state: "visible", timeout: 5_000 }), redirected]);
  });

  test("Recycle Bin link is hidden from the sidebar", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: /recycle bin/i })).toHaveCount(0);
  });
});
