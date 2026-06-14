# ERPOVO Stable Build — CI QA Passed

**Date:** 2026-06-14
**Tag:** `ERPOVO Stable Build - CI QA Passed`

## CI QA Summary

| Gate                       | Result                                              |
| -------------------------- | --------------------------------------------------- |
| TypeScript (`tsc --noEmit`)| **PASS** — 0 errors                                 |
| Full tests (`bun run test`)| **PASS** — 1332 passed · 3 skipped · 0 failed       |
| Critical (`qa:critical`)   | **PASS** — 128 / 128 across 11 critical files       |
| Release (`qa:release`)     | **PASS** — release-ready: YES                       |
| Build (`bun run build`)    | **PASS** — clean                                    |

### Intentional skips

- `src/test/unit/super-admin-detail-actions.test.ts` → `Super Admin layout guard`
  describe block is `describe.skip` with comment:
  `Skipped in Personal Mode: Super Admin disabled intentionally`
- No other tests are skipped.
- No flaky-retry harness was added (no real flake observed).
- No coverage gate added at this milestone.

## Critical safeguards preserved

- **Sale invoice number race hardening** — atomic next-number reservation.
- **Duplicate-submit guard** — `SalesDocForm` blocks re-entry while in-flight.
- **Stock posting fires exactly once** per invoice.
- **Restore safety** — 21 unit tests in `src/test/unit/restore-safety.test.ts`
  cover disabled-table enforcement, PERF/secrets exclusion, checklist gating,
  invalid-backup error path, and history-entry shape.
- **Disabled money-impacting restore tables** — `sales`, `sale_invoices`,
  `sale_orders`, `purchases`, `purchase_invoices`, `purchase_orders`,
  `stock_movements`, `payments`, `payments_in`, `payments_out` are stripped
  inside the restore pipeline even if a backup file contains them.
- **500,000-record cached performance benchmark** preserved (Performance Test
  utility untouched).
- **Item detail stock logic / Ecommerce integrations / POS** untouched.

## qa:critical files included

- restore-safety
- sale-invoice (race + duplicate-submit guards)
- stock-posting
- deleted-at-filter
- parent-routes-outlet
- pos-customer
- sale-orders-workflow
- performance (cache / benchmark logic where present)
- duplicate-submit

All 11 matched files: **128 / 128 passing.**

## How to reproduce locally

```bash
bunx tsc --noEmit
bun run qa:critical
bun run qa:release
bun run build
```

`qa:release` prints the same summary block shown above and exits non-zero on
any failure, so CI rejects regressions automatically.

## Manifest integrity

The machine-readable manifest is `qa-summary.json`, checksummed with SHA-256.

- **Algorithm:** sha256
- **Hash:** `6e9d135e5ec97e458f7c0aeb04033d533493bd546a44ec3121bf828f91420589`
- **Hash file:** `qa-summary.sha256` (sha256sum-compatible)
- **Embedded in:** `qa-summary.json` → `integrity.value`

Verify the manifest at any time:

```bash
bun run qa:manifest:verify
```

This checks: file exists, schema valid, hash matches both
`integrity.value` and `qa-summary.sha256`, and all 5 gates PASS. On
mismatch it prints `QA manifest hash mismatch` and exits non-zero.

**Release-ready: YES.**
