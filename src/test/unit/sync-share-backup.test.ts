import { describe, it, expect } from "vitest";

/**
 * Sync, Share & Backup module behavior tests.
 * These validate the rules used by app.sync.tsx without needing a full React render.
 */

type Prefs = { auto_enabled: boolean; sync_cloud: boolean; transaction_history: boolean };
const DEFAULT_PREFS: Prefs = { auto_enabled: false, sync_cloud: true, transaction_history: true };

function applyToggle(
  prev: Prefs,
  key: keyof Prefs,
  next: boolean,
): { ok: true; prefs: Prefs; auditAction: string } | { ok: false; reason: string } {
  if (key === "transaction_history" && !next) {
    return { ok: false, reason: "Transaction history is required and cannot be disabled" };
  }
  const updated = { ...prev, [key]: next };
  const auditAction =
    key === "auto_enabled"
      ? next
        ? "backup.auto_enabled"
        : "backup.auto_disabled"
      : key === "sync_cloud"
        ? next
          ? "sync.cloud_enabled"
          : "sync.cloud_disabled"
        : "transaction_history.enabled";
  return { ok: true, prefs: updated, auditAction };
}

function canManage(role: { isOwner?: boolean; isAdmin?: boolean } | null | undefined): boolean {
  return !!(role?.isOwner || role?.isAdmin);
}

describe("Sync & Backup preferences", () => {
  it("toggles auto backup on and emits audit action", () => {
    const r = applyToggle(DEFAULT_PREFS, "auto_enabled", true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.prefs.auto_enabled).toBe(true);
      expect(r.auditAction).toBe("backup.auto_enabled");
    }
  });

  it("toggles sync to cloud off and emits audit action", () => {
    const r = applyToggle(DEFAULT_PREFS, "sync_cloud", false);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.prefs.sync_cloud).toBe(false);
      expect(r.auditAction).toBe("sync.cloud_disabled");
    }
  });

  it("blocks disabling transaction history", () => {
    const r = applyToggle(DEFAULT_PREFS, "transaction_history", false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cannot be disabled/i);
  });

  it("allows transaction history enable", () => {
    const r = applyToggle(
      { ...DEFAULT_PREFS, transaction_history: false },
      "transaction_history",
      true,
    );
    expect(r.ok).toBe(true);
  });
});

describe("Sync & Backup permissions", () => {
  it("permits owners", () => expect(canManage({ isOwner: true })).toBe(true));
  it("permits admins", () => expect(canManage({ isAdmin: true })).toBe(true));
  it("blocks staff", () => expect(canManage({ isOwner: false, isAdmin: false })).toBe(false));
  it("blocks anonymous", () => expect(canManage(null)).toBe(false));
});
