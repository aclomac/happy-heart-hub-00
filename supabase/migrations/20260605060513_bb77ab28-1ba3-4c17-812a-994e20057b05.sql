-- 1. Public-safe view of platform settings (no ip_allowlist, no internal config)
CREATE OR REPLACE VIEW public.platform_public_settings
WITH (security_invoker = true)
AS
SELECT
  id,
  platform_name,
  support_email,
  support_phone,
  support_whatsapp,
  signup_enabled,
  demo_login_enabled,
  maintenance_mode,
  maintenance_message
FROM public.platform_settings;

GRANT SELECT ON public.platform_public_settings TO anon, authenticated;

-- 2. Drop the over-permissive public read policy that exposed ip_allowlist
DROP POLICY IF EXISTS ps_public_read ON public.platform_settings;

-- 3. Keep a narrow read policy for the view's security_invoker check: allow
--    anon/authenticated to SELECT the same safe columns via the view.
--    security_invoker means the view runs with the caller's permissions, so
--    we still need a base-table policy. Restrict it to the safe column set
--    by re-adding a SELECT policy but only used through the view; clients
--    that try to SELECT ip_allowlist or other fields directly will get
--    blocked by application code path (everyone now reads the view).
CREATE POLICY ps_public_read_safe
  ON public.platform_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Note: We can't restrict by column in an RLS policy. The protection comes
-- from clients reading the view (which projects only safe columns) and
-- super-admin operations going through SECURITY DEFINER functions for
-- ip_allowlist (see platform-security.functions.ts).
-- To fully revoke direct column access from anon, revoke column-level
-- privileges on the sensitive columns:
REVOKE SELECT ON public.platform_settings FROM anon;
REVOKE SELECT ON public.platform_settings FROM authenticated;
GRANT SELECT (
  id,
  platform_name,
  support_email,
  support_phone,
  support_whatsapp,
  signup_enabled,
  demo_login_enabled,
  maintenance_mode,
  maintenance_message
) ON public.platform_settings TO anon, authenticated;