/**
 * Phase-5 prep — local master data → cloud upload payloads.
 *
 * Pure read of the local demo store. No network calls.
 * Phase 5 will consume this output and write to Supabase.
 */
import { getItems, getCategories, getWarehouses } from "@/lib/demo/inventory";
import { getParties, getPartyGroups } from "@/lib/demo/parties";

export type LocalMasterDataPayload = {
  items: ReturnType<typeof getItems>;
  item_categories: ReturnType<typeof getCategories>;
  warehouses: ReturnType<typeof getWarehouses>;
  parties: ReturnType<typeof getParties>;
  party_groups: ReturnType<typeof getPartyGroups>;
};

/**
 * Collects every local master record belonging to `companyId`, excluding
 * soft-deleted rows. Phase 5 will batch-insert these into Supabase using
 * the same shape; for now this just enables the upload-readiness check.
 */
export function prepareLocalMasterDataForUpload(
  companyId: string,
): LocalMasterDataPayload {
  const active = <T extends { company_id: string; deleted_at: string | null }>(
    rows: T[],
  ): T[] => rows.filter((r) => r.company_id === companyId && !r.deleted_at);

  return {
    items: active(getItems()),
    item_categories: active(getCategories()),
    warehouses: active(getWarehouses()),
    parties: active(getParties()),
    party_groups: active(getPartyGroups()),
  };
}
