/**
 * Phase 3 — sales invoice cloud sync.
 *
 * Builds on the generic transaction-sync primitives to safely register,
 * enqueue, and upload sale invoices in Cloud Mode. Local Mode is fully
 * denied at the preflight gate — no payload is registered, no queue
 * entry created, no cloud call made.
 *
 * Duplicate safety:
 *   • Stable `local_id` + `idempotency_key` per logical invoice.
 *   • Per-company `invoice_no` duplicate guard (via `registerTransaction`).
 *   • Retries reuse the existing record — `markSynced` refuses to
 *     overwrite a different `cloud_id`.
 *
 * Stock posting is intentionally NOT touched here. The cloud uploader
 * only writes the invoice header + line items; stock movements remain
 * the responsibility of the existing save path.
 */
import { preflightSync, preflightSyncSync } from "./gating";
import {
  enqueue,
  getRecord,
  markFailed,
  markSynced,
  markSyncing,
  registerTransaction,
} from "./idempotency";
import type { Uploader, UploadResult } from "./replay";
import type { PreflightResult, TxnSyncRecord } from "./types";

const PAYLOAD_KEY = "erpovo:txn-sync:sales-payload";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

// ---------------------------------------------------------------------------
// Payload model — the snapshot the uploader reads when draining the queue
// ---------------------------------------------------------------------------

export type SalesInvoiceLine = {
  item_id: string | null;
  item_code?: string | null;
  item_name: string;
  description?: string | null;
  qty: number;
  unit: string;
  price: number;
  discount_pct: number;
  tax_pct: number;
  amount: number;
};

export type SalesInvoicePayload = {
  company_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date?: string | null;
  party_id: string | null;
  billing_name?: string | null;
  billing_address?: string | null;
  notes?: string | null;
  status?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_charge?: number;
  labor_charge?: number;
  total: number;
  paid?: number;
  balance?: number;
  payment_method?: string | null;
  doc_type?: string;
  reference_sale_id?: string | null;
  po_no?: string | null;
  po_date?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  items: SalesInvoiceLine[];
};

type PayloadMap = Record<string, SalesInvoicePayload>;

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

export function getSalesPayload(localId: string): SalesInvoicePayload | null {
  return readPayloads()[localId] ?? null;
}

export function setSalesPayload(
  localId: string,
  payload: SalesInvoicePayload,
): void {
  const m = readPayloads();
  m[localId] = payload;
  writePayloads(m);
}

export function clearSalesPayload(localId: string): void {
  const m = readPayloads();
  if (!(localId in m)) return;
  delete m[localId];
  writePayloads(m);
}

// ---------------------------------------------------------------------------
// Preflight + register
// ---------------------------------------------------------------------------

export type SalesSyncInput = {
  companyId: string;
  /** Resume an existing record (after reload or retry). */
  localId?: string;
  invoiceNo: string;
  payload: SalesInvoicePayload;
};

export type SalesSyncPrepared = {
  record: TxnSyncRecord;
  idempotencyKey: string;
};

/** Sync fast-path gate (mode + company). Use to enable/disable UI. */
export function preflightSalesSync(
  companyId: string | null | undefined,
): PreflightResult {
  return preflightSyncSync(companyId);
}

/**
 * Full gate (mode + company + session) then register the invoice so it
 * carries a stable `local_id` and `idempotency_key`. The payload is
 * persisted so an offline-queued invoice can be drained by the uploader
 * later, even across a full reload.
 */
export async function prepareSalesSync(
  input: SalesSyncInput,
): Promise<
  | { ok: true; prepared: SalesSyncPrepared }
  | {
      ok: false;
      reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"];
    }
> {
  const pf = await preflightSync(input.companyId);
  if (!pf.ok) return { ok: false, reason: pf.reason };

  const record = registerTransaction({
    kind: "sale_invoice",
    companyId: input.companyId,
    localId: input.localId,
    referenceNo: input.invoiceNo,
  });

  setSalesPayload(record.local_id, input.payload);

  return {
    ok: true,
    prepared: { record, idempotencyKey: record.idempotency_key },
  };
}

/**
 * Convenience: register + enqueue for later replay. Use this on the
 * offline / retryable-error path so the manual "Replay offline queue"
 * button (or the online-event auto-replay) can drain it.
 */
export async function enqueueSalesInvoice(
  input: SalesSyncInput,
): Promise<
  | { ok: true; prepared: SalesSyncPrepared }
  | {
      ok: false;
      reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"];
    }
> {
  const gate = await prepareSalesSync(input);
  if (!gate.ok) return gate;
  enqueue(gate.prepared.record.local_id);
  return gate;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function beginSalesSync(localId: string): TxnSyncRecord | null {
  return markSyncing(localId);
}

export function completeSalesSync(
  localId: string,
  cloudId: string,
): TxnSyncRecord {
  const rec = markSynced(localId, cloudId);
  // Payload no longer needed once the cloud row exists; the record itself
  // carries the local↔cloud mapping.
  clearSalesPayload(localId);
  return rec;
}

export function failSalesSync(
  localId: string,
  error: string,
): TxnSyncRecord | null {
  return markFailed(localId, error);
}

export function getSalesRecord(localId: string): TxnSyncRecord | null {
  return getRecord(localId);
}

// ---------------------------------------------------------------------------
// Uploader factory — used by replayQueue / registerUploader
// ---------------------------------------------------------------------------

/**
 * Minimal Supabase shape the uploader needs. Tests pass a stub; the real
 * call site passes the `@supabase/supabase-js` client.
 */
export type SalesSyncSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
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

/**
 * Build an `Uploader` that pushes the persisted payload to the cloud.
 *
 * Duplicate strategy: before insert, look up an existing row with the
 * same (company_id, invoice_no). If found, reuse that id — this is what
 * makes a retry land on the SAME cloud row instead of creating a copy.
 *
 * Stock posting is deliberately omitted; the existing local save path
 * already handles inventory, and this phase only syncs the invoice
 * header + lines.
 */
export function createSalesUploader(sb: SalesSyncSupabase): Uploader {
  return async (record: TxnSyncRecord): Promise<UploadResult> => {
    if (record.kind !== "sale_invoice") {
      throw new Error(
        `createSalesUploader: refusing to upload non-sale_invoice kind "${record.kind}"`,
      );
    }
    const payload = getSalesPayload(record.local_id);
    if (!payload) {
      throw new Error(
        `createSalesUploader: no persisted payload for ${record.local_id}`,
      );
    }

    // Reuse cloud_id if the record was previously synced.
    if (record.cloud_id) {
      return { cloud_id: record.cloud_id };
    }

    // Idempotency check: same (company, invoice_no) → reuse.
    const existing = await sb
      .from("sales")
      .select("id")
      .eq("company_id", payload.company_id)
      .eq("invoice_no", payload.invoice_no)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.id) {
      return { cloud_id: existing.data.id };
    }

    const header = {
      company_id: payload.company_id,
      doc_type: payload.doc_type ?? "invoice",
      invoice_no: payload.invoice_no,
      invoice_date: payload.invoice_date,
      due_date: payload.due_date ?? null,
      party_id: payload.party_id,
      billing_name: payload.billing_name ?? null,
      billing_address: payload.billing_address ?? null,
      subtotal: payload.subtotal,
      discount: payload.discount,
      tax: payload.tax,
      delivery_charge: payload.delivery_charge ?? 0,
      labor_charge: payload.labor_charge ?? 0,
      total: payload.total,
      paid: payload.paid ?? 0,
      balance: payload.balance ?? payload.total - (payload.paid ?? 0),
      status: payload.status ?? "open",
      payment_method: payload.payment_method ?? null,
      notes: payload.notes ?? null,
      reference_sale_id: payload.reference_sale_id ?? null,
      po_no: payload.po_no ?? null,
      po_date: payload.po_date ?? null,
      idempotency_key: record.idempotency_key,
      deleted_at: payload.deleted_at ?? null,
    };

    const ins = await sb
      .from("sales")
      .insert(header)
      .select("id")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    if (!ins.data?.id) throw new Error("sales insert returned no id");
    const cloudId = ins.data.id;

    if (payload.items.length > 0) {
      const lines = payload.items.map((li) => ({
        sale_id: cloudId,
        item_id: li.item_id,
        item_name: li.item_name,
        description: li.description ?? null,
        qty: li.qty,
        unit: li.unit,
        price: li.price,
        discount_pct: li.discount_pct,
        tax_pct: li.tax_pct,
        amount: li.amount,
      }));
      const insLines = await sb
        .from("sale_items")
        .insert(lines)
        .select("id")
        .single();
      if (insLines.error) throw new Error(insLines.error.message);
    }

    return { cloud_id: cloudId };
  };
}

/** Test/reset helper. */
export function __resetSalesSyncStore(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PAYLOAD_KEY);
}
