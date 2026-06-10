
-- recycle_bin: split write policy
DROP POLICY IF EXISTS rb_write ON public.recycle_bin;
CREATE POLICY rb_insert ON public.recycle_bin FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));
CREATE POLICY rb_update ON public.recycle_bin FOR UPDATE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'))
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'admin'));
CREATE POLICY rb_delete ON public.recycle_bin FOR DELETE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

-- stock_movements: require a write-capable role
DROP POLICY IF EXISTS sm_write ON public.stock_movements;
CREATE POLICY sm_write ON public.stock_movements FOR ALL TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND (
      public.has_role_permission(auth.uid(), company_id, 'items.write')
      OR public.has_role_permission(auth.uid(), company_id, 'sales.write')
      OR public.has_role_permission(auth.uid(), company_id, 'purchases.write')
    )
  )
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND (
      public.has_role_permission(auth.uid(), company_id, 'items.write')
      OR public.has_role_permission(auth.uid(), company_id, 'sales.write')
      OR public.has_role_permission(auth.uid(), company_id, 'purchases.write')
    )
  );

-- item_store_stock: derived cache, only admin/owner may touch directly
DROP POLICY IF EXISTS iss_write ON public.item_store_stock;
CREATE POLICY iss_write ON public.item_store_stock FOR ALL TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'))
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'admin'));
