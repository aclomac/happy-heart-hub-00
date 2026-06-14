# ERPOVO Stable Build — CI QA Passed

**Date:** 2026-06-14
**Tag:** `ERPOVO Stable Build - CI QA Passed`
**Supersedes:** `ERPOVO Stable Build - QA Hardened 1311/1314`

## Build health

- **TypeScript:** 0 errors (`bunx tsc --noEmit`)
- **Tests:** 1332 passed · 3 skipped · 0 failed (1335 total)
- **qa:critical:** 128 / 128 across 11 critical files
- **qa:release:** PASS — release-ready: YES
- **Build:** clean

## What changed in this milestone

- **Restore Backup UI hardening**
  - Persistent company-scoped restore history with clear-history confirmation
  - Conflict preview during dry run (duplicate code/SKU/mobile/email/refs)
  - Safety labels: Safe / Medium Risk / Money Impacting
  - Sales/Purchases shown as disabled with safety notice
  - Restore Safety Checklist (9 items) gates the Restore button
- **Disabled-table enforcement at logic level**
  - `sales`, `sale_invoices`, `sale_orders`, `purchases`, `purchase_invoices`,
    `purchase_orders`, `stock_movements`, `payments`, `payments_in`,
    `payments_out` are stripped before any DB call
- **Restore safety extracted** to `src/lib/restore-safety.ts` and covered by
  21 unit tests in `src/test/unit/restore-safety.test.ts`
- **CI gate added** — `.github/workflows/ci.yml` runs `qa:critical` before build
- **New scripts**
  - `bun run qa:critical` → critical-path regression gate (128 tests)
  - `bun run qa:release` → TS + full tests + build + summary
- **Super Admin Personal-Mode skip** — `super-admin-detail-actions.test.ts`
  layout guard suite marked `describe.skip` with comment:
  `Skipped in Personal Mode: Super Admin disabled intentionally`

## Critical fixes preserved

- Sale invoice number race hardening
- Duplicate-submit guard on `SalesDocForm`
- Stock posting fires **exactly once** per invoice
- Item detail stock logic untouched
- Ecommerce integrations untouched
- 500,000-record cached performance benchmark preserved
- POS / Items / Purchase money logic untouched

## Intentional skips

- 3 tests in `super-admin-detail-actions.test.ts` (Personal Mode disables
  Super Admin entirely; gated assertions no longer apply).
- No production impact.

## Core ERP status

Stable. Sales, Purchase, Payments, Cash/Bank, Payroll, POS, Reports, Items,
Parties, Ecommerce, Recycle Bin, Permissions, Subscription, Performance Test,
Backup Export, and Restore Backup all functional.

## Release manifest integrity

- **Manifest:** `qa-summary.json`
- **Hash file:** `qa-summary.sha256`
- **SHA-256:** `6e9d135e5ec97e458f7c0aeb04033d533493bd546a44ec3121bf828f91420589`
- **Verify:** `bun run qa:manifest:verify` — checks schema, hash match
  (manifest + .sha256), and that all 5 gates PASS. Exits non-zero on any
  drift with `QA manifest hash mismatch`.

**Backup-ready. Release-ready.**
