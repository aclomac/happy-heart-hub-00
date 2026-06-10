import { expect } from "@playwright/test";
import { getAdminClient } from "../fixtures/seed";

interface AuditQuery {
  companyId: string;
  recordId: string;
  action:
    | "deleted"
    | "restored"
    | "blocked_restore"
    | "permanent_delete"
    | "failed_restore"
    | "permission_denied";
  minCount?: number;
  exactCount?: number;
  within?: { sinceISO: string };
}

export async function expectAuditEntry(q: AuditQuery) {
  const admin = getAdminClient();
  let query = admin
    .from("audit_logs")
    .select("id, action, status, created_at", { count: "exact" })
    .eq("company_id", q.companyId)
    .eq("record_id", q.recordId)
    .eq("action", q.action);

  if (q.within?.sinceISO) {
    query = query.gte("created_at", q.within.sinceISO);
  }

  // Retry a few times — audit writes are async right after a mutation.
  for (let i = 0; i < 6; i++) {
    const { count, error } = await query;
    if (error) throw error;
    const c = count ?? 0;
    if (q.exactCount !== undefined && c === q.exactCount) return;
    if (q.exactCount === undefined && c >= (q.minCount ?? 1)) return;
    await new Promise((r) => setTimeout(r, 500));
  }

  const { count } = await query;
  expect(
    count ?? 0,
    `expected audit_logs.${q.action} for record ${q.recordId} (exact=${q.exactCount ?? "n/a"}, min=${q.minCount ?? 1})`,
  ).toBeGreaterThanOrEqual(q.exactCount ?? q.minCount ?? 1);
}
