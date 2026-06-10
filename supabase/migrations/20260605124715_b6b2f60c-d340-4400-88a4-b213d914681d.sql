-- Remove the definer view; replace with column-level grants on base table
DROP VIEW IF EXISTS public.platform_settings_public;

-- Restore a public SELECT policy on the base table (RLS row-level only; columns are gated by GRANTs below)
DROP POLICY IF EXISTS ps_public_read_safe ON public.platform_settings;
CREATE POLICY ps_public_read_safe ON public.platform_settings
FOR SELECT
USING (true);

-- Revoke all table-level SELECT from public roles, then grant only safe columns
REVOKE SELECT ON public.platform_settings FROM anon, authenticated;

GRANT SELECT (
  id,
  platform_name,
  platform_logo_url,
  support_email,
  support_phone,
  support_whatsapp,
  terms_url,
  privacy_url,
  default_currency,
  maintenance_mode,
  maintenance_message,
  signup_enabled,
  demo_login_enabled
) ON public.platform_settings TO anon, authenticated;

-- Platform admins (and service role) retain full access via existing ALL policy / service_role grants
GRANT ALL ON public.platform_settings TO service_role;