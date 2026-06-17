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
import { enqueueStockMovement } from "./stock";
import type { Uploader } from "./replay";
import type { TxnSyncRecord } from "./types";

let installed = false;
let disposeSalesStockHook: (() => void) | null = null;

/**
 * Install the multiplexing uploader that dispatches by `record.kind`.
 * Today only `sale_invoice` is handled directly; `stock_movement`
 * records are queued by the sale's post-sync hook (Phase B integration)
 * but a real cloud uploader for that kind is not enabled yet — it stays
 * queued and surfaces the "not enabled yet" error on the next replay.
 */
export function installSalesUploader(): void {
  if (installed && hasUploader()) return;
  const salesUploader = createSalesUploader(supabase as unknown as SalesSyncSupabase);
  const dispatch: Uploader = (record: TxnSyncRecord) => {
    if (record.kind === "sale_invoice") return salesUploader(record);
    throw new Error(
      `Cloud sync for "${record.kind}" is not enabled yet. The entry will stay queued.`,
    );
  };
  registerUploader(dispatch);

  // Re-register the post-sync hook idempotently.
  disposeSalesStockHook?.();
  disposeSalesStockHook = registerPostSyncHook(
    "sale_invoice",
    async (rec) => {
      const payload = getLinkedStockPayload(rec.local_id);
      if (!payload) return; // Sale had no inventory side-effect — nothing to do.
      const res = await enqueueStockMovement({
        companyId: rec.company_id,
        referenceNo: rec.reference_no ?? payload.reference_no ?? null,
        payload: { ...payload, parent_local_id: rec.local_id },
      });
      // Only clear the escrow once the stock_movement is durably
      // registered + queued. A `not ok` result (e.g. preflight denied)
      // leaves the escrow intact so a later replay/online event can
      // retry it without losing the payload.
      if (res.ok) clearLinkedStockPayload(rec.local_id);
    },
  );

  installed = true;
}

/** Test/reset hook. */
export function __resetUploaderInstall(): void {
  installed = false;
  disposeSalesStockHook?.();
  disposeSalesStockHook = null;
  clearPostSyncHooks("sale_invoice");
}
