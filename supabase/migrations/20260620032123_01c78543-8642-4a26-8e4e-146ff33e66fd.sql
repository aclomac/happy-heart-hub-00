
DROP POLICY IF EXISTS oo_member_delete ON public.online_orders;
CREATE POLICY oo_member_delete ON public.online_orders
  FOR DELETE TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
  );

DROP POLICY IF EXISTS oo_member_write ON public.online_orders;
CREATE POLICY oo_member_write ON public.online_orders
  FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'sales.write')
  );

DROP POLICY IF EXISTS "osi_auth_write" ON public.online_store_items;

CREATE POLICY osi_auth_insert ON public.online_store_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'items.write')
  );

CREATE POLICY osi_auth_update ON public.online_store_items
  FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'items.write')
  );

CREATE POLICY osi_auth_delete ON public.online_store_items
  FOR DELETE TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'items.write')
  );
