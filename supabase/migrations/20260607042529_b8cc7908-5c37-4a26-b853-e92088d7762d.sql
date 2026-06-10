-- Update online_orders status constraint
ALTER TABLE public.online_orders DROP CONSTRAINT IF EXISTS online_orders_status_check;
ALTER TABLE public.online_orders ADD CONSTRAINT online_orders_status_check
CHECK (status = ANY (ARRAY[
  'pending'::text, 'confirmed'::text, 'packed'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'returned'::text,
  'converted'::text, 'sale_order_created'::text, 'sale_order_failed'::text
]));

-- Create status logs table
CREATE TABLE public.online_order_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Permissions
GRANT SELECT, INSERT ON public.online_order_status_logs TO authenticated;
GRANT ALL ON public.online_order_status_logs TO service_role;

-- RLS
ALTER TABLE public.online_order_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs for their company" ON public.online_order_status_logs
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert logs for their company" ON public.online_order_status_logs
    FOR INSERT TO authenticated
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- Create index for performance
CREATE INDEX idx_online_order_status_logs_order_id ON public.online_order_status_logs(order_id);
CREATE INDEX idx_online_order_status_logs_company_id ON public.online_order_status_logs(company_id);