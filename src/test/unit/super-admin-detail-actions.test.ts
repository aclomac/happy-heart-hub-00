import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf-8");

const PAYMENT = "routes/super-admin.payments.$id.tsx";
const COUPON = "routes/super-admin.coupons.$id.tsx";
const DEVICE = "routes/super-admin.devices.$id.tsx";
const LAYOUT = "routes/super-admin.tsx";

// Skipped in Personal Mode: Super Admin disabled intentionally.
// The layout intentionally short-circuits to a "Super Admin is disabled" screen,
// so the platform-admin gate assertions below do not apply. Keep the suite
// available for re-enable, but do not gate releases on it.
describe.skip("Super Admin layout guard", () => {
  const src = read(LAYOUT);

  it("uses platform admin gate", () => {
    expect(src).toMatch(/useIsPlatformAdmin/);
  });

  it("blocks non-admins with AccessDeniedScreen", () => {
    expect(src).toMatch(/!isAdmin/);
    expect(src).toMatch(/AccessDeniedScreen/);
  });

  it("shows a loading state while resolving admin status", () => {
    expect(src).toMatch(/isLoading/);
  });
});

describe("Super Admin payment detail — route + actions", () => {
  const src = read(PAYMENT);

  it("registers route under guarded /super-admin tree", () => {
    expect(src).toMatch(/createFileRoute\("\/super-admin\/payments\/\$id"\)/);
  });

  it("renders missing fields safely with em-dash", () => {
    expect(src).toMatch(/const DASH = "—"/);
    expect(src).toMatch(/const safe = /);
  });

  it("wires under_review / approve / reject server functions", () => {
    expect(src).toMatch(/useServerFn\(setPaymentUnderReview\)/);
    expect(src).toMatch(/useServerFn\(approvePlatformPayment\)/);
    expect(src).toMatch(/useServerFn\(rejectPlatformPayment\)/);
  });

  it("prevents re-approving an approved payment", () => {
    expect(src).toMatch(/TERMINAL = new Set\(\[.*"approved".*\]\)/);
    expect(src).toMatch(/disabled=\{approve\.isPending \|\| isApproved\}/);
  });

  it("requires a rejection reason before submitting", () => {
    expect(src).toMatch(/A reason is required/);
    expect(src).toMatch(/disabled=\{!rejectReason\.trim\(\)/);
  });

  it("links to receipt for approved payments", () => {
    expect(src).toMatch(/\/app\/subscription\/receipt\/\$\{id\}/);
  });

  it("exposes a History link to audit logs", () => {
    expect(src).toMatch(/\/super-admin\/audit-logs/);
    expect(src).toMatch(/History/);
  });

  it("emits expected super_admin_payment audit events", () => {
    expect(src).toMatch(/super_admin_payment\.under_review/);
    expect(src).toMatch(/super_admin_payment\.approved/);
    expect(src).toMatch(/super_admin_payment\.rejected/);
    expect(src).toMatch(/super_admin_payment\.receipt_opened/);
    expect(src).toMatch(/super_admin_payment\.detail_opened/);
  });

  it("approve path does not duplicate coupon redemption client-side", () => {
    // Coupon redemption is created server-side in approvePlatformPayment;
    // route must not insert into coupon_redemptions itself.
    expect(src).not.toMatch(/from\("coupon_redemptions"\)/);
  });
});

describe("Super Admin coupon detail — route + actions", () => {
  const src = read(COUPON);

  it("registers route under guarded /super-admin tree", () => {
    expect(src).toMatch(/createFileRoute\("\/super-admin\/coupons\/\$id"\)/);
  });

  it("renders missing fields safely", () => {
    expect(src).toMatch(/const DASH = "—"/);
    expect(src).toMatch(/const safe = /);
  });

  it("wires enable (upsert) and disable handlers", () => {
    expect(src).toMatch(/useServerFn\(upsertCoupon\)/);
    expect(src).toMatch(/useServerFn\(deleteCoupon\)/);
    expect(src).toMatch(/is_active: true/);
  });

  it("guards disable behind window.confirm", () => {
    expect(src).toMatch(/window\.confirm\(\s*`Disable coupon/);
  });

  it("renders redemption history and disables CSV when empty", () => {
    expect(src).toMatch(/coupon_redemptions/);
    expect(src).toMatch(/disabled=\{q\.data\.redemptions\.length === 0\}/);
  });

  it("CSV export uses safe filename and excludes secret fields", () => {
    expect(src).toMatch(/coupon-\$\{q\.data\.coupon\?\.code \?\? id\}-redemptions\.csv/);
    // Whitelist of exported columns: ensure no internal_note or auth ids smuggled in.
    // Only safe display columns are exported.
    const csvCall = src.match(/toCsv\([\s\S]*?\],\s*\[/);
    expect(csvCall, "toCsv call not found").toBeTruthy();
    expect(csvCall![0]).not.toMatch(/internal_note/);
    expect(src).not.toMatch(/access_token|service_role/i);
  });

  it("emits coupon detail_opened and redemption_exported audit events", () => {
    expect(src).toMatch(/coupon\.detail_opened/);
    expect(src).toMatch(/coupon\.redemption_exported/);
  });

  it("History link points to audit logs", () => {
    expect(src).toMatch(/\/super-admin\/audit-logs/);
  });
});

describe("Coupon disable safety on customer upgrade form", () => {
  it("upgrade flow filters out inactive coupons", () => {
    // Public coupon validation must require is_active = true.
    const candidates = [
      "lib/platform-coupons.functions.ts",
      "lib/platform-coupons.ts",
      "lib/coupons.ts",
    ];
    const found = candidates.map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
    expect(found.length).toBeGreaterThan(0);
    const blob = found.map((p) => fs.readFileSync(p, "utf-8")).join("\n");
    expect(blob).toMatch(/is_active/);
  });
});

describe("Super Admin device detail — route + actions", () => {
  const src = read(DEVICE);

  it("registers route under guarded /super-admin tree", () => {
    expect(src).toMatch(/createFileRoute\("\/super-admin\/devices\/\$id"\)/);
  });

  it("renders missing fields safely", () => {
    expect(src).toMatch(/const DASH = "—"/);
    expect(src).toMatch(/const safe = /);
  });

  it("opens confirmation dialog before removing a device", () => {
    expect(src).toMatch(/setConfirm\("remove"\)/);
    expect(src).toMatch(/AlertDialog open=\{confirm === "remove"\}/);
    expect(src).toMatch(/useServerFn\(removeDevice\)/);
  });

  it("opens confirmation dialog before resetting all company devices", () => {
    expect(src).toMatch(/setConfirm\("reset-company"\)/);
    expect(src).toMatch(/AlertDialog\s+open=\{confirm === "reset-company"\}/);
    expect(src).toMatch(/useServerFn\(resetCompanyDevices\)/);
  });

  it("reset-company action requires a resolved owner company", () => {
    // Button is only rendered when companyId is non-null.
    expect(src).toMatch(/companyId \? \(/);
    expect(src).toMatch(/companyId && resetCo\.mutate\(companyId\)/);
  });

  it("warns about removing a recently-active session", () => {
    expect(src).toMatch(/recentlyActive/);
    expect(src).toMatch(/active in the last 24 hours/);
  });

  it("History link points to audit logs", () => {
    expect(src).toMatch(/\/super-admin\/audit-logs/);
  });
});

describe("Super Admin device server-side audit events", () => {
  const candidates = ["lib/platform-devices.functions.ts", "lib/platform-devices.ts"];
  const blob = candidates
    .map((p) => path.join(ROOT, p))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, "utf-8"))
    .join("\n");

  it("device.removed event is wired server-side", () => {
    expect(blob).toMatch(/device\.remove/);
  });

  it("devices.reset_company event is wired server-side", () => {
    expect(blob).toMatch(/devices\.reset_company/);
  });
});

describe("Super Admin coupon server-side audit events", () => {
  const candidates = ["lib/platform-coupons.functions.ts", "lib/platform-coupons.ts"];
  const blob = candidates
    .map((p) => path.join(ROOT, p))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, "utf-8"))
    .join("\n");

  it("coupon enable + disable emit platform audit", () => {
    expect(blob).toMatch(/coupon\.(disable|delete|enable|upsert|create|update)/);
  });
});

describe("Static route registration", () => {
  const tree = read("routeTree.gen.ts");

  for (const r of [
    "/super-admin/payments/$id",
    "/super-admin/coupons/$id",
    "/super-admin/devices/$id",
  ]) {
    it(`route tree registers ${r}`, () => {
      expect(tree).toContain(r);
    });
  }
});
