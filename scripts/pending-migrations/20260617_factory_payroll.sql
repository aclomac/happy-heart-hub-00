-- PENDING MIGRATION — apply this SQL via the Supabase migration tool when available,
-- or copy into supabase/migrations/ with a fresh timestamp prefix.
-- Adds Factory Employee Payroll & Production Labour tables.

-- 1) Employees: add wage_type, daily_wage, overtime_rate, payment_method
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS wage_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS daily_wage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE public.employees
  SET wage_type = CASE
    WHEN pay_type = 'daily' THEN 'daily'
    WHEN pay_type = 'contract' THEN 'contract'
    ELSE 'monthly'
  END
  WHERE wage_type = 'monthly';

DO $$ BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_wage_type_chk
    CHECK (wage_type IN ('monthly', 'daily', 'contract'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Labour rates: product × work_type × rate, with optional worker override
CREATE TABLE IF NOT EXISTS public.labour_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  work_type text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  unit text DEFAULT 'pcs',
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labour_rates TO authenticated;
GRANT ALL ON public.labour_rates TO service_role;
ALTER TABLE public.labour_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labour_rates_member_all ON public.labour_rates;
CREATE POLICY labour_rates_member_all ON public.labour_rates FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE INDEX IF NOT EXISTS labour_rates_lookup_idx
  ON public.labour_rates (company_id, item_id, work_type, effective_date DESC);

-- 3) Contract work entries
CREATE TABLE IF NOT EXISTS public.contract_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  work_type text NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  production_ref text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_work_status_chk CHECK (status IN ('unpaid', 'partial', 'paid'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_work_entries TO authenticated;
GRANT ALL ON public.contract_work_entries TO service_role;
ALTER TABLE public.contract_work_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_work_member_all ON public.contract_work_entries;
CREATE POLICY contract_work_member_all ON public.contract_work_entries FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE INDEX IF NOT EXISTS contract_work_emp_idx
  ON public.contract_work_entries (company_id, employee_id, status);

-- 4) Contract payments + allocations
CREATE TABLE IF NOT EXISTS public.contract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  posted_txn_id uuid,
  notes text,
  status text NOT NULL DEFAULT 'posted',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO authenticated;
GRANT ALL ON public.contract_payments TO service_role;
ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_payments_member_all ON public.contract_payments;
CREATE POLICY contract_payments_member_all ON public.contract_payments FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.contract_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.contract_payments(id) ON DELETE CASCADE,
  work_entry_id uuid NOT NULL REFERENCES public.contract_work_entries(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payment_allocations TO authenticated;
GRANT ALL ON public.contract_payment_allocations TO service_role;
ALTER TABLE public.contract_payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_alloc_member_all ON public.contract_payment_allocations;
CREATE POLICY contract_alloc_member_all ON public.contract_payment_allocations FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contract_payments p
    WHERE p.id = payment_id AND public.is_company_member(p.company_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contract_payments p
    WHERE p.id = payment_id AND public.is_company_member(p.company_id, auth.uid())
  ));
