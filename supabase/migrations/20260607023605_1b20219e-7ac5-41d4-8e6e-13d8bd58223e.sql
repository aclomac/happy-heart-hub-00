-- Add explicit RESTRICTIVE policy on platform_settings to make non-admin read blocking unambiguous
CREATE POLICY "ps_restrict_non_admin_select"
ON public.platform_settings
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (public.is_platform_admin(auth.uid()));