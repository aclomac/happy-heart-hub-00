-- 1. Create cod_settlements table
CREATE TABLE IF NOT EXISTS public.cod_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
    courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
    cod_amount NUMERIC NOT NULL DEFAULT 0,
    courier_charge NUMERIC NOT NULL DEFAULT 0,
    receivable_amount NUMERIC NOT NULL DEFAULT 0, -- cod_amount - courier_charge
    received_amount NUMERIC NOT NULL DEFAULT 0,
    pending_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, partial, settled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(order_id)
);

-- 2. Create cod_receipts table
CREATE TABLE IF NOT EXISTS public.cod_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settlement_id UUID NOT NULL REFERENCES public.cod_settlements(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    received_at DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_no TEXT,
    notes TEXT,
    transaction_id UUID, -- Link to cash_transactions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Add courier_charge to online_orders if not exists
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS courier_charge NUMERIC NOT NULL DEFAULT 0;

-- 4. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cod_settlements TO authenticated;
GRANT ALL ON public.cod_settlements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cod_receipts TO authenticated;
GRANT ALL ON public.cod_receipts TO service_role;

-- 5. RLS
ALTER TABLE public.cod_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cod_settlements for their company" ON public.cod_settlements
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage cod_settlements for their company" ON public.cod_settlements
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can view cod_receipts for their company" ON public.cod_receipts
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage cod_receipts for their company" ON public.cod_receipts
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 6. Triggers
CREATE TRIGGER trg_cod_settlements_updated BEFORE UPDATE ON public.cod_settlements
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cod_receipts_updated BEFORE UPDATE ON public.cod_receipts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Indices
CREATE INDEX IF NOT EXISTS idx_cod_settlements_company_id ON public.cod_settlements(company_id);
CREATE INDEX IF NOT EXISTS idx_cod_settlements_courier_id ON public.cod_settlements(courier_id);
CREATE INDEX IF NOT EXISTS idx_cod_settlements_status ON public.cod_settlements(status);
CREATE INDEX IF NOT EXISTS idx_cod_receipts_company_id ON public.cod_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_cod_receipts_settlement_id ON public.cod_receipts(settlement_id);