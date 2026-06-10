-- 1. contact_requests: restrict reads to platform admins only
DROP POLICY IF EXISTS cr_admin_read ON public.contact_requests;
CREATE POLICY cr_admin_read ON public.contact_requests
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 2. settings_kv: restrict write policy to authenticated role
DROP POLICY IF EXISTS skv_write ON public.settings_kv;
CREATE POLICY skv_write ON public.settings_kv
  FOR ALL TO authenticated
  USING (public.has_role_permission(auth.uid(), company_id, 'settings.write'))
  WITH CHECK (public.has_role_permission(auth.uid(), company_id, 'settings.write'));

-- 3. platform_admins: replace ALL policy with explicit INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS pa_admin_write ON public.platform_admins;
CREATE POLICY pa_admin_insert ON public.platform_admins
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY pa_admin_update ON public.platform_admins
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY pa_admin_delete ON public.platform_admins
  FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));