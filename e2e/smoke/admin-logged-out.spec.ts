import { test, expect, type Page } from "@playwright/test";
import { attachErrorWatch } from "./helpers";

/**
 * Logged-out safety smoke for billing/admin surfaces.
 *
 * Verifies that visiting every /app/admin/* and /super-admin/* page while
 * unauthenticated:
 *   - never throws a runtime error ("Unauthorized: No authorization header
 *     provided" or any other pageerror),
 *   - ends up either at the route itself rendering a safe fallback, or at a
 *     safe redirect target (/welcome, /login, /auth),
 *   - never blanks the document body.
 */

const APP_ADMIN_ROUTES = [
  "/app/admin/access-matrix",
  "/app/admin/payment-settings",
  "/app/admin/payments",
  "/app/admin/security-tests",
  "/app/upgrade/pro",
];

const SUPER_ADMIN_ROUTES = [
  "/super-admin",
  "/super-admin/announcements",
  "/super-admin/audit-logs",
  "/super-admin/companies",
  "/super-admin/coupons",
  "/super-admin/customers",
  "/super-admin/devices",
  "/super-admin/feature-control",
  "/super-admin/payment-gateways",
  "/super-admin/payments",
  "/super-admin/plans",
  "/super-admin/platform-admins",
  "/super-admin/reports",
  "/super-admin/settings",
  "/super-admin/subscriptions",
  "/super-admin/support",
];

const ALL_ROUTES = [...APP_ADMIN_ROUTES, ...SUPER_ADMIN_ROUTES];

const SAFE_REDIRECT = /\/(welcome|login|auth|signup)(\/|$|\?)/;

async function presetCloudMode(page: Page) {
  // Land on app origin first so localStorage is reachable, then set the
  // launch-mode flag so /app/* doesn't bounce to /welcome — we want the
  // routes to actually mount (or redirect to /login) and exercise the
  // billing/admin auth guards.
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("erpovo:launch-mode", "cloud");
  });
}

test.describe("Logged-out admin/billing pages render safely", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ALL_ROUTES) {
    test(`${route} has no runtime errors and shows a safe fallback`, async ({
      page,
    }) => {
      await presetCloudMode(page);
      const bag = attachErrorWatch(page);

      await page.goto(route, { waitUntil: "domcontentloaded" });
      // Give client-side guards / redirects time to settle.
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

      const finalUrl = new URL(page.url());
      const landedOnSelf = finalUrl.pathname === route;
      const landedOnSafeRedirect = SAFE_REDIRECT.test(finalUrl.pathname + "/");

      expect(
        landedOnSelf || landedOnSafeRedirect,
        `expected ${route} to render itself or redirect to /welcome|/login|/auth, ` +
          `but landed at ${finalUrl.pathname}`,
      ).toBe(true);

      // Body must not be empty — even a redirected page should render its
      // destination shell, and a self-rendered fallback must have content.
      const bodyText = (await page.locator("body").innerText()).trim();
      expect(bodyText.length).toBeGreaterThan(0);

      // The whole point of this suite: no thrown runtime errors. Console /
      // network filters in `attachErrorWatch` already tolerate 401/403, so
      // anything that survives is a real crash.
      // Filter dev-server noise: when the route guard redirects mid-load,
      // Vite cancels in-flight ESM module fetches and reports them as
      // net::ERR_ABORTED. Those aren't runtime errors, just navigation churn.
      const errs = bag.all().filter((e) => {
        if (/net::ERR_ABORTED/.test(e) && /\/node_modules\//.test(e)) return false;
        return true;
      });
      const unauthorized = errs.filter((e) =>
        /Unauthorized: No authorization header/i.test(e),
      );
      expect(
        unauthorized,
        `unauthorized auth-header crash on ${route}:\n${unauthorized.join("\n")}`,
      ).toEqual([]);
      expect(
        errs,
        `runtime errors on ${route}:\n${errs.join("\n")}`,
      ).toEqual([]);
    });
  }
});
