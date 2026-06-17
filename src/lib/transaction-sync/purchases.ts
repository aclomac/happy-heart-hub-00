/**
 * Phase D — purchase bill cloud sync.
 *
 * Mirrors the sales-sync shape for purchases: gate → register → enqueue
 * → upload, with stable `local_id` + `idempotency_key` so retries land
 * on the same cloud row and Postgres 23505 unique violations resolve as
 * a non-fatal duplicate-success.
 *
 * Local Mode is fully denied at the preflight gate — no payload is
 * registered, no queue entry created, no cloud call made.
 *
 * IMPORTANT — Phase D scope: this uploader syncs the purchase header
 * and its line items ONLY. Inventory side-effects (purchase stock-in)
 * are NOT enabled in this phase. Phase E will gate that separately.
 */
import { preflightSync, preflightSyncSync } from "./gating";
import {
  enqueue,
  getRecord,
  listRecords,
  markFailed,
  markSynced,
  markSyncing,
  registerTransaction,
} from "./idempotency";
import type { Uploader, UploadResult } from "./replay";
import type { PreflightResult, TxnSyncRecord } from "./types";

const PAYLOAD_KEY = "erpovo:txn-sync:purchase-payload";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

// ---------------------------------------------------------------------------
// Payload model
// ---------------------------------------------------------------------------

export type PurchaseLine = {
  item_id: string | null;
  item_name: string;
  description?: string | null;
  qty: number;
  unit: string;
  price: number;
  discount_pct: number;
  tax_pct: number;
  amount: number;
  variant_id?: string | null;
};

export type PurchasePayload = {
  company_id: string;
  bill_no: string;
  bill_date: string;
  due_date?: string | null;
  party_id: string | null;
  status?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid?: number;
  balance?: number;
  notes?: string | null;
  doc_type?: string;
  reference_purchase_id?: string | null;
  deleted_at?: string | null;
  items: PurchaseLine[];
};

type PayloadMap = Record<string, PurchasePayload>;

function readPayloads(): PayloadMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(PAYLOAD_KEY);
    return raw ? (JSON.parse(raw) as PayloadMap) : {};
  } catch {
    return {};
  }
}

function writePayloads(m: PayloadMap): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(PAYLOAD_KEY, JSON.stringify(m));
  } catch {
    /* ignore quota */
  }
}

export function getPurchasePayload(localId: string): PurchasePayload | null {
  return readPayloads()[localId] ?? null;
}

export function setPurchasePayload(localId: string, payload: PurchasePayload): void {
  const m = readPayloads();
  m[localId] = payload;
  writePayloads(m);
}

export function clearPurchasePayload(localId: string): void {
  const m = readPayloads();
  if (!(localId in m)) return;
  delete m[localId];
  writePayloads(m);
}

// ---------------------------------------------------------------------------
// Phase E — paired stock-in escrow for purchases.
//
// A purchase's stock-in payload is registered up front and held in
// escrow against the purchase's local_id. Once the purchase's cloud
// sync succeeds the post-sync hook (see install.ts) drains the escrow
// and enqueues a `stock_movement` record so it flows through the same
// offline queue. We never post inventory to the cloud ahead of (or
// without) its parent bill.
//
// Duplicate-safety: the stock uploader (Phase C) keys every line by
// `${record.idempotency_key}#${i}` and the DB unique index on
// (company_id, idempotency_key) prevents a retry from increasing stock
// twice. Local stock posting is unchanged — the cloud row is a mirror
// of the already-applied movement.
// ---------------------------------------------------------------------------

const STOCK_LINK_KEY = "erpovo:txn-sync:purchase-stock-link";

type StockLinkMap = Record<string, import("./stock").StockMovementPayload>;

function readStockLinks(): StockLinkMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(STOCK_LINK_KEY);
    return raw ? (JSON.parse(raw) as StockLinkMap) : {};
  } catch {
    return {};
  }
}

function writeStockLinks(m: StockLinkMap): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STOCK_LINK_KEY, JSON.stringify(m));
  } catch {
    /* ignore quota */
  }
}

export function linkStockMovementToPurchase(
  purchaseLocalId: string,
  payload: import("./stock").StockMovementPayload,
): void {
  const m = readStockLinks();
  m[purchaseLocalId] = { ...payload, parent_local_id: purchaseLocalId };
  writeStockLinks(m);
}

export function getLinkedPurchaseStockPayload(
  purchaseLocalId: string,
): import("./stock").StockMovementPayload | null {
  return readStockLinks()[purchaseLocalId] ?? null;
}

export function clearLinkedPurchaseStockPayload(purchaseLocalId: string): void {
  const m = readStockLinks();
  if (!(purchaseLocalId in m)) return;
  delete m[purchaseLocalId];
  writeStockLinks(m);
}

export function __resetPurchaseStockLinks(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STOCK_LINK_KEY);
}


// ---------------------------------------------------------------------------
// Preflight + register
// ---------------------------------------------------------------------------

export type PurchaseSyncInput = {
  companyId: string;
  localId?: string;
  billNo: string;
  payload: PurchasePayload;
};

export type PurchaseSyncPrepared = {
  record: TxnSyncRecord;
  idempotencyKey: string;
};

export function preflightPurchaseSync(
  companyId: string | null | undefined,
): PreflightResult {
  return preflightSyncSync(companyId);
}

export async function preparePurchaseSync(
  input: PurchaseSyncInput,
): Promise<
  | { ok: true; prepared: PurchaseSyncPrepared }
  | {
      ok: false;
      reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"];
    }
> {
  const pf = await preflightSync(input.companyId);
  if (!pf.ok) return { ok: false, reason: pf.reason };

  const record = registerTransaction({
    kind: "purchase",
    companyId: input.companyId,
    localId: input.localId,
    referenceNo: input.billNo,
  });

  setPurchasePayload(record.local_id, input.payload);

  return { ok: true, prepared: { record, idempotencyKey: record.idempotency_key } };
}

export async function enqueuePurchase(
  input: PurchaseSyncInput,
): Promise<
  | { ok: true; prepared: PurchaseSyncPrepared }
  | {
      ok: false;
      reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"];
    }
> {
  const gate = await preparePurchaseSync(input);
  if (!gate.ok) return gate;
  enqueue(gate.prepared.record.local_id);
  return gate;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function beginPurchaseSync(localId: string): TxnSyncRecord | null {
  return markSyncing(localId);
}

export function completePurchaseSync(localId: string, cloudId: string): TxnSyncRecord {
  const rec = markSynced(localId, cloudId);
  clearPurchasePayload(localId);
  return rec;
}

export function failPurchaseSync(localId: string, error: string): TxnSyncRecord | null {
  return markFailed(localId, error);
}

export function getPurchaseRecord(localId: string): TxnSyncRecord | null {
  return getRecord(localId);
}

export function listPurchaseSyncRecords(companyId: string): TxnSyncRecord[] {
  return listRecords({ kind: "purchase", companyId });
}

export function getPurchaseRecordByCloudId(
  companyId: string,
  cloudId: string,
): TxnSyncRecord | null {
  return (
    listPurchaseSyncRecords(companyId).find((r) => r.cloud_id === cloudId) ?? null
  );
}

// ---------------------------------------------------------------------------
// Uploader factory
// ---------------------------------------------------------------------------

export type PurchaseSyncSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      is: (col: string, val: null) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export function createPurchaseUploader(sb: PurchaseSyncSupabase): Uploader {
  return async (record: TxnSyncRecord): Promise<UploadResult> => {
    if (record.kind !== "purchase") {
      throw new Error(
        `createPurchaseUploader: refusing to upload non-purchase kind "${record.kind}"`,
      );
    }
    const payload = getPurchasePayload(record.local_id);
    if (!payload) {
      throw new Error(
        `createPurchaseUploader: no persisted payload for ${record.local_id}`,
      );
    }

    if (record.cloud_id) {
      return { cloud_id: record.cloud_id };
    }

    // Idempotency check: same (company, bill_no) → reuse the cloud row.
    const existing = await sb
      .from("purchases")
      .select("id")
      .is("deleted_at", null)
      .eq("company_id", payload.company_id)
      .eq("bill_no", payload.bill_no)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.id) {
      return { cloud_id: existing.data.id };
    }

    const header = {
      company_id: payload.company_id,
      doc_type: payload.doc_type ?? "bill",
      bill_no: payload.bill_no,
      bill_date: payload.bill_date,
      due_date: payload.due_date ?? null,
      party_id: payload.party_id,
      subtotal: payload.subtotal,
      discount: payload.discount,
      tax: payload.tax,
      total: payload.total,
      paid: payload.paid ?? 0,
      balance: payload.balance ?? payload.total - (payload.paid ?? 0),
      status: payload.status ?? "unpaid",
      notes: payload.notes ?? null,
      reference_purchase_id: payload.reference_purchase_id ?? null,
      idempotency_key: record.idempotency_key,
      deleted_at: payload.deleted_at ?? null,
    };

    const ins = await sb.from("purchases").insert(header).select("id").single();
    if (ins.error) throw new Error(ins.error.message);
    if (!ins.data?.id) throw new Error("purchases insert returned no id");
    const cloudId = ins.data.id;

    if (payload.items.length > 0) {
      const lines = payload.items.map((li) => ({
        purchase_id: cloudId,
        item_id: li.item_id,
        item_name: li.item_name,
        description: li.description ?? null,
        qty: li.qty,
        unit: li.unit,
        price: li.price,
        discount_pct: li.discount_pct,
        tax_pct: li.tax_pct,
        amount: li.amount,
        variant_id: li.variant_id ?? null,
      }));
      const insLines = await sb
        .from("purchase_items")
        .insert(lines)
        .select("id")
        .single();
      if (insLines.error) throw new Error(insLines.error.message);
    }

    return { cloud_id: cloudId };
  };
}

/** Test/reset helper. */
export function __resetPurchaseSyncStore(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PAYLOAD_KEY);
}
