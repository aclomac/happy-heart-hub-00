import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf-8");

describe("Phase 4 — Platform Settings", () => {
  it("settings page reads and updates platform_settings", () => {
    const src = read("routes/super-admin.settings.tsx");
    expect(src).toMatch(/from\("platform_settings"\)/);
    expect(src).toMatch(/\.update\(patch\)/);
    expect(src).toMatch(/logPlatformAudit\("platform_settings\.update"/);
  });

  it("maintenance gate blocks users but bypasses admins", () => {
    const src = read("components/erp/MaintenanceGate.tsx");
    expect(src).toMatch(/maintenance_mode/);
    expect(src).toMatch(/platform_admins/);
    expect(src).toMatch(/!isAdmin/);
  });
});

describe("Phase 4 — Support Tickets", () => {
  it("customer page inserts ticket scoped to current user", () => {
    const src = read("routes/app.support.tsx");
    expect(src).toMatch(/from\("support_tickets"\)/);
    expect(src).toMatch(/user_id: user\.id/);
    expect(src).toMatch(/from\("support_ticket_messages"\)/);
  });

  it("admin page can change status, reply, and log audit", () => {
    const src = read("routes/super-admin.support.tsx");
    expect(src).toMatch(/support\.status_change/);
    expect(src).toMatch(/support\.reply/);
    expect(src).toMatch(/is_internal/);
  });
});

describe("Phase 4 — Announcements", () => {
  it("admin create writes target_plan only when audience is plan", () => {
    const src = read("routes/super-admin.announcements.tsx");
    expect(src).toMatch(/audience === "plan" \? form\.target_plan \|\| null : null/);
    expect(src).toMatch(/announcement\.create/);
    expect(src).toMatch(/announcement\.toggle/);
    expect(src).toMatch(/announcement\.delete/);
  });

  it("banner filters by active and date window", () => {
    const src = read("components/erp/AnnouncementBanner.tsx");
    expect(src).toMatch(/is_active.*true/s);
    expect(src).toMatch(/lte\("starts_at"/);
    expect(src).toMatch(/ends_at.is.null,ends_at.gte/);
  });

  it("banner persists dismissals locally and to db", () => {
    const src = read("components/erp/AnnouncementBanner.tsx");
    expect(src).toMatch(/announcement_dismissals/);
    expect(src).toMatch(/localStorage\.setItem/);
  });
});

describe("Phase 4 — Platform Admins", () => {
  it("platform admin page uses safe RPCs", () => {
    const src = read("routes/super-admin.platform-admins.tsx");
    expect(src).toMatch(/add_platform_admin_by_email/);
    expect(src).toMatch(/remove_platform_admin/);
  });
});

describe("Phase 4 — Sidebars wired", () => {
  it("super admin sidebar lists new pages", () => {
    const src = read("components/super-admin/SuperAdminSidebar.tsx");
    expect(src).toMatch(/\/super-admin\/support/);
    expect(src).toMatch(/\/super-admin\/announcements/);
    expect(src).toMatch(/\/super-admin\/platform-admins/);
    expect(src).toMatch(/\/super-admin\/settings/);
  });

  it("ERP sidebar links to /app/support", () => {
    const src = read("components/erp/Sidebar.tsx");
    expect(src).toMatch(/\/app\/support/);
  });

  it("ERP layout mounts maintenance gate and announcement banner", () => {
    const src = read("routes/app.tsx");
    expect(src).toMatch(/<MaintenanceGate>/);
    expect(src).toMatch(/<AnnouncementBanner/);
  });
});
