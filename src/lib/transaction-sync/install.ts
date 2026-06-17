/**
 * Phase 3 — uploader bootstrap.
 *
 * Wires the concrete sales uploader (backed by the Supabase client) into
 * the `active-uploader` registry so the manual "Replay offline queue"
 * button and the online-event auto-replay can drain queued sales
 * invoices. Safe to call multiple times — re-registration just replaces
 * the active uploader reference.
 *
 * Phase B — also wires a `sale_invoice` post-sync hook that drains any
 * paired stock_movement payload escrowed against the sale's local_id
 * and enqueues it for cloud sync. Inventory is therefore NEVER posted
 * to the cloud ahead of (or without) its parent invoice.
 */
import { supabase } from "@/integrations/supabase/client";
import { registerUploader, hasUploader } from "./active-uploader";
import {
  clearPostSyncHooks,
  registerPostSyncHook,
} from "./idempotency";
import {
  clearLinkedStockPayload,
  createSalesUploader,
  getLinkedStockPayload,
  type SalesSyncSupabase,
} from "./sales";
import { createStockUploader, enqueueStockMovement, type StockSyncSupabase } from "./stock";
import {
  clearLinkedPurchaseStockPayload,
  createPurchaseUploader,
  getLinkedPurchaseStockPayload,
  type PurchaseSyncSupabase,
} from "./purchases";
import type { Uploader } from "./replay";
import type { TxnSyncRecord } from "./types";

let installed = false;
let disposeSalesStockHook: (() => void) | null = null;
let disposePurchaseStockHook: (() => void) | null = null;

/**
 * Install the multiplexing uploader that dispatches by `record.kind`.
 * Phase C: stock_movement is wired to the real cloud uploader.
 * Phase D: purchase header + lines are wired.
 * Phase E: purchase post-sync hook drains the escrowed stock-in payload
 *         and enqueues a `stock_movement` (which the Phase C uploader
 *         then syncs — duplicate stock-in is prevented at the DB level
 *         by the unique idempotency_key index).
 */
export function installSalesUploader(): void {
  if (installed && hasUploader()) return;
  const salesUploader = createSalesUploader(supabase as unknown as SalesSyncSupabase);
  const stockUploader = createStockUploader(supabase as unknown as StockSyncSupabase);
  const purchaseUploader = createPurchaseUploader(
    supabase as unknown as PurchaseSyncSupabase,
  );
  const dispatch: Uploader = (record: TxnSyncRecord) => {
    if (record.kind === "sale_invoice") return salesUploader(record);
    if (record.kind === "stock_movement") return stockUploader(record);
    if (record.kind === "purchase") return purchaseUploader(record);
    throw new Error(
      `Cloud sync for "${record.kind}" is not enabled yet. The entry will stay queued.`,
    );
  };
  registerUploader(dispatch);

  // Re-register the sale post-sync hook idempotently.
  disposeSalesStockHook?.();
  disposeSalesStockHook = registerPostSyncHook(
    "sale_invoice",
    async (rec) => {
      const payload = getLinkedStockPayload(rec.local_id);
      if (!payload) return;
      const res = await enqueueStockMovement({
        companyId: rec.company_id,
        referenceNo: rec.reference_no ?? payload.reference_no ?? null,
        payload: { ...payload, parent_local_id: rec.local_id },
      });
      if (res.ok) clearLinkedStockPayload(rec.local_id);
    },
  );

  // Phase E: purchase → stock-in hook. Same escrow contract as sales.
  disposePurchaseStockHook?.();
  disposePurchaseStockHook = registerPostSyncHook(
    "purchase",
    async (rec) => {
      const payload = getLinkedPurchaseStockPayload(rec.local_id);
      if (!payload) return;
      const res = await enqueueStockMovement({
        companyId: rec.company_id,
        referenceNo: rec.reference_no ?? payload.reference_no ?? null,
        payload: { ...payload, parent_local_id: rec.local_id },
      });
      if (res.ok) clearLinkedPurchaseStockPayload(rec.local_id);
    },
  );

  installed = true;
}

/** Test/reset hook. */
export function __resetUploaderInstall(): void {
  installed = false;
  disposeSalesStockHook?.();
  disposeSalesStockHook = null;
  disposePurchaseStockHook?.();
  disposePurchaseStockHook = null;
  clearPostSyncHooks("sale_invoice");
  clearPostSyncHooks("purchase");
}
