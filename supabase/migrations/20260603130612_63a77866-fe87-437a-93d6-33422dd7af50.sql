
CREATE OR REPLACE FUNCTION public.add_platform_admin_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_target FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', _email USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.platform_admins (user_id, role)
  VALUES (v_target, 'super_admin')
  ON CONFLICT (user_id) DO NOTHING;
  PERFORM public.log_platform_audit('platform_admin.add', 'platform_admin', v_target,
    jsonb_build_object('email', _email));
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_platform_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.platform_admins;
  IF v_count <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last platform admin' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.platform_admins WHERE user_id = _user_id;
  PERFORM public.log_platform_audit('platform_admin.remove', 'platform_admin', _user_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_platform_admin_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_platform_admin(uuid) TO authenticated;
