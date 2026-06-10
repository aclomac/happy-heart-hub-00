-- Replace the over-permissive read policy on platform_announcements so that
-- audience targeting is actually enforced at the RLS layer. Untargeted
-- announcements stay public to authenticated users; targeted ones are scoped
-- to users with company access or matching plan.

DROP POLICY IF EXISTS pa_user_select_active ON public.platform_announcements;

CREATE POLICY pa_user_select_active
  ON public.platform_announcements
  FOR SELECT
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      is_active = true
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at >= now())
      AND (
        target_company_id IS NULL
        OR public.has_company_access(auth.uid(), target_company_id)
      )
      AND (
        target_plan IS NULL
        OR EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.owner_id = auth.uid()
            AND s.plan = platform_announcements.target_plan
            AND s.status IN ('trial', 'active')
            AND s.expires_at > now()
        )
      )
    )
  );