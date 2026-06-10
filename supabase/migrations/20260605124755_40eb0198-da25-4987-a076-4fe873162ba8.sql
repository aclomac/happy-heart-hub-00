CREATE OR REPLACE FUNCTION public.get_platform_settings_admin()
RETURNS SETOF public.platform_settings
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.platform_settings LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_settings_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_settings_admin() TO authenticated, service_role;