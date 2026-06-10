
-- Make subscription_plans the source of truth for max_companies / max_devices.
CREATE OR REPLACE FUNCTION public.user_max_companies(_user uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.max_companies
       FROM public.subscriptions s
       JOIN public.subscription_plans p ON p.key = s.plan
      WHERE s.owner_id = _user
      ORDER BY p.max_companies DESC
      LIMIT 1),
    (SELECT MAX(max_companies) FROM public.subscriptions WHERE owner_id = _user),
    1
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_max_devices(_user uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.max_devices
       FROM public.subscriptions s
       JOIN public.subscription_plans p ON p.key = s.plan
      WHERE s.owner_id = _user
      ORDER BY p.max_devices DESC
      LIMIT 1),
    (SELECT MAX(max_devices) FROM public.subscriptions WHERE owner_id = _user),
    1
  );
$function$;

-- Backfill stale subscription rows so their cached max_* mirror the plan.
UPDATE public.subscriptions s
   SET max_companies = p.max_companies,
       max_devices   = p.max_devices
  FROM public.subscription_plans p
 WHERE p.key = s.plan
   AND (s.max_companies <> p.max_companies OR s.max_devices <> p.max_devices);
