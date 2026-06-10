
-- 1. payment_requests: remove global-admin bypasses; platform admins already covered
DROP POLICY IF EXISTS pr_admin_update ON public.payment_requests;
DROP POLICY IF EXISTS pr_own_select ON public.payment_requests;
CREATE POLICY pr_own_select ON public.payment_requests
  FOR SELECT USING (user_id = auth.uid());

-- 2. subscription_plans: remove global-admin write; platform admin policy remains
DROP POLICY IF EXISTS sp_admin_write ON public.subscription_plans;

-- 3. settings_kv: require settings.write role permission (owner/admin auto-true)
DROP POLICY IF EXISTS skv_write ON public.settings_kv;
CREATE POLICY skv_write ON public.settings_kv
  FOR ALL
  USING (public.has_role_permission(auth.uid(), company_id, 'settings.write'))
  WITH CHECK (public.has_role_permission(auth.uid(), company_id, 'settings.write'));
