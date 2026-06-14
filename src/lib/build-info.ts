// Internal build metadata for ERPOVO. Updated when a new stable
// checkpoint is approved by QA. Do not change casually.
export const BUILD_LABEL = "ERPOVO Stable Build - Data Verification Clean";
export const BUILD_STAMP = "2026-06-14";
export const BUILD_NOTES: string[] = [
  "Verify My Data clean (0 duplicates, 0 missing names, 0 negative stock, 0 missing customers)",
  "Stock adjustment modal hardened (selected store vs total item stock shown)",
  "Quantity 0 validation on stock adjustments",
  "Store-wise stock consistency check with mismatch warning",
  "Negative stock prevention on Sale Invoice and POS",
  "Stop-sale-on-negative-stock setting wired",
  "Set Opening Stock / Set Current Stock correction flow on Item Details",
  "Missing customer repair: Assign Walk-in Customer (bulk/single)",
  "Recalculate stock from ledger action",
  "Sale Invoice single-source inventory posting (no double deduction)",
  "Auto stock posting on sale save (no Rebuild required)",
  "Dashboard summary cards clickable with filtered drill-down",
  "Performance Test utility (1L records, isolated IndexedDB, safe cleanup)",
  "Performance Test: precomputed PERF aggregate cache (Cached vs Fresh Full Scan modes)",
  "Performance Test: visible Cache Status + Build/Rebuild PERF Cache control",
  "Performance Test: All PERF Records (Cached) benchmark < 60ms target on 100k records",
  "Performance Test: diagnostics row (used cache / used full scan / rows scanned / rendered)",
  "Live Integration Wizard QA Passed",
  "WooCommerce product/order import + Steadfast courier send working",
  "Core ERP working: Sale Invoice, POS, Items, Purchase, Quotation, Parties",
  "Print/PDF/Export working",
  "QA: workflows green · Critical 0 · Backup ready",
];
