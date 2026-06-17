import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("billing auth guards", () => {
  it("defines the Personal Mode fallback used when billing cannot run", () => {
    const guard = src("src/lib/billing-guard.ts");
    expect(guard).toContain('planName: "Personal Mode"');
    expect(guard).toContain('status: "All features unlocked"');
    expect(guard).toContain("isActive: true");
    expect(guard).toContain("isAdmin: false");
    expect(guard).toContain("showManageSubscription: false");
  });

  it("keeps /app sidebar billing admin check disabled until Cloud has an access token", () => {
    const sidebar = src("src/components/erp/Sidebar.tsx");
    expect(sidebar).toContain("useBillingAuthGuard");
    expect(sidebar).toContain("checkBillingAdminSafe");
    expect(sidebar).not.toContain("checkIsAdmin");
    expect(sidebar).toContain("enabled: isCloudMode && !!session?.access_token");
    expect(sidebar).toContain("retry: false");
  });

  it("guards admin payment pages from unauthenticated billing calls", () => {
    const payments = src("src/routes/app.admin.payments.tsx");
    const settings = src("src/routes/app.admin.payment-settings.tsx");
    for (const route of [payments, settings]) {
      expect(route).toContain("useBillingAuthGuard");
      expect(route).toContain("enabled: isCloudMode && !!session?.access_token");
      expect(route).toContain("isUnauthorizedError");
      expect(route).toContain("retry: false");
    }
  });

  it("waits for a Cloud session before upgrade billing queries and actions", () => {
    const upgrade = src("src/routes/app.upgrade.$plan.tsx");
    expect(upgrade).toContain("enabled: isCloudMode && !!session?.access_token");
    expect(upgrade).toContain("if (!canCallBilling)");
    expect(upgrade).toContain("Sign in to Cloud Mode before submitting a payment request");
  });

  it("converts safe billing reads without Authorization into fallback results", () => {
    const billing = src("src/lib/billing.functions.ts");
    expect(billing).toContain("optionalBillingAuth");
    expect(billing).toContain("if (!auth) return { requests: [], ...BILLING_SAFE_RESULT }");
    expect(billing).toContain("if (!auth) return { methods: [], ...BILLING_SAFE_RESULT }");
    expect(billing).toContain("if (!auth) return { plans: [], ...BILLING_SAFE_RESULT }");
    expect(billing).toContain("if (!auth) return { ...BILLING_SAFE_RESULT, isAdmin: false }");
    expect(billing).toContain("export const checkBillingAdminSafe");
    expect(billing).toContain("await auth.supabase.rpc");
    expect(billing).not.toContain("export const checkIsAdmin");
  });

  it("Settings billing UI uses safe fallback badge/link rather than server functions", () => {
    const settings = src("src/routes/app.settings.tsx");
    expect(settings).toContain("<PlanStatusBadge size=\"sm\" />");
    expect(settings).toContain("Manage Subscription");
    expect(settings).not.toContain("useServerFn(checkIsAdmin)");
  });
});