CREATE OR REPLACE FUNCTION public.has_role_permission(_user uuid, _company uuid, _key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_perm jsonb;
BEGIN
  IF _user IS NULL OR _company IS NULL THEN
    RETURN false;
  END IF;

  -- Owner of THIS specific company
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND owner_id = _user) THEN
    RETURN true;
  END IF;

  -- Must be a member of THIS specific company. No global-admin bypass.
  SELECT role INTO v_role FROM public.company_members
   WHERE company_id = _company AND user_id = _user
   LIMIT 1;
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role IN ('owner','admin') THEN
    RETURN true;
  END IF;

  SELECT permissions INTO v_perm FROM public.role_permissions
   WHERE company_id = _company AND role = v_role::text
   LIMIT 1;
  IF v_perm IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE((v_perm ->> _key)::boolean, false);
END;
$$;

UPDATE public.subscriptions
   SET max_companies = 999999
 WHERE plan = 'pro' AND max_companies < 999999;

UPDATE public.subscription_plans
   SET max_companies = 999999
 WHERE key = 'pro' AND max_companies < 999999;