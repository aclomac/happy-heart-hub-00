/**
 * Audit metadata safety helpers.
 *
 * Hides or masks sensitive fields before rendering audit metadata in UI.
 * Used by AuditDetailDrawer and AuditHistoryModal.
 */

export const SENSITIVE_KEYS = [
  "api_key",
  "apikey",
  "secret",
  "webhook_secret",
  "password",
  "passwd",
  "pwd",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "private_key",
  "client_secret",
];

const SENSITIVE_RE = new RegExp(`(${SENSITIVE_KEYS.join("|")})`, "i");

export const DASH = "—";

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_RE.test(key);
}

/** Mask a device fingerprint to first 4 + last 4 chars. */
export function maskFingerprint(value: string): string {
  if (!value) return DASH;
  if (value.length <= 10) return "•".repeat(Math.max(0, value.length - 2)) + value.slice(-2);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function maskValue(key: string, value: unknown): unknown {
  if (value == null) return value;
  if (isSensitiveKey(key)) return "••••••••";
  if (/fingerprint/i.test(key) && typeof value === "string") return maskFingerprint(value);
  return value;
}

/**
 * Return a safe shallow clone of metadata with sensitive fields masked.
 * Recurses into nested objects/arrays. Non-objects are returned as-is.
 */
export function safeMetadata(input: unknown): unknown {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map((v) => safeMetadata(v));
  if (typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const masked = maskValue(k, v);
    out[k] = masked && typeof masked === "object" ? safeMetadata(masked) : masked;
  }
  return out;
}

/** Display helper: undefined/null → "—", primitives → string, objects → JSON. */
export function safeDisplay(value: unknown): string {
  if (value == null || value === "") return DASH;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return DASH;
  }
}

/** Flatten metadata to safe key/value entries for table rendering. */
export function safeMetadataEntries(input: unknown): Array<{ key: string; value: string }> {
  const safe = safeMetadata(input);
  if (!safe || typeof safe !== "object" || Array.isArray(safe)) return [];
  return Object.entries(safe as Record<string, unknown>).map(([k, v]) => ({
    key: k,
    value: safeDisplay(v),
  }));
}

/** Normalize raw action key to a user-friendly display label. */
const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  restored: "Restored",
  printed: "Printed",
  previewed: "Previewed",
  pdf_opened: "PDF opened",
  duplicated: "Duplicated",
  approved: "Approved",
  rejected: "Rejected",
  under_review: "Under review",
  detail_opened: "Detail opened",
  redemption_exported: "Redemption exported",
  device_removed: "Device removed",
  devices_reset_company: "Devices reset (company)",
};

export function actionDisplayLabel(action: string): string {
  if (!action) return DASH;
  const tail = action.includes(".") ? action.split(".").pop()! : action;
  return (
    ACTION_LABELS[tail] ?? tail.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
