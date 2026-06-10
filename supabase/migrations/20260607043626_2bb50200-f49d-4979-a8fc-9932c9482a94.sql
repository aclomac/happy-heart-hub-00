-- 1. Create couriers table
CREATE TABLE IF NOT EXISTS public.couriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    website_url TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Add columns to online_orders
ALTER TABLE public.online_orders 
ADD COLUMN IF NOT EXISTS courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tracking_id TEXT,
ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS cod_amount NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'not_assigned',
ADD COLUMN IF NOT EXISTS delivery_note TEXT,
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- 3. Add delivery_status constraint
ALTER TABLE public.online_orders DROP CONSTRAINT IF EXISTS online_orders_delivery_status_check;
ALTER TABLE public.online_orders ADD CONSTRAINT online_orders_delivery_status_check 
CHECK (delivery_status = ANY (ARRAY['not_assigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned']));

-- 4. Permissions for couriers
GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;

-- 5. RLS for couriers
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view couriers for their company" ON public.couriers
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage couriers for their company" ON public.couriers
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 6. Trigger for updated_at on couriers
CREATE TRIGGER trg_couriers_updated BEFORE UPDATE ON public.couriers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Indices
CREATE INDEX IF NOT EXISTS idx_couriers_company_id ON public.couriers(company_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_courier_id ON public.online_orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_delivery_status ON public.online_orders(delivery_status);

-- 8. Helper function to seed default couriers for a company
CREATE OR REPLACE FUNCTION public.seed_default_couriers(target_company_id UUID)
RETURNS void AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
