-- 1. Create return_exchange table
CREATE TABLE IF NOT EXISTS public.return_exchange (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL, -- Original sale invoice if exists
    order_id UUID REFERENCES public.online_orders(id) ON DELETE SET NULL, -- Original online order if exists
    customer_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    type TEXT NOT NULL CHECK (type IN ('return', 'exchange')),
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    qty NUMERIC NOT NULL DEFAULT 1,
    reason TEXT NOT NULL,
    restock_option TEXT NOT NULL CHECK (restock_option IN ('restock', 'damaged', 'none')),
    refund_amount NUMERIC NOT NULL DEFAULT 0,
    refund_status TEXT NOT NULL DEFAULT 'pending' CHECK (refund_status IN ('pending', 'paid', 'cancelled', 'n/a')),
    refund_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    delivery_charge NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    transaction_id UUID, -- Link to cash_transactions for refund
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Create replacement_items table (for exchanges)
CREATE TABLE IF NOT EXISTS public.replacement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    return_id UUID NOT NULL REFERENCES public.return_exchange(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    qty NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Add damaged_stock to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS damaged_stock NUMERIC NOT NULL DEFAULT 0;

-- 4. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_exchange TO authenticated;
GRANT ALL ON public.return_exchange TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replacement_items TO authenticated;
GRANT ALL ON public.replacement_items TO service_role;

-- 5. RLS
ALTER TABLE public.return_exchange ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view return_exchange for their company" ON public.return_exchange
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage return_exchange for their company" ON public.return_exchange
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can view replacement_items for their company" ON public.replacement_items
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage replacement_items for their company" ON public.replacement_items
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 6. Triggers
CREATE TRIGGER trg_return_exchange_updated BEFORE UPDATE ON public.return_exchange
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Indices
CREATE INDEX IF NOT EXISTS idx_return_exchange_company_id ON public.return_exchange(company_id);
CREATE INDEX IF NOT EXISTS idx_return_exchange_sale_id ON public.return_exchange(sale_id);
CREATE INDEX IF NOT EXISTS idx_return_exchange_order_id ON public.return_exchange(order_id);
CREATE INDEX IF NOT EXISTS idx_replacement_items_return_id ON public.replacement_items(return_id);