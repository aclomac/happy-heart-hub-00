DROP POLICY IF EXISTS ps_restrict_non_admin_select ON public.payment_settings;
CREATE POLICY ps_restrict_non_admin_select
ON public.payment_settings
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS rb_select ON public.recycle_bin;
CREATE POLICY rb_select
ON public.recycle_bin
FOR SELECT
TO authenticated
USING (
  public.has_company_role(auth.uid(), company_id, 'owner')
  OR public.has_company_role(auth.uid(), company_id, 'admin')
);