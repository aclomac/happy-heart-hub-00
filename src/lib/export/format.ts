// Shared formatting helpers for report exports (CSV, PDF and on-screen totals).
// Keep these pure — no React, no DOM.

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function fmtAmount(value: unknown, currency = ""): string {
  const n = toNumber(value);
  const formatted = n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

export function fmtQty(value: unknown): string {
  const n = toNumber(value);
  // Up to 3 decimals, trim trailing zeros.
  const s = n.toFixed(3);
  return s.replace(/\.?0+$/, "") || "0";
}

export function fmtPct(value: unknown): string {
  const n = toNumber(value);
  return `${n.toFixed(2)}%`;
}
