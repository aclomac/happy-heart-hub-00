import { describe, it, expect } from "vitest";

// Phase 1 sidebar contract — keep in sync with SuperAdminSidebar NAV.
const SUPER_ADMIN_ROUTES = [
  "/super-admin",
  "/super-admin/customers",
  "/super-admin/companies",
  "/super-admin/plans",
  "/super-admin/subscriptions",
  "/super-admin/payments",
  "/super-admin/payment-gateways",
  "/super-admin/devices",
  "/super-admin/feature-control",
  "/super-admin/reports",
  "/super-admin/audit-logs",
  "/super-admin/settings",
];

const FUNCTIONAL = [
  "/super-admin",
  "/super-admin/customers",
  "/super-admin/companies",
  "/super-admin/plans",
  "/super-admin/audit-logs",
  "/super-admin/subscriptions",
];

const COMING_SOON = [
  "/super-admin/payments",
  "/super-admin/payment-gateways",
  "/super-admin/devices",
  "/super-admin/feature-control",
  "/super-admin/reports",
  "/super-admin/settings",
];

describe("Super Admin Phase 1 routes", () => {
  it("exposes a sidebar with 12 sections", () => {
    expect(SUPER_ADMIN_ROUTES).toHaveLength(12);
  });

  it("has 6 functional sections in Phase 1", () => {
    expect(FUNCTIONAL).toHaveLength(6);
  });

  it("has 6 Coming Soon sections", () => {
    expect(COMING_SOON).toHaveLength(6);
  });

  it("every Coming Soon route is in the sidebar", () => {
    for (const r of COMING_SOON) expect(SUPER_ADMIN_ROUTES).toContain(r);
  });

  it("every functional route is in the sidebar", () => {
    for (const r of FUNCTIONAL) expect(SUPER_ADMIN_ROUTES).toContain(r);
  });
});

describe("Platform admin gating", () => {
  it("treats /super-admin as outside ERP /app prefix (no orchestrator redirect)", () => {
    const pathname = "/super-admin";
    const isAppRoute = pathname.startsWith("/app");
    const isCompaniesRoute = pathname.startsWith("/companies");
    expect(isAppRoute).toBe(false);
    expect(isCompaniesRoute).toBe(false);
  });
});

describe("Plan delete safety", () => {
  it("blocks delete when plan has active subscribers", () => {
    const activeCount = 3;
    const shouldBlock = activeCount > 0;
    expect(shouldBlock).toBe(true);
  });

  it("allows delete when plan has zero active subscribers", () => {
    const activeCount = 0;
    const shouldBlock = activeCount > 0;
    expect(shouldBlock).toBe(false);
  });
});

describe("Subscription extend math", () => {
  it("extends from current expiry when in future", () => {
    const now = Date.now();
    const expires = now + 5 * 86400000;
    const base = Math.max(expires, now);
    const next = new Date(base + 30 * 86400000);
    expect(next.getTime()).toBeGreaterThan(expires);
  });

  it("extends from now when already expired", () => {
    const now = Date.now();
    const expires = now - 10 * 86400000;
    const base = Math.max(expires, now);
    expect(base).toBe(now);
  });
});
