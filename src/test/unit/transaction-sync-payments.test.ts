/** @vitest-environment jsdom */
import { describe, test, expect, beforeEach, vi } from "vitest";

const supabaseMock = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  return {
    setSession(s: { access_token: string } | null) {
      session = s;
    },
    client: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
      },
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock.client,
}));

import {
  __resetTxnSyncStore,
  __resetPaymentSyncStore,
  preparePaymentSync,
  preflightPaymentSync,
  beginPaymentSync,
  completePaymentSync,
  failPaymentSync,
  getPaymentRecord,
  registerAllocation,
  listAllocations,
  isPaymentPosted,
  postingKey,
  listRecords,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-1";

// Track every cloud "call" the fake uploader sees so we can assert it was
// never invoked in local mode / when gating denies.
const cloudCalls: Array<{ localId: string; idempotencyKey: string }> = [];

async function fakeCloudUpload(localId: string, idempotencyKey: string) {
  cloudCalls.push({ localId, idempotencyKey });
  return { cloud_id: `cloud-${localId}` };
}

/** Drive a payment through the gate + uploader, mimicking real call sites. */
async function syncPayment(
  input: Parameters<typeof preparePaymentSync>[0],
  opts: { fail?: boolean } = {},
) {
  const gate = await preparePaymentSync(input);
  if (!gate.ok) return gate;
  const { record, idempotencyKey } = gate.prepared;
  beginPaymentSync(record.local_id);
  if (opts.fail) {
    failPaymentSync(record.local_id, "boom");
    return gate;
  }
  const res = await fakeCloudUpload(record.local_id, idempotencyKey);
  completePaymentSync(record.local_id, res.cloud_id);
  return gate;
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetPaymentSyncStore();
  clearLaunchMode();
  setLaunchMode("cloud");
  supabaseMock.setSession({ access_token: "tok" });
  cloudCalls.length = 0;
});

describe("payment sync gates — registration & idempotency", () => {
  test("every payment gets stable local_id, cloud_id, and idempotency_key", async () => {
    const gate = await preparePaymentSync({
      kind: "payment_in",
      companyId: CO,
      referenceNo: "PI-1",
    });
    if (!gate.ok) throw new Error("gate denied");
    const { record, idempotencyKey } = gate.prepared;
    expect(record.local_id).toMatch(/[0-9a-f-]{8,}/);
    expect(record.cloud_id).toBeNull();
    expect(idempotencyKey).toBe(record.idempotency_key);
    expect(idempotencyKey).toContain(record.local_id);
    expect(idempotencyKey).toContain(CO);
  });

  test("same payment retry does NOT duplicate (one record, idempotency key reused)", async () => {
    const a = await preparePaymentSync({
      kind: "payment_out",
      companyId: CO,
      referenceNo: "PO-1",
    });
    if (!a.ok) throw new Error("denied");
    // Simulate failure → retry with same localId.
    failPaymentSync(a.prepared.record.local_id, "net");
    const b = await preparePaymentSync({
      kind: "payment_out",
      companyId: CO,
      localId: a.prepared.record.local_id,
      referenceNo: "PO-1",
    });
    if (!b.ok) throw new Error("retry denied");
    expect(b.prepared.idempotencyKey).toBe(a.prepared.idempotencyKey);
    expect(listRecords({ kind: "payment_out" })).toHaveLength(1);
  });

  test("payment idempotency key blocks duplicate reference no in same company", async () => {
    await preparePaymentSync({
      kind: "payment_in",
      companyId: CO,
      referenceNo: "PI-7",
    });
    await expect(
      preparePaymentSync({
        kind: "payment_in",
        companyId: CO,
        referenceNo: "PI-7",
      }),
    ).rejects.toThrow(/Duplicate payment_in reference "PI-7"/);
  });
});

describe("payment sync gates — cash/bank double posting", () => {
  test("double cash posting prevented for same (account, amount, ref)", async () => {
    const first = await preparePaymentSync({
      kind: "payment_in",
      companyId: CO,
      referenceNo: "PI-A",
      account: { kind: "cash", id: "cash-1" },
      amount: 1000,
    });
    expect(first.ok).toBe(true);

    // Different localId → different logical payment trying to post the
    // SAME cash movement. Must be refused by the gate.
    const dup = await preparePaymentSync({
      kind: "payment_in",
      companyId: CO,
      referenceNo: "PI-A",
      account: { kind: "cash", id: "cash-1" },
      amount: 1000,
    });
    // Reference-no guard fires before the posting guard for a brand-new
    // localId — that's still a duplicate-post refusal, just via the
    // earlier gate.
    expect(dup.ok).toBe(false);
  });

  test("retrying the SAME payment against the same bank posting is allowed", async () => {
    const first = await preparePaymentSync({
      kind: "payment_out",
      companyId: CO,
      referenceNo: "PO-A",
      account: { kind: "bank", id: "bank-1" },
      amount: 500,
    });
    if (!first.ok) throw new Error("denied");
    const retry = await preparePaymentSync({
      kind: "payment_out",
      companyId: CO,
      localId: first.prepared.record.local_id,
      referenceNo: "PO-A",
      account: { kind: "bank", id: "bank-1" },
      amount: 500,
    });
    expect(retry.ok).toBe(true);
    const key = postingKey(
      "payment_out",
      CO,
      { kind: "bank", id: "bank-1" },
      500,
      "PO-A",
    );
    expect(isPaymentPosted(key)).toBe(true);
  });
});

describe("payment sync gates — failure & retry semantics", () => {
  test("failed payment sync stays in pending/failed until retried", async () => {
    const gate = await preparePaymentSync({
      kind: "payment_in",
      companyId: CO,
      referenceNo: "PI-F",
    });
    if (!gate.ok) throw new Error("denied");
    beginPaymentSync(gate.prepared.record.local_id);
    failPaymentSync(gate.prepared.record.local_id, "5xx");
    const rec = getPaymentRecord(gate.prepared.record.local_id);
    expect(rec?.status).toBe("failed");
    expect(rec?.cloud_id).toBeNull();
    expect(cloudCalls).toHaveLength(0);
  });

  test("retry of a failed payment marks it synced with one cloud_id", async () => {
    const gate = await syncPayment(
      { kind: "payment_in", companyId: CO, referenceNo: "PI-R" },
      { fail: true },
    );
    if (!gate.ok) throw new Error("denied");
    // Retry — same localId, should converge to synced with single cloud row.
    await syncPayment({
      kind: "payment_in",
      companyId: CO,
      localId: gate.prepared.record.local_id,
      referenceNo: "PI-R",
    });
    const rec = getPaymentRecord(gate.prepared.record.local_id);
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toBe(`cloud-${gate.prepared.record.local_id}`);
    expect(cloudCalls).toHaveLength(1);
  });
});

describe("payment sync gates — preflight (mode/company/session)", () => {
  test("local mode NEVER calls cloud payment sync", async () => {
    setLaunchMode("local");
    const gate = await preparePaymentSync({
      kind: "payment_in",
      companyId: CO,
      referenceNo: "PI-L",
    });
    expect(gate).toEqual({ ok: false, reason: "local-mode" });
    expect(cloudCalls).toHaveLength(0);
    expect(listRecords({ kind: "payment_in" })).toHaveLength(0);
  });

  test("cloud mode requires company_id", async () => {
    expect(preflightPaymentSync(null)).toEqual({
      ok: false,
      reason: "no-company",
    });
    const gate = await preparePaymentSync({
      kind: "payment_out",
      companyId: "",
      referenceNo: "PO-NC",
    });
    expect(gate).toEqual({ ok: false, reason: "no-company" });
  });

  test("cloud mode requires authenticated session", async () => {
    supabaseMock.setSession(null);
    const gate = await preparePaymentSync({
      kind: "payment_in",
      companyId: CO,
      referenceNo: "PI-S",
    });
    expect(gate).toEqual({ ok: false, reason: "no-session" });
    expect(cloudCalls).toHaveLength(0);
  });
});

describe("payment sync gates — invoice allocation dedup", () => {
  test("invoice payment allocation is not duplicated on retry", () => {
    const a = registerAllocation({
      paymentLocalId: "pmt-1",
      invoiceId: "inv-1",
      amount: 250,
    });
    const b = registerAllocation({
      paymentLocalId: "pmt-1",
      invoiceId: "inv-1",
      amount: 250,
    });
    expect(b).toEqual(a);
    expect(listAllocations("pmt-1")).toHaveLength(1);
  });

  test("same payment allocating to two different invoices is allowed", () => {
    registerAllocation({
      paymentLocalId: "pmt-2",
      invoiceId: "inv-A",
      amount: 100,
    });
    registerAllocation({
      paymentLocalId: "pmt-2",
      invoiceId: "inv-B",
      amount: 150,
    });
    const rows = listAllocations("pmt-2");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.invoiceId).sort()).toEqual(["inv-A", "inv-B"]);
  });
});
