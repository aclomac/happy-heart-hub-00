import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../helpers/env";

let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

const SEED_TAG = "e2e-seed";

export interface SeedHandle {
  tag: string;
  recordIds: Array<{ table: string; id: string }>;
}

const handle: SeedHandle = { tag: SEED_TAG, recordIds: [] };

export function trackSeededRecord(table: string, id: string) {
  handle.recordIds.push({ table, id });
}

export function getSeedHandle(): SeedHandle {
  return handle;
}

/**
 * Permanently removes any rows that were tagged with the e2e seed marker.
 * Specs that want full isolation should seed inside their own beforeAll
 * blocks and rely on this teardown to wipe everything once the run finishes.
 */
export async function cleanupSeedData() {
  const admin = getAdminClient();
  const companyId = process.env.E2E_COMPANY_ID;
  if (!companyId) return;

  // Wipe recycle bin entries first so FK references don't block.
  await admin
    .from("recycle_bin")
    .delete()
    .eq("company_id", companyId)
    .ilike("reason", `%${SEED_TAG}%`);

  for (const { table, id } of handle.recordIds.splice(0)) {
    await admin.from(table).delete().eq("id", id);
  }
}
