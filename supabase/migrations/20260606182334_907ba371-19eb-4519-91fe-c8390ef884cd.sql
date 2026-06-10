
-- Require items.write permission to create/update/delete manufacturing recipes
DROP POLICY IF EXISTS "Company members can manage recipes" ON public.item_manufacturing_recipes;

CREATE POLICY "Recipes read by company members"
  ON public.item_manufacturing_recipes
  FOR SELECT
  TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Recipes write requires items.write"
  ON public.item_manufacturing_recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  );

CREATE POLICY "Recipes update requires items.write"
  ON public.item_manufacturing_recipes
  FOR UPDATE
  TO authenticated
  USING (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  )
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  );

CREATE POLICY "Recipes delete requires items.write"
  ON public.item_manufacturing_recipes
  FOR DELETE
  TO authenticated
  USING (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  );

-- Same for recipe lines
DROP POLICY IF EXISTS "Company members can manage recipe lines" ON public.item_manufacturing_recipe_lines;

CREATE POLICY "Recipe lines read by company members"
  ON public.item_manufacturing_recipe_lines
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
  ));

CREATE POLICY "Recipe lines insert requires items.write"
  ON public.item_manufacturing_recipe_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
      AND has_role_permission(auth.uid(), r.company_id, 'items.write')
  ));

CREATE POLICY "Recipe lines update requires items.write"
  ON public.item_manufacturing_recipe_lines
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
      AND has_role_permission(auth.uid(), r.company_id, 'items.write')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
      AND has_role_permission(auth.uid(), r.company_id, 'items.write')
  ));

CREATE POLICY "Recipe lines delete requires items.write"
  ON public.item_manufacturing_recipe_lines
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
      AND has_role_permission(auth.uid(), r.company_id, 'items.write')
  ));
