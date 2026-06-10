-- Ensure unique SKU per company for active items
CREATE UNIQUE INDEX IF NOT EXISTS items_company_sku_active_idx ON public.items (company_id, sku) WHERE (deleted_at IS NULL AND sku IS NOT NULL);

-- Create manufacturing recipe tables
CREATE TABLE IF NOT EXISTS public.item_manufacturing_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES auth.users,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    additional_cost NUMERIC(20, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(item_id)
);

CREATE TABLE IF NOT EXISTS public.item_manufacturing_recipe_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.item_manufacturing_recipes(id) ON DELETE CASCADE,
    material_item_id UUID NOT NULL REFERENCES public.items(id),
    qty NUMERIC(20, 4) NOT NULL DEFAULT 1,
    unit TEXT,
    purchase_price_at_time NUMERIC(20, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS
ALTER TABLE public.item_manufacturing_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_manufacturing_recipe_lines ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_manufacturing_recipes TO authenticated;
GRANT ALL ON public.item_manufacturing_recipes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_manufacturing_recipe_lines TO authenticated;
GRANT ALL ON public.item_manufacturing_recipe_lines TO service_role;

-- Policies
CREATE POLICY "Users can manage their own recipes" ON public.item_manufacturing_recipes
    FOR ALL USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

CREATE POLICY "Users can manage their own recipe lines" ON public.item_manufacturing_recipe_lines
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.item_manufacturing_recipes r
        WHERE r.id = recipe_id AND r.company_id = auth.uid()
    )) WITH CHECK (EXISTS (
        SELECT 1 FROM public.item_manufacturing_recipes r
        WHERE r.id = recipe_id AND r.company_id = auth.uid()
    ));

-- Update trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_item_manufacturing_recipes_updated_at
    BEFORE UPDATE ON public.item_manufacturing_recipes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
