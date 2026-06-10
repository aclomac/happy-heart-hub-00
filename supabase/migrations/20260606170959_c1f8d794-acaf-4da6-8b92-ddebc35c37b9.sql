
-- Public storefront needs anon read for item-images bucket (mirrors company_logos policy)
CREATE POLICY "item_images_public_select_anon"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'item-images');

-- Public SECURITY DEFINER function exposing only non-sensitive platform settings.
CREATE OR REPLACE FUNCTION public.get_public_platform_settings()
RETURNS TABLE (
  platform_name text,
  maintenance_mode boolean,
  maintenance_message text,
  signup_enabled boolean,
  demo_login_enabled boolean,
  support_email text,
  support_phone text,
  support_whatsapp text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    platform_name,
    maintenance_mode,
    maintenance_message,
    signup_enabled,
    demo_login_enabled,
    support_email,
    support_phone,
    support_whatsapp
  FROM public.platform_settings
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_platform_settings() TO anon, authenticated;
