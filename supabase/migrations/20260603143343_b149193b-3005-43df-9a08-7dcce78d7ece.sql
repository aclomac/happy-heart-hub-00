DROP POLICY IF EXISTS ps_auth_select ON public.payment_settings;
CREATE POLICY ps_platform_admin_select ON public.payment_settings
  FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));