
-- 1. Stock transfers: add subscription + items.write permission to writes
DROP POLICY IF EXISTS st_write ON public.stock_transfers;
CREATE POLICY st_write ON public.stock_transfers
  FOR ALL
  USING (
    has_company_access(auth.uid(), company_id)
    AND company_has_active_subscription(company_id)
  )
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND company_has_active_subscription(company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  );

-- 2. Labour / contract tables: split read vs write, add payroll gates
DROP POLICY IF EXISTS labour_rates_member_all ON public.labour_rates;
CREATE POLICY labour_rates_member_read ON public.labour_rates
  FOR SELECT
  USING (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
  );
CREATE POLICY labour_rates_member_write ON public.labour_rates
  FOR ALL
  USING (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
  )
  WITH CHECK (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
    AND has_role_permission(auth.uid(), company_id, 'payroll.write')
  );

DROP POLICY IF EXISTS contract_payments_member_all ON public.contract_payments;
CREATE POLICY contract_payments_member_read ON public.contract_payments
  FOR SELECT
  USING (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
  );
CREATE POLICY contract_payments_member_write ON public.contract_payments
  FOR ALL
  USING (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
  )
  WITH CHECK (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
    AND has_role_permission(auth.uid(), company_id, 'payroll.write')
  );

DROP POLICY IF EXISTS contract_work_member_all ON public.contract_work_entries;
CREATE POLICY contract_work_member_read ON public.contract_work_entries
  FOR SELECT
  USING (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
  );
CREATE POLICY contract_work_member_write ON public.contract_work_entries
  FOR ALL
  USING (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
  )
  WITH CHECK (
    is_company_member(company_id, auth.uid())
    AND company_has_active_subscription(company_id)
    AND company_has_feature(company_id, 'payroll')
    AND has_role_permission(auth.uid(), company_id, 'payroll.write')
  );

DROP POLICY IF EXISTS contract_alloc_member_all ON public.contract_payment_allocations;
CREATE POLICY contract_alloc_member_read ON public.contract_payment_allocations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contract_payments p
      WHERE p.id = contract_payment_allocations.payment_id
        AND is_company_member(p.company_id, auth.uid())
        AND company_has_active_subscription(p.company_id)
        AND company_has_feature(p.company_id, 'payroll')
    )
  );
CREATE POLICY contract_alloc_member_write ON public.contract_payment_allocations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.contract_payments p
      WHERE p.id = contract_payment_allocations.payment_id
        AND is_company_member(p.company_id, auth.uid())
        AND company_has_active_subscription(p.company_id)
        AND company_has_feature(p.company_id, 'payroll')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contract_payments p
      WHERE p.id = contract_payment_allocations.payment_id
        AND is_company_member(p.company_id, auth.uid())
        AND company_has_active_subscription(p.company_id)
        AND company_has_feature(p.company_id, 'payroll')
        AND has_role_permission(auth.uid(), p.company_id, 'payroll.write')
    )
  );

-- 3. online_store_settings: hide whatsapp_number from anonymous public reads.
--    Company members keep full access via oss_member_read.
REVOKE SELECT (whatsapp_number) ON public.online_store_settings FROM anon;
