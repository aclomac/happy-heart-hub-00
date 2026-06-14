// Pure helpers for restore-backup safety. Kept side-effect-free so they can
// be unit-tested independently of the Restore Backup UI.

import { SAFE_TABLES } from "@/lib/erpovo-backup";

// Money-impacting tables that are intentionally blocked from the safe restore
// flow. Even if a backup file contains them, the restore pipeline must strip
// them before any DB write.
export const DISABLED_TABLES: ReadonlySet<string> = new Set([
  "sales",
  "sale_invoices",
  "sale_orders",
  "purchases",
  "purchase_invoices",
  "purchase_orders",
  "stock_movements",
  "payments",
  "payments_in",
  "payments_out",
  "payment_in",
  "payment_out",
]);

export const DISABLED_MESSAGE =
  "Sales/Purchases restore is disabled for safety. Use advanced restore after extra confirmation.";

export function isDisabledTable(table: string): boolean {
  return DISABLED_TABLES.has(table);
}

export function filterDisabled<T extends string>(tables: readonly T[]): {
  allowed: T[];
  blocked: T[];
} {
  const allowed: T[] = [];
  const blocked: T[] = [];
  for (const t of tables) (DISABLED_TABLES.has(t) ? blocked : allowed).push(t);
  return { allowed, blocked };
}

// Things we never accept inside a backup payload — even if a malicious or
// stale ZIP contains them, they must not reach the restore pipeline.
const FORBIDDEN_KEY_PATTERNS = [
  /^perf[_-]?(stress|test|bench)/i,
  /\.env$/i,
  /^env$/i,
  /secret/i,
  /auth[_-]?token/i,
  /^tokens?$/i,
  /api[_-]?key/i,
];

export function isForbiddenPayloadKey(key: string): boolean {
  return FORBIDDEN_KEY_PATTERNS.some((p) => p.test(key));
}

export function stripForbiddenKeys<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!isForbiddenPayloadKey(k)) out[k] = v;
  }
  return out as Partial<T>;
}

// Filter a restore-data map down to tables that the safe flow accepts.
// Drops both money-impacting tables and PERF/secret-looking pseudo-tables.
export function sanitizeBackupData<V>(data: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [t, rows] of Object.entries(data)) {
    if (DISABLED_TABLES.has(t)) continue;
    if (isForbiddenPayloadKey(t)) continue;
    if (!(SAFE_TABLES as readonly string[]).includes(t)) continue;
    out[t] = rows;
  }
  return out;
}

export type ChecklistInput = {
  hasPreview: boolean;
  hasManifest: boolean;
  hasParseError: boolean;
  companyId: string | null | undefined;
  dryRunCompleted: boolean;
  conflictsReviewed: boolean;
  mode: "merge" | "replace" | null | undefined;
  confirm: boolean;
  typedRestore: string;
  selectedTablesCount: number;
  busy: boolean;
};

export type ChecklistItem = { label: string; ok: boolean };

export function buildRestoreChecklist(i: ChecklistInput): ChecklistItem[] {
  return [
    { label: "Backup file validated", ok: i.hasPreview && !i.hasParseError },
    { label: "Snapshot manifest found", ok: i.hasManifest },
    { label: "Company scoped", ok: !!i.companyId },
    { label: "Secrets excluded", ok: true },
    { label: "PERF data excluded", ok: true },
    { label: "Dry run completed", ok: i.dryRunCompleted },
    { label: "Conflicts reviewed", ok: i.conflictsReviewed },
    { label: "Restore mode selected", ok: i.mode === "merge" || i.mode === "replace" },
    {
      label: "Safety confirmation completed",
      ok: i.confirm && i.typedRestore.trim().toUpperCase() === "RESTORE",
    },
  ];
}

export function canRestore(i: ChecklistInput): boolean {
  if (i.busy) return false;
  if (i.selectedTablesCount <= 0) return false;
  return buildRestoreChecklist(i).every((c) => c.ok);
}
