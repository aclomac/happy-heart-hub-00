-- Tighten operational/ecommerce write access: require active subscription and sales write permission.
DROP POLICY IF EXISTS "Users can manage couriers for their company" ON public.couriers;
CREATE POLICY "Users can insert couriers for their company"
ON public.couriers
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can update couriers for their company"
ON public.couriers
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can delete couriers for their company"
ON public.couriers
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);

DROP POLICY IF EXISTS "Users can manage cod_settlements for their company" ON public.cod_settlements;
CREATE POLICY "Users can insert cod_settlements for their company"
ON public.cod_settlements
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can update cod_settlements for their company"
ON public.cod_settlements
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can delete cod_settlements for their company"
ON public.cod_settlements
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);

DROP POLICY IF EXISTS "Users can manage cod_receipts for their company" ON public.cod_receipts;
CREATE POLICY "Users can insert cod_receipts for their company"
ON public.cod_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can update cod_receipts for their company"
ON public.cod_receipts
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can delete cod_receipts for their company"
ON public.cod_receipts
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);

DROP POLICY IF EXISTS "Users can manage return_exchange for their company" ON public.return_exchange;
CREATE POLICY "Users can insert return_exchange for their company"
ON public.return_exchange
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can update return_exchange for their company"
ON public.return_exchange
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can delete return_exchange for their company"
ON public.return_exchange
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);

DROP POLICY IF EXISTS "Users can manage replacement_items for their company" ON public.replacement_items;
CREATE POLICY "Users can insert replacement_items for their company"
ON public.replacement_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can update replacement_items for their company"
ON public.replacement_items
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);
CREATE POLICY "Users can delete replacement_items for their company"
ON public.replacement_items
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
);

-- Split other income access so reads remain company-scoped while writes require finance permission.
DROP POLICY IF EXISTS "Users can manage their company's other incomes" ON public.other_incomes;
CREATE POLICY "Users can view their company's other incomes"
ON public.other_incomes
FOR SELECT
TO authenticated
USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can insert their company's other incomes"
ON public.other_incomes
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);
CREATE POLICY "Users can update their company's other incomes"
ON public.other_incomes
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);
CREATE POLICY "Users can delete their company's other incomes"
ON public.other_incomes
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);

DROP POLICY IF EXISTS "Users can manage their company's other income categories" ON public.other_income_categories;
CREATE POLICY "Users can view their company's other income categories"
ON public.other_income_categories
FOR SELECT
TO authenticated
USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY "Users can insert their company's other income categories"
ON public.other_income_categories
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);
CREATE POLICY "Users can update their company's other income categories"
ON public.other_income_categories
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);
CREATE POLICY "Users can delete their company's other income categories"
ON public.other_income_categories
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);

-- Add missing active-subscription checks to existing module write policies.
DROP POLICY IF EXISTS iv_write ON public.item_variants;
CREATE POLICY iv_insert
ON public.item_variants
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'items.write')
);
CREATE POLICY iv_update
ON public.item_variants
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'items.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'items.write')
);
CREATE POLICY iv_delete
ON public.item_variants
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'items.write')
);

DROP POLICY IF EXISTS mc_write ON public.marketing_campaigns;
CREATE POLICY mc_insert
ON public.marketing_campaigns
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);
CREATE POLICY mc_update
ON public.marketing_campaigns
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);
CREATE POLICY mc_delete
ON public.marketing_campaigns
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);

DROP POLICY IF EXISTS mcost_write ON public.marketing_costs;
CREATE POLICY mcost_insert
ON public.marketing_costs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);
CREATE POLICY mcost_update
ON public.marketing_costs
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);
CREATE POLICY mcost_delete
ON public.marketing_costs
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
);

-- Online store settings changes require settings write permission.
DROP POLICY IF EXISTS oss_write ON public.online_store_settings;
CREATE POLICY oss_insert
ON public.online_store_settings
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'settings.write')
);
CREATE POLICY oss_update
ON public.online_store_settings
FOR UPDATE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'settings.write')
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'settings.write')
);
CREATE POLICY oss_delete
ON public.online_store_settings
FOR DELETE
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND public.company_has_active_subscription(company_id)
  AND public.has_role_permission(auth.uid(), company_id, 'settings.write')
);

-- Order status history reads require sales access instead of membership alone.
DROP POLICY IF EXISTS "Users can view logs for their company" ON public.online_order_status_logs;
CREATE POLICY "Users can view logs for their company"
ON public.online_order_status_logs
FOR SELECT
TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND (
    public.has_role_permission(auth.uid(), company_id, 'sales.read')
    OR public.has_role_permission(auth.uid(), company_id, 'sales.view')
    OR public.has_role_permission(auth.uid(), company_id, 'sales.write')
  )
);