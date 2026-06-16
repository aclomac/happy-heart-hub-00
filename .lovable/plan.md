# Factory Employee Payroll & Production Labour

This is a large multi-module feature. Below is the proposed plan — please confirm scope before I implement, since this touches schema, payroll, production, cash/bank, and reports.

## Scope summary

Add support for 3 employee wage types (Monthly Salary, Daily Wage/Hajira, Contract/Piece-Rate) end-to-end, including product-wise labour rate setup, contract work entries, partial/full payments, accounting impact, and reports.

## 1. Database schema (new migration)

New columns on `employees`:
- `wage_type` enum: `monthly` | `daily` | `contract` (default `monthly`, backfilled from existing `pay_type`)
- `overtime_rate`, `payment_method`, `phone`, `address`, `joining_date`, `designation` (added if missing)

New tables (all with public-schema GRANTs + RLS scoped by `company_id`):
- `labour_rates` — product_id, work_type, rate, unit, effective_date, employee_id (nullable = default), is_active
- `contract_work_entries` — date, employee_id, product_id, work_type, qty, rate, total, production_ref, notes, status (`unpaid`/`partial`/`paid`), paid_amount, company_id
- `contract_payments` — employee_id, payment_date, amount, method, bank_account_id, posted_txn_id, notes
- `contract_payment_allocations` — payment_id, work_entry_id, amount (for partial allocation)

Reuse existing `attendance`, `salary_slips`, `employee_payments`, `cash_transactions` for monthly/daily flows (already present).

## 2. Backend logic (`src/lib/`)

- `src/lib/labour-rates.ts` — CRUD + `resolveRate(employeeId, productId, workType, date)` (worker-specific > default, latest effective_date ≤ work date)
- `src/lib/contract-work.ts` — create/update/delete entries, recompute status from allocations, reverse on delete
- `src/lib/contract-payments.ts` — post payment via existing `cash-ledger.postOnce`/`reverseOnce` (category `contract_labour`), allocate FIFO against unpaid entries, update entry statuses
- Extend `src/lib/soft-delete.ts` MODULES with `contract_work_entries` and `contract_payments` (reverse cash + clear allocations on delete; repost on restore)
- Extend daily-wage calc in `payroll-setup.ts` is already sufficient; add a helper for date-range daily wage generation

## 3. UI — Payroll tabs (`src/routes/app.payroll.tsx`)

Extend existing tab bar:
- Employees (add `wage_type` selector, conditional fields)
- Attendance (existing)
- Monthly Salary (existing Salary Setup + Payments, filtered to `wage_type=monthly`)
- **Daily Wage** (new) — date-range generation from attendance × daily_rate + OT
- **Contract Work** (new) — list + create entries, filter by worker/product/date/status
- **Payments** (existing, extended) — show monthly, daily, and contract payments; for contract show unpaid entry picker
- Reports (existing, extended)

Conditional UI on Employee form: hide monthly fields for daily/contract, show daily rate for daily, etc.

## 4. UI — Production tabs (`src/routes/app.production.tsx`, new)

- **Labour Rate Setup** — table: product × work_type × rate, with worker-specific overrides
- **Work Entry** — quick-entry form (date, worker, product, work_type → rate auto-fills, qty, total auto, save). Bulk paste support.
- **Worker Production** — per-worker daily/weekly production summary
- **Labour Cost** — per-product labour cost rollup

## 5. Reports (`src/routes/app.payroll-reports.tsx` extension)

- Monthly Salary Report
- Daily Wage/Hajira Report
- Contract Worker Payable Report (unpaid by worker)
- Worker-wise Payment Report
- Product-wise Labour Cost Report
- Unpaid Labour Report
- Payroll Summary
- Print/PDF: payslip + contract payment voucher (reuse existing PDF utilities)

## 6. Accounting / Cash & Bank impact

All payments go through `cash-ledger.postOnce` with:
- `category: "salary"` for monthly/daily (existing)
- `category: "contract_labour"` (new) for contract payments
- `reference_type: "contract_payment"` linking back to row

Unpaid contract work entries appear as **Labour Payable** in reports (sum of `total - paid_amount` where status ≠ paid). No GL posting until payment, matching existing payroll behaviour.

## 7. Tests (`src/test/unit/`)

New files:
- `labour-rates.test.ts` — rate resolution precedence (worker > default, effective date)
- `contract-work.test.ts` — total = qty × rate, status transitions
- `contract-payments.test.ts` — full pay, partial pay, FIFO allocation, no double-post on edit, soft-delete reverses cash exactly once, restore re-applies once
- `daily-wage-generation.test.ts` — present × rate + OT, advance/deduction
- Extend `payroll-calc.test.ts` for any new helpers

Run `bunx tsc --noEmit && bun run qa:critical && bun run build` at the end.

## 8. Safety

No changes to: sales/POS, stock posting, purchase, ecommerce sync, backup/restore, existing payroll routes (only additive tabs). Existing `employees.pay_type` kept and mirrored to `wage_type` for backwards compat.

## Technical details

- Migration order: `CREATE TABLE` → `GRANT SELECT,INSERT,UPDATE,DELETE ON ... TO authenticated; GRANT ALL TO service_role;` → `ENABLE RLS` → policies using `company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())` pattern matching existing tables.
- Contract payment uses same `postOnce/reverseOnce` symmetry as `salary_payments.test.ts` to guarantee no double stock/cash posting.
- Labour rate resolution is pure-function and unit-tested without DB.

## Estimated size

~15-20 new files, ~5 file edits, 1 migration. Significant change — I want your go-ahead before starting.

## Questions before I start

1. Should daily wage employees use the existing **Attendance** tab (present/absent/half) as the source for "days present", or do you want a separate Hajira register?
2. For contract work, should the **production reference** link to an existing production/manufacturing module (which I don't see in the project) or just be a free-text field for now?
3. Confirm: contract labour cost should appear as **expense at the time of payment** (cash basis, matching current payroll), not at the time of work entry (accrual). OK?
