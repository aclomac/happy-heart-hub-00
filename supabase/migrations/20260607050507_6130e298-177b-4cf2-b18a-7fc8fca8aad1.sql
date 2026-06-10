-- 1. Create item_variants table
CREATE TABLE IF NOT EXISTS public.item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    color TEXT,
    size TEXT,
    model TEXT,
    sale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    wholesale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    mrp NUMERIC(14,2) NOT NULL DEFAULT 0,
    stock NUMERIC(14,3) NOT NULL DEFAULT 0,
    low_stock_alert NUMERIC(14,3),
    unit TEXT NOT NULL DEFAULT 'PCS',
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(company_id, sku)
);

-- 2. Add variant_id columns to existing tables
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;
ALTER TABLE public.return_exchange ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;
ALTER TABLE public.replacement_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;

-- 3. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_variants TO authenticated;
GRANT ALL ON public.item_variants TO service_role;

-- 4. RLS
ALTER TABLE public.item_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_variants_member_all" ON public.item_variants
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 5. Trigger for updated_at
CREATE TRIGGER t_item_variants_updated BEFORE UPDATE ON public.item_variants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Indices
CREATE INDEX IF NOT EXISTS idx_item_variants_item ON public.item_variants(item_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_company ON public.item_variants(company_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_sku ON public.item_variants(sku);