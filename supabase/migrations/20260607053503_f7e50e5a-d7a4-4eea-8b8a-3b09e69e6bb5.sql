-- Fix marketing_campaigns RLS
DROP POLICY IF EXISTS "Users can manage their own company marketing campaigns" ON public.marketing_campaigns;

CREATE POLICY "mc_select" ON public.marketing_campaigns FOR SELECT
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "mc_write" ON public.marketing_campaigns FOR ALL
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
  );

-- Fix marketing_costs RLS
DROP POLICY IF EXISTS "Users can manage their own company marketing costs" ON public.marketing_costs;

CREATE POLICY "mcost_select" ON public.marketing_costs FOR SELECT
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "mcost_write" ON public.marketing_costs FOR ALL
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
  );

-- Fix item_variants: add write permission check
DROP POLICY IF EXISTS "Users can manage item_variants for their company" ON public.item_variants;
DROP POLICY IF EXISTS "Company members can manage item variants" ON public.item_variants;

CREATE POLICY "iv_select" ON public.item_variants FOR SELECT
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "iv_write" ON public.item_variants FOR ALL
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'items.write')
  );

-- Fix mutable search_path on audit trigger functions
CREATE OR REPLACE FUNCTION public.log_marketing_campaign_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, event_type, table_name, record_id, old_data, new_data)
  VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'marketing_campaign.created'
      WHEN TG_OP = 'UPDATE' THEN 'marketing_campaign.updated'
      ELSE 'marketing_campaign.deleted'
    END,
    'marketing_campaigns',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_marketing_cost_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, event_type, table_name, record_id, old_data, new_data)
  VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'marketing_cost.created'
      WHEN TG_OP = 'UPDATE' THEN 'marketing_cost.updated'
      ELSE 'marketing_cost.deleted'
    END,
    'marketing_costs',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NEW;
END;
$function$;
