/**
 * Phase 3 — uploader bootstrap.
 *
 * Wires the concrete sales uploader (backed by the Supabase client) into
 * the `active-uploader` registry so the manual "Replay offline queue"
 * button and the online-event auto-replay can drain queued sales
 * invoices. Safe to call multiple times — re-registration just replaces
 * the active uploader reference.
 */
import { supabase } from "@/integrations/supabase/client";
import { registerUploader, hasUploader } from "./active-uploader";
import { createSalesUploader, type SalesSyncSupabase } from "./sales";
import type { Uploader } from "./replay";
import type { TxnSyncRecord } from "./types";

let installed = false;

/**
 * Install the multiplexing uploader that dispatches by `record.kind`.
 * Today only `sale_invoice` is handled; other kinds throw a clear
 * "not enabled yet" error so the replay flow fails loudly instead of
 * silently marking a record as synced.
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
  installed = true;
}

/** Test/reset hook. */
export function __resetUploaderInstall(): void {
  installed = false;
}
