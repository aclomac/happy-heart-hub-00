
-- Bank accounts: branch, note, provider
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS provider text;

-- Cash transactions: link to source documents
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS reference_type text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS reference_id uuid;
CREATE INDEX IF NOT EXISTS idx_cash_txn_ref ON public.cash_transactions(reference_type, reference_id);

-- Loans: extra fields
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS counterparty_type text NOT NULL DEFAULT 'payable';
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS payment_account_kind text;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS payment_bank_id uuid;

-- Loan payments
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  interest_amount numeric NOT NULL DEFAULT 0,
  principal_amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  bank_account_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_payments TO authenticated;
GRANT ALL ON public.loan_payments TO service_role;

ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY lp_select ON public.loan_payments FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY lp_write ON public.loan_payments FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id) AND public.has_role_permission(auth.uid(), company_id, 'cash.write'));

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON public.loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_company ON public.loan_payments(company_id);
