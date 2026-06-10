
DROP POLICY IF EXISTS "item_variants_member_all" ON public.item_variants;

DROP POLICY IF EXISTS "Users can insert logs for their company" ON public.online_order_status_logs;
CREATE POLICY "Users can insert logs for their company"
  ON public.online_order_status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'sales.write')
  );

CREATE OR REPLACE FUNCTION public.seed_default_couriers(target_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.couriers (company_id, name)
    VALUES 
        (target_company_id, 'Pathao'),
        (target_company_id, 'Steadfast'),
        (target_company_id, 'RedX'),
        (target_company_id, 'Paperfly'),
        (target_company_id, 'Sundarban')
    ON CONFLICT DO NOTHING;
END;
$function$;
