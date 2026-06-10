
-- 1. Extend subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yearly_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_sp_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_sp_updated_at BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. platform_admins
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'super_admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Helper (security definer; safe — only reads platform_admins by user_id)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user)
$$;

CREATE POLICY pa_select_self_or_admin ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY pa_admin_write ON public.platform_admins
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 3. platform_audit_logs
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY pal_admin_select ON public.platform_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Writes happen via SECURITY DEFINER function only.
CREATE OR REPLACE FUNCTION public.log_platform_audit(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.platform_audit_logs (actor_user_id, action, target_type, target_id, metadata)
  VALUES (v_uid, _action, _target_type, _target_id, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 4. company_subscriptions
CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  plan_id uuid,
  plan_key text,
  status text NOT NULL DEFAULT 'trial',
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_company ON public.company_subscriptions(company_id);

GRANT SELECT ON public.company_subscriptions TO authenticated;
GRANT ALL ON public.company_subscriptions TO service_role;

ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cs_select ON public.company_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_company_access(auth.uid(), company_id)
  );

CREATE POLICY cs_admin_write ON public.company_subscriptions
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_cs_updated_at ON public.company_subscriptions;
CREATE TRIGGER trg_cs_updated_at BEFORE UPDATE ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Allow platform admins to read profiles + companies + subscriptions broadly
CREATE POLICY profiles_platform_admin_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY companies_platform_admin_select ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY subscriptions_platform_admin_select ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 6. Allow platform admins to write subscription_plans (existing policy already
-- allows global 'admin'; add platform_admin path).
DROP POLICY IF EXISTS sp_platform_admin_write ON public.subscription_plans;
CREATE POLICY sp_platform_admin_write ON public.subscription_plans
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
