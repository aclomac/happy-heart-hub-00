-- Explicitly deny direct client INSERT/UPDATE/DELETE on audit_logs.
-- Writes must go through the log_audit_event() SECURITY DEFINER RPC.
CREATE POLICY "al_no_direct_insert" ON public.audit_logs
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);
CREATE POLICY "al_no_direct_update" ON public.audit_logs
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);
CREATE POLICY "al_no_direct_delete" ON public.audit_logs
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- Explicitly deny direct client INSERT/UPDATE/DELETE on coupon_redemptions.
-- Platform admins retain full access via the existing cr_platform_admin_all policy
-- (RESTRICTIVE policies do not apply to roles outside the TO list).
CREATE POLICY "cr_no_direct_insert" ON public.coupon_redemptions
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);
CREATE POLICY "cr_no_direct_update" ON public.coupon_redemptions
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);
CREATE POLICY "cr_no_direct_delete" ON public.coupon_redemptions
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);