
-- Fix 1: Broken RLS on manufacturing recipe tables (wrong uid vs company_id comparison)
DROP POLICY IF EXISTS "Users can manage their own recipes" ON public.item_manufacturing_recipes;
DROP POLICY IF EXISTS "Users can manage their own recipe lines" ON public.item_manufacturing_recipe_lines;

CREATE POLICY "Company members can manage recipes"
  ON public.item_manufacturing_recipes
  FOR ALL
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Company members can manage recipe lines"
  ON public.item_manufacturing_recipe_lines
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND public.has_company_access(auth.uid(), r.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND public.has_company_access(auth.uid(), r.company_id)
  ));

-- Fix 2: Restrict recycle_bin SELECT to owners/admins (snapshots may contain sensitive payroll/financial data)
DROP POLICY IF EXISTS "rb_select" ON public.recycle_bin;
CREATE POLICY "rb_select"
  ON public.recycle_bin
  FOR SELECT
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner'::public.app_role)
    OR public.has_company_role(auth.uid(), company_id, 'admin'::public.app_role)
  );

-- Fix 3: Set immutable search_path on update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;
