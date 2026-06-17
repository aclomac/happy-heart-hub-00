/** @vitest-environment jsdom */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

// --- Mocks --------------------------------------------------------------

const supabaseMock = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  return {
    setSession(s: { access_token: string } | null) {
      session = s;
    },
    client: {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session },
          error: null,
        })),
      },
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock.client,
}));

const listersMock = vi.hoisted(() => ({
  items: vi.fn(async (_companyId: string) => [{ id: "i1" }, { id: "i2" }]),
  parties: vi.fn(async (_companyId: string) => [{ id: "p1" }]),
  warehouses: vi.fn(async (_companyId: string) => []),
  item_categories: vi.fn(async (_companyId: string) => []),
  party_groups: vi.fn(async (_companyId: string) => []),
}));

vi.mock("@/lib/master-data", () => ({
  listItems: (id: string) => listersMock.items(id),
  listParties: (id: string) => listersMock.parties(id),
  listWarehouses: (id: string) => listersMock.warehouses(id),
  listItemCategories: (id: string) => listersMock.item_categories(id),
  listPartyGroups: (id: string) => listersMock.party_groups(id),
}));

import {
  RETRY_BACKOFFS_MS,
  clearScheduledRetry,
  getRetryAttempt,
  resetRetryAttempts,
  runResync,
  scheduleRetry,
} from "@/lib/master-data/background-retry";
import {
  getSyncStatus,
  markFailed,
  type MasterEntity,
} from "@/lib/master-data/sync-status";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const COMPANY = "company-aaa";
const ENTITIES: MasterEntity[] = [
  "items",
  "parties",
  "warehouses",
  "item_categories",
  "party_groups",
];

beforeEach(() => {
  localStorage.clear();
  for (const e of ENTITIES) resetRetryAttempts(e);
  Object.values(listersMock).forEach((fn) => fn.mockClear());
  supabaseMock.setSession({ access_token: "tok" });
});

afterEach(() => {
  clearLaunchMode();
  vi.useRealTimers();
});

// --- Sync Now (runResync) -----------------------------------------------

describe("runResync — Sync Now", () => {
  test("Cloud mode re-fetches items and marks synced", async () => {
    setLaunchMode("cloud");
    const res = await runResync("items", COMPANY);
    expect(res.ok).toBe(true);
    expect(listersMock.items).toHaveBeenCalledWith(COMPANY);
    expect(getSyncStatus("items").state).toBe("synced");
    expect(getSyncStatus("items").lastSyncedAt).not.toBeNull();
  });

  test("Cloud mode resyncs parties + warehouses", async () => {
    setLaunchMode("cloud");
    await runResync("parties", COMPANY);
    await runResync("warehouses", COMPANY);
    expect(listersMock.parties).toHaveBeenCalledWith(COMPANY);
    expect(listersMock.warehouses).toHaveBeenCalledWith(COMPANY);
  });

  test("Local mode does NOT call cloud listers", async () => {
    setLaunchMode("local");
    const res = await runResync("items", COMPANY);
    expect(res).toEqual({ ok: false, reason: "local-mode" });
    expect(listersMock.items).not.toHaveBeenCalled();
  });

  test("Cloud mode without companyId returns safe warning, no crash", async () => {
    setLaunchMode("cloud");
    const res = await runResync("items", null);
    expect(res).toEqual({ ok: false, reason: "no-company" });
    expect(listersMock.items).not.toHaveBeenCalled();
  });

  test("Cloud mode without session returns safe warning, no crash", async () => {
    setLaunchMode("cloud");
    supabaseMock.setSession(null);
    const res = await runResync("items", COMPANY);
    expect(res).toEqual({ ok: false, reason: "no-session" });
    expect(listersMock.items).not.toHaveBeenCalled();
  });

  test("Failed sync captures error and marks failed (no throw)", async () => {
    setLaunchMode("cloud");
    listersMock.items.mockRejectedValueOnce(new Error("network down"));
    const res = await runResync("items", COMPANY);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("error");
      expect(res.error).toBe("network down");
    }
    expect(getSyncStatus("items").state).toBe("failed");
    expect(getSyncStatus("items").error).toBe("network down");
  });

  test("Sync Now invalidates the matching React Query cache key", async () => {
    setLaunchMode("cloud");
    const invalidate = vi.fn();
    const fakeClient = { invalidateQueries: invalidate } as unknown as Parameters<
      typeof runResync
    >[2]["queryClient"];
    await runResync("items", COMPANY, { queryClient: fakeClient });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["items", COMPANY] });
  });

  test("Retries are READS only — never insert, so no duplicate records", async () => {
    setLaunchMode("cloud");
    // Call resync three times for the same entity; the lister is a pure
    // read and should be called exactly three times with the same input —
    // never an insert/upsert, so no duplicate rows are possible.
    await runResync("items", COMPANY);
    await runResync("items", COMPANY);
    await runResync("items", COMPANY);
    expect(listersMock.items).toHaveBeenCalledTimes(3);
    for (const call of listersMock.items.mock.calls) {
      expect(call).toEqual([COMPANY]);
    }
  });
});

// --- Background retry / backoff -----------------------------------------

describe("scheduleRetry — background retry with safe backoff", () => {
  test("schedules at most one timer per entity (no duplicate retries)", () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    expect(scheduleRetry("items", run)).toBe(true);
    expect(scheduleRetry("items", run)).toBe(false);
    expect(scheduleRetry("items", run)).toBe(false);
    clearScheduledRetry("items");
  });

  test("stops retrying after the bounded backoff schedule is exhausted", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    for (let i = 0; i < RETRY_BACKOFFS_MS.length; i++) {
      expect(scheduleRetry("parties", run)).toBe(true);
      await vi.advanceTimersByTimeAsync(RETRY_BACKOFFS_MS[i]);
    }
    expect(run).toHaveBeenCalledTimes(RETRY_BACKOFFS_MS.length);
    expect(getRetryAttempt("parties")).toBe(RETRY_BACKOFFS_MS.length);
    // One more schedule attempt must be refused — no forever-loop.
    expect(scheduleRetry("parties", run)).toBe(false);
  });

  test("resetRetryAttempts lets a fresh cycle start", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    scheduleRetry("warehouses", run);
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFFS_MS[0]);
    expect(getRetryAttempt("warehouses")).toBe(1);
    resetRetryAttempts("warehouses");
    expect(getRetryAttempt("warehouses")).toBe(0);
    expect(scheduleRetry("warehouses", run)).toBe(true);
  });

  test("retry runner that succeeds clears the failed state", async () => {
    vi.useFakeTimers();
    setLaunchMode("cloud");
    markFailed("items", "boom");
    expect(getSyncStatus("items").state).toBe("failed");

    scheduleRetry("items", () =>
      runResync("items", COMPANY, { requireSession: false }),
    );
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFFS_MS[0]);
    // Allow the lister + status writes to flush.
    await vi.runAllTimersAsync();

    expect(getSyncStatus("items").state).toBe("synced");
  });
});
