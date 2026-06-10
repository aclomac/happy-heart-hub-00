
-- payment_settings: extend with Phase 2 columns
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS min_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_amount numeric,
  ADD COLUMN IF NOT EXISTS sandbox_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS api_key text,
  ADD COLUMN IF NOT EXISTS webhook_secret text;

-- Switch payment_settings write policies to platform admin
DROP POLICY IF EXISTS ps_admin_insert ON public.payment_settings;
DROP POLICY IF EXISTS ps_admin_update ON public.payment_settings;
DROP POLICY IF EXISTS ps_admin_delete ON public.payment_settings;

CREATE POLICY ps_platform_admin_insert ON public.payment_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY ps_platform_admin_update ON public.payment_settings
  FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY ps_platform_admin_delete ON public.payment_settings
  FOR DELETE TO authenticated
  USING (is_platform_admin(auth.uid()));

-- payment_requests: extend schema
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BDT',
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS proof_url text;

ALTER TABLE public.payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_status_check;
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_status_check
  CHECK (status IN ('pending','under_review','approved','rejected','cancelled'));

ALTER TABLE public.payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_plan_check;

ALTER TABLE public.payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_billing_period_check;
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_billing_period_check
  CHECK (billing_period IN ('monthly','yearly'));

-- Allow platform admins to read and update all payment requests
DROP POLICY IF EXISTS pr_platform_admin_select ON public.payment_requests;
CREATE POLICY pr_platform_admin_select ON public.payment_requests
  FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS pr_platform_admin_update ON public.payment_requests;
CREATE POLICY pr_platform_admin_update ON public.payment_requests
  FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- Allow company owners/admins to read their company's payment requests
DROP POLICY IF EXISTS pr_company_admin_select ON public.payment_requests;
CREATE POLICY pr_company_admin_select ON public.payment_requests
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND (
      has_company_role(auth.uid(), company_id, 'owner'::app_role)
      OR has_company_role(auth.uid(), company_id, 'admin'::app_role)
    )
  );

CREATE INDEX IF NOT EXISTS idx_pr_company ON public.payment_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON public.payment_requests(status);
