/**
 * Sale Invoice Status Timeline helpers.
 *
 * Reads from the existing `audit_logs` table (NO new audit system). Maps
 * raw action strings to user-friendly labels + i18n keys. Safe for unit
 * testing: the mapper is a pure function.
 */

import { supabase } from "@/integrations/supabase/client";
import { safeMetadata } from "@/lib/audit-metadata-safety";

export type TimelineEventKind =
  | "created"
  | "updated"
  | "payment"
  | "printed"
  | "pdf"
  | "cancelled"
  | "restored"
  | "deleted"
  | "other";

export type RawAuditRow = {
  id: string;
  created_at: string;
  action: string;
  module: string | null;
  entity_type: string | null;
  entity_id: string | null;
  reference_no: string | null;
  metadata: unknown;
  user_id: string | null;
};

export type TimelineEvent = {
  id: string;
  at: string;
  kind: TimelineEventKind;
  /** i18n key for label (must exist in translations). */
  labelKey: string;
  /** Human-readable action fallback (en). */
  fallbackLabel: string;
  userId: string | null;
  /** Sanitised metadata (no secrets / PII). */
  metadata: Record<string, unknown>;
};

const ACTION_MAP: Array<{
  match: RegExp | string;
  kind: TimelineEventKind;
  labelKey: string;
  fallback: string;
}> = [
  {
    match: /^created$/i,
    kind: "created",
    labelKey: "Invoice Created",
    fallback: "Invoice Created",
  },
  {
    match: /^updated$/i,
    kind: "updated",
    labelKey: "Invoice Updated",
    fallback: "Invoice Updated",
  },
  { match: /^cancelled$/i, kind: "cancelled", labelKey: "Cancelled", fallback: "Cancelled" },
  { match: /^restored$/i, kind: "restored", labelKey: "Restored", fallback: "Restored" },
  { match: /^deleted$/i, kind: "deleted", labelKey: "Deleted", fallback: "Deleted" },
  {
    match: /payment/i,
    kind: "payment",
    labelKey: "Payment Received",
    fallback: "Payment Received",
  },
  { match: /print/i, kind: "printed", labelKey: "Printed", fallback: "Printed" },
  { match: /pdf/i, kind: "pdf", labelKey: "PDF Downloaded", fallback: "PDF Downloaded" },
  {
    match: /number_generated/i,
    kind: "created",
    labelKey: "Invoice Created",
    fallback: "Invoice Created",
  },
];

export function mapAuditRowToEvent(row: RawAuditRow): TimelineEvent {
  const action = row.action || "";
  const hit = ACTION_MAP.find((m) =>
    typeof m.match === "string" ? m.match === action : m.match.test(action),
  );
  return {
    id: row.id,
    at: row.created_at,
    kind: hit?.kind ?? "other",
    labelKey: hit?.labelKey ?? action,
    fallbackLabel: hit?.fallback ?? action,
    userId: row.user_id,
    metadata: safeMetadata(row.metadata) as Record<string, unknown>,
  };
}

export function mapAuditRowsToEvents(rows: RawAuditRow[]): TimelineEvent[] {
  return rows.map(mapAuditRowToEvent);
}

export async function fetchSaleInvoiceTimeline(args: {
  companyId: string;
  saleId: string;
  invoiceNo: string | null;
}): Promise<TimelineEvent[]> {
  const { companyId, saleId, invoiceNo } = args;
  // Match either entity_id=saleId OR (reference_no=invoiceNo AND module=Sales).
  // Different code paths historically used either column.
  let q = supabase
    .from("audit_logs")
    .select(
      "id, created_at, action, module, entity_type, entity_id, reference_no, metadata, user_id",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (invoiceNo) {
    q = q.or(`entity_id.eq.${saleId},reference_no.eq.${invoiceNo}`);
  } else {
    q = q.eq("entity_id", saleId);
  }

  const { data, error } = await q;
  if (error) throw error;
  return mapAuditRowsToEvents((data ?? []) as RawAuditRow[]);
}
