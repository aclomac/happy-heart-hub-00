/**
 * Phase 3 — transaction sync gating.
 *
 * Decides whether a transaction is ALLOWED to be sent to the cloud right
 * now. Local mode is always denied; cloud mode requires both a selected
 * company and an authenticated Supabase session.
 *
 * No actual transaction sync is performed by this module — it only
 * answers "may I sync?" so callers can fail safely before doing any work.
 */
import { supabase } from "@/integrations/supabase/client";
import { getLaunchMode } from "@/lib/launch-mode";
import type { PreflightResult } from "./types";

export async function hasCloudSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.access_token;
  } catch {
    return false;
  }
}

/**
 * Synchronous check (mode + company only). Use this for fast UI gating
 * such as enabling/disabling a "Sync" button. The async variant adds the
 * session check and is what the uploader must use before any network I/O.
 */
export function preflightSyncSync(
  companyId: string | null | undefined,
): PreflightResult {
  if (getLaunchMode() !== "cloud") return { ok: false, reason: "local-mode" };
  if (!companyId) return { ok: false, reason: "no-company" };
  return { ok: true };
}

export async function preflightSync(
  companyId: string | null | undefined,
): Promise<PreflightResult> {
  const fast = preflightSyncSync(companyId);
  if (!fast.ok) return fast;
  const ok = await hasCloudSession();
  if (!ok) return { ok: false, reason: "no-session" };
  return { ok: true };
}

/** True iff transaction sync is allowed at all (cloud mode). */
export function canSyncTransactions(): boolean {
  return getLaunchMode() === "cloud";
}
