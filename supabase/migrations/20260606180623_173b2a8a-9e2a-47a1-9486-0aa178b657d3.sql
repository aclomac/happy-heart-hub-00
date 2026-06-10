DROP POLICY IF EXISTS "Company members can manage recipes" ON public.item_manufacturing_recipes;
CREATE POLICY "Company members can manage recipes" ON public.item_manufacturing_recipes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_company_access(auth.uid(), company_id))
  WITH CHECK (has_company_access(auth.uid(), company_id));

DROP POLICY IF EXISTS "Company members can manage recipe lines" ON public.item_manufacturing_recipe_lines;
CREATE POLICY "Company members can manage recipe lines" ON public.item_manufacturing_recipe_lines
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.item_manufacturing_recipes r WHERE r.id = item_manufacturing_recipe_lines.recipe_id AND has_company_access(auth.uid(), r.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.item_manufacturing_recipes r WHERE r.id = item_manufacturing_recipe_lines.recipe_id AND has_company_access(auth.uid(), r.company_id)));