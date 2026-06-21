// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock supabase client before importing auto-sync
const authListeners: Array<(e: string, s: any) => void> = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: any) => {
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

// Mock install to avoid real uploader wiring
vi.mock("@/lib/transaction-sync/install", () => ({
  installSalesUploader: vi.fn(),
}));

const replayCalls: string[] = [];
vi.mock("@/lib/transaction-sync/replay", () => ({
  replayQueue: vi.fn(async () => {
    replayCalls.push("replay");
    return { attempted: 0, succeeded: 0, failed: 0, skipped: 0, attempts: 0, attemptsLog: [] };
  }),
  installQueueAutoReplay: (getOpts: () => any) => {
    const handler = () => { const o = getOpts(); if (o) replayCalls.push("online"); };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  },
}));

vi.mock("@/lib/transaction-sync/active-uploader", () => ({
  hasUploader: () => true,
  getActiveUploader: () => async () => ({ cloud_id: "x" }),
}));

beforeEach(() => {
  replayCalls.length = 0;
  authListeners.length = 0;
  localStorage.setItem("erpovo:companyId", "co-1");
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe("installAutoSync", () => {
  it("triggers on startup, online, visibility, interval, and sign-in", async () => {
    const { installAutoSync, __resetAutoSyncForTests } = await import("@/lib/transaction-sync/auto-sync");
    __resetAutoSyncForTests();
    const dispose = installAutoSync({ intervalMs: 5000 });

    // startup
    await vi.runOnlyPendingTimersAsync();
    expect(replayCalls).toContain("replay");
    const startupCount = replayCalls.length;

    // online
    window.dispatchEvent(new Event("online"));
    expect(replayCalls.length).toBeGreaterThan(startupCount);

    // visibility
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.runOnlyPendingTimersAsync();

    // interval
    const before = replayCalls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(replayCalls.length).toBeGreaterThan(before);

    // signed-in
    const beforeSignIn = replayCalls.length;
    authListeners[0]("SIGNED_IN", { user: { id: "u1" } });
    await vi.advanceTimersByTimeAsync(300);
    expect(replayCalls.length).toBeGreaterThan(beforeSignIn);

    dispose();
  });
});
