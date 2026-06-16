## Factory Payroll & Production Labour — Revised Implementation Plan

Based on your answers:
1. ✅ Apply staged SQL migration
2. ✅ Daily wage uses existing Attendance (present + 0.5 × half)
3. ✅ Production ref = free-text (optional link later)
4. ⚠️ **Accrual accounting** for contract labour (was cash-basis in earlier draft — needs rework)

### Phase 1 — Database (apply migration)

Apply `scripts/pending-migrations/20260617_factory_payroll.sql` via the migration tool:
- `employees`: `wage_type`, `daily_wage`, `overtime_rate`, `payment_method`
- `labour_rates`, `contract_work_entries`, `contract_payments`, `contract_payment_allocations`
- All with RLS + GRANTs + `is_company_member` policies

### Phase 2 — Accrual accounting rework

Earlier draft posts cash impact only at payment time. Switch to accrual:

- **At work entry creation** → post `labour_expense` (DR) / `labour_payable` (CR) via `postOnce` with `category: 'contract_labour_accrual'`, `referenceType: 'contract_work_entry'`, ref = entry id, `direction: 'accrual'` (no cash movement).
- **At work entry edit/delete** → `reverseOnce` then re-post if still active.
- **At payment** → post `labour_payable` (DR) / `cash|bank` (CR) via `postOnce` with `category: 'contract_labour_payment'`. No expense double-count.
- **FIFO allocation** unchanged: pays oldest unpaid entries first; `paid_amount` + `status` updated.
- **Reverse payment** → undo cash impact + restore work entry balances.

Touches:
- `src/lib/cash-ledger.ts` — add `direction: 'accrual'` variant (skip bank balance change but still create journal row) OR add separate `postAccrual` helper. Pick the lighter touch — add `postAccrual` to avoid changing the cash-impact contract.
- `src/lib/contract-work.ts` — call `postAccrual` on create, `reverseOnce` on delete/qty/rate change then re-post.
- `src/lib/contract-payments.ts` — change category to `contract_labour_payment`, no longer the expense origin.

### Phase 3 — UI tabs

Extend `src/routes/app.payroll.tsx` TABS with:
- `daily-wage` — Daily Wage Register (reads existing attendance, shows days × daily_wage + OT, pay button)
- `contract-work` — Work Entry list + form (date, employee filter wage_type=contract, item, work_type, qty, rate auto-filled from `labour_rates`, total computed, optional production_ref free-text, notes)
- `contract-payments` — Pay worker form (employee, amount, method, bank, date, notes) → FIFO allocation preview + post

Extend EmployeesSection form: add `wage_type`, `daily_wage`, `overtime_rate`, `payment_method` fields.

New Production tab module (`src/routes/app.production.tsx`):
- Labour Rate Setup — CRUD `labour_rates` (item × work_type × rate, optional employee override, effective_date)
- Work Entry — shortcut to contract-work tab
- Worker Production — per-worker production summary
- Product-wise Labour Cost — item × total labour qty/cost

### Phase 4 — Reports

In `PayrollReportsSection`, add report types:
- Monthly Salary Report (existing)
- Daily Wage Report (employee × month, days × rate)
- Contract Payable Report (employee × outstanding due)
- Worker-wise Production (employee × period × qty × earnings)
- Product-wise Labour Cost (item × qty × cost)
- Unpaid Labour Report (entries with status ≠ paid)
- Payroll Summary (all 3 wage types combined)
- PDF print for each via existing `print-utils`

### Phase 5 — Tests

Update + add:
- `contract-work.test.ts` — accrual hooks (mock postOnce/reverseOnce)
- `contract-payments.test.ts` — FIFO + payment category
- `labour-rates.test.ts` — already exists, keep
- `daily-wage-calc.test.ts` — new: days_present × daily_wage + OT × overtime_rate

### Phase 6 — Verify

- `bunx tsc --noEmit`
- `bun run qa:critical`
- `bun run build`

### What stays untouched

Sales/POS, stock, purchases, ecommerce, Steadfast, backup/restore, dashboard, existing payroll routes for monthly salary employees.

### Scope acknowledgement

This is a sizable build (~15-20 files, ~2000 lines). I'll work in the order above, checking in after Phase 1 (migration applied) and after Phase 3 (UI usable) so you can test along the way rather than waiting for everything at once.
