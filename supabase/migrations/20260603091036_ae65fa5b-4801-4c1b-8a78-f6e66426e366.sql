
DROP POLICY IF EXISTS role_perm_write ON public.role_permissions;
CREATE POLICY role_perm_write ON public.role_permissions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = role_permissions.company_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = role_permissions.company_id AND c.owner_id = auth.uid()));
