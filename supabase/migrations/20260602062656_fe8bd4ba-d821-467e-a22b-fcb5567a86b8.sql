CREATE TABLE public.cash_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  recon_date date NOT NULL DEFAULT CURRENT_DATE,
  store text,
  opening_balance numeric NOT NULL DEFAULT 0,
  system_balance numeric NOT NULL DEFAULT 0,
  physical_balance numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'matched',
  note text,
  attachment_url text,
  responsible_user_id uuid,
  adjustment_txn_id uuid,
  is_cancelled boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_reconciliations TO authenticated;
GRANT ALL ON public.cash_reconciliations TO service_role;

ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY recon_select ON public.cash_reconciliations
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY recon_write ON public.cash_reconciliations
  FOR ALL TO authenticated
  USING (has_company_access(auth.uid(), company_id) AND company_has_active_subscription(company_id))
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND company_has_active_subscription(company_id)
    AND has_role_permission(auth.uid(), company_id, 'cash.write')
  );

CREATE INDEX idx_cash_recon_company_date ON public.cash_reconciliations (company_id, recon_date DESC);
CREATE INDEX idx_cash_recon_company_status ON public.cash_reconciliations (company_id, status);