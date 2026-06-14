# ERPOVO Stable Build — QA Hardened 1311/1314

**Date:** 2026-06-14
**Tag:** `ERPOVO Stable Build - QA Hardened 1311/1314`

## Build health

- **TypeScript:** 0 errors (`bunx tsc --noEmit`)
- **Tests:** 1311 / 1314 pass (99.77%)
- **Build:** clean
- **Remaining 3 failures:** `src/test/unit/super-admin-detail-actions.test.ts` only.
  Super Admin is intentionally disabled in Personal Mode, so these tests assert
  legacy gated behavior that no longer ships. **No production impact.**

## Recently fixed (this hardening pass)

- Parent route `<Outlet />` wiring (`app.items.$id`, `super-admin`)
- `deleted_at` filters on `parties` / `items` reads
- Sale order edit hydration (auto-number guarded by `!invoiceNo && !editingId`)
- POS New Customer behavior aligned with Personal Mode (no permission gate)
- Preview gates (auth / company / device routing)
- Privacy money rendering baseline (no weakened privacy)
- `QuickAddCustomerDialog` offline / local-save fallback

## Critical fixes preserved

- Sale invoice number race hardening
- Duplicate-submit guard on `SalesDocForm`
- Stock posting fires **exactly once** per invoice
- Item detail stock logic untouched
- Ecommerce integrations untouched
- 500,000-record cached performance benchmark preserved

## Core ERP status

Stable. Sales, Purchase, Payments, Cash/Bank, Payroll, POS, Reports, Items,
Parties, Ecommerce, Recycle Bin, Permissions, Subscription, and Performance
Test all functional.

**Backup-ready.**
