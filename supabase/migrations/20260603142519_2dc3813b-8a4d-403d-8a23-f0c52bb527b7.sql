DROP POLICY IF EXISTS sti_write ON public.stock_transfer_items;
CREATE POLICY sti_write ON public.stock_transfer_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_items.transfer_id
      AND public.has_company_access(auth.uid(), t.company_id)
      AND public.has_role_permission(auth.uid(), t.company_id, 'items.write')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_items.transfer_id
      AND public.has_company_access(auth.uid(), t.company_id)
      AND public.company_has_active_subscription(t.company_id)
      AND public.has_role_permission(auth.uid(), t.company_id, 'items.write')
  ));