-- Prevent public table reads from exposing online store WhatsApp numbers.
DROP POLICY IF EXISTS oss_public_read ON public.online_store_settings;
REVOKE SELECT ON public.online_store_settings FROM anon;

CREATE OR REPLACE VIEW public.public_online_store_settings AS
SELECT
  id,
  company_id,
  store_name,
  slug,
  description,
  logo_url,
  cover_url,
  settings,
  is_active,
  view_count,
  created_at,
  updated_at
FROM public.online_store_settings
WHERE is_active = true;

GRANT SELECT ON public.public_online_store_settings TO anon;
GRANT SELECT ON public.public_online_store_settings TO authenticated;
GRANT ALL ON public.public_online_store_settings TO service_role;

-- Limit payroll/contract policies to signed-in users only.
DROP POLICY IF EXISTS labour_rates_member_read ON public.labour_rates;
DROP POLICY IF EXISTS labour_rates_member_write ON public.labour_rates;
CREATE POLICY labour_rates_member_read
ON public.labour_rates
FOR SELECT
TO authenticated
USING (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
);
CREATE POLICY labour_rates_member_write
ON public.labour_rates
FOR ALL
TO authenticated
USING (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
)
WITH CHECK (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
  AND public.has_role_permission(auth.uid(), company_id, 'payroll.write')
);

DROP POLICY IF EXISTS contract_work_member_read ON public.contract_work_entries;
DROP POLICY IF EXISTS contract_work_member_write ON public.contract_work_entries;
CREATE POLICY contract_work_member_read
ON public.contract_work_entries
FOR SELECT
TO authenticated
USING (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
);
CREATE POLICY contract_work_member_write
ON public.contract_work_entries
FOR ALL
TO authenticated
USING (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
)
WITH CHECK (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
  AND public.has_role_permission(auth.uid(), company_id, 'payroll.write')
);

DROP POLICY IF EXISTS contract_payments_member_read ON public.contract_payments;
DROP POLICY IF EXISTS contract_payments_member_write ON public.contract_payments;
CREATE POLICY contract_payments_member_read
ON public.contract_payments
FOR SELECT
TO authenticated
USING (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
);
CREATE POLICY contract_payments_member_write
ON public.contract_payments
FOR ALL
TO authenticated
USING (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
)
WITH CHECK (
  public.is_company_member(company_id, auth.uid())
  AND public.company_has_active_subscription(company_id)
  AND public.company_has_feature(company_id, 'payroll')
  AND public.has_role_permission(auth.uid(), company_id, 'payroll.write')
);

DROP POLICY IF EXISTS contract_alloc_member_read ON public.contract_payment_allocations;
DROP POLICY IF EXISTS contract_alloc_member_write ON public.contract_payment_allocations;
CREATE POLICY contract_alloc_member_read
ON public.contract_payment_allocations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contract_payments p
    WHERE p.id = contract_payment_allocations.payment_id
      AND public.is_company_member(p.company_id, auth.uid())
      AND public.company_has_active_subscription(p.company_id)
      AND public.company_has_feature(p.company_id, 'payroll')
  )
);
CREATE POLICY contract_alloc_member_write
ON public.contract_payment_allocations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contract_payments p
    WHERE p.id = contract_payment_allocations.payment_id
      AND public.is_company_member(p.company_id, auth.uid())
      AND public.company_has_active_subscription(p.company_id)
      AND public.company_has_feature(p.company_id, 'payroll')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.contract_payments p
    WHERE p.id = contract_payment_allocations.payment_id
      AND public.is_company_member(p.company_id, auth.uid())
      AND public.company_has_active_subscription(p.company_id)
      AND public.company_has_feature(p.company_id, 'payroll')
      AND public.has_role_permission(auth.uid(), p.company_id, 'payroll.write')
  )
);