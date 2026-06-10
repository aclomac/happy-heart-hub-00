-- Phase 3: Feature overrides, coupons, redemptions + helper functions

-- =============== company_feature_overrides ===============
CREATE TABLE public.company_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  is_beta boolean NOT NULL DEFAULT false,
  internal_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, feature_key)
);

GRANT SELECT ON public.company_feature_overrides TO authenticated;
GRANT ALL ON public.company_feature_overrides TO service_role;

ALTER TABLE public.company_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY cfo_platform_admin_all ON public.company_feature_overrides
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY cfo_company_select_own ON public.company_feature_overrides
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE TRIGGER cfo_updated_at
  BEFORE UPDATE ON public.company_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== platform_coupons ===============
CREATE TABLE public.platform_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('flat','percentage')),
  discount_value numeric NOT NULL CHECK (discount_value >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  plan_key text,
  billing_period text NOT NULL DEFAULT 'all' CHECK (billing_period IN ('monthly','yearly','all')),
  company_id uuid,
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  internal_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.platform_coupons TO authenticated;
GRANT ALL ON public.platform_coupons TO service_role;

ALTER TABLE public.platform_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY pc_platform_admin_all ON public.platform_coupons
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE TRIGGER pc_updated_at
  BEFORE UPDATE ON public.platform_coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== coupon_redemptions ===============
CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.platform_coupons(id) ON DELETE CASCADE,
  payment_request_id uuid NOT NULL,
  company_id uuid,
  user_id uuid NOT NULL,
  discount_applied numeric NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, payment_request_id)
);

GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_platform_admin_all ON public.coupon_redemptions
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY cr_own_select ON public.coupon_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============== Add coupon_id to payment_requests ===============
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.platform_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

-- =============== Helper: feature with override precedence ===============
CREATE OR REPLACE FUNCTION public.company_feature_resolved(_company uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override record;
BEGIN
  SELECT enabled, expires_at INTO v_override
    FROM public.company_feature_overrides
   WHERE company_id = _company AND feature_key = _feature
   LIMIT 1;

  IF FOUND THEN
    IF v_override.expires_at IS NULL OR v_override.expires_at > now() THEN
      RETURN v_override.enabled;
    END IF;
  END IF;

  -- Fall back to plan
  RETURN public.company_has_feature(_company, _feature);
END;
$$;

-- =============== Helper: validate coupon ===============
CREATE OR REPLACE FUNCTION public.validate_coupon(
  _code text,
  _plan_key text,
  _billing_period text,
  _company_id uuid,
  _user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.platform_coupons
   WHERE upper(code) = upper(_code) LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not found');
  END IF;
  IF NOT c.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is inactive');
  END IF;
  IF c.valid_from > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not yet active');
  END IF;
  IF c.valid_until IS NOT NULL AND c.valid_until < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon expired');
  END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon usage limit reached');
  END IF;
  IF c.plan_key IS NOT NULL AND c.plan_key <> _plan_key THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this plan');
  END IF;
  IF c.billing_period <> 'all' AND c.billing_period <> _billing_period THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this billing period');
  END IF;
  IF c.company_id IS NOT NULL AND c.company_id <> _company_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this company');
  END IF;
  IF c.user_id IS NOT NULL AND c.user_id <> _user_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this user');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', c.id,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value
  );
END;
$$;

-- =============== Helper: mark stale devices ===============
CREATE OR REPLACE FUNCTION public.platform_mark_stale_devices(_days int DEFAULT 30)
RETURNS integer
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
  DELETE FROM public.devices
   WHERE last_seen_at < now() - make_interval(days => _days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_platform_audit('devices.mark_stale','devices', NULL,
    jsonb_build_object('days', _days, 'removed', v_count));
  RETURN v_count;
END;
$$;