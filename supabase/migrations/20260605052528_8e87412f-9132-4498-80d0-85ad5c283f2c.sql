ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS sale_order_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS online_orders_unique_sale_order
  ON public.online_orders(sale_order_id) WHERE sale_order_id IS NOT NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE INDEX IF NOT EXISTS idx_sales_source ON public.sales(source_type, source_id)
  WHERE source_type IS NOT NULL;

ALTER TABLE public.online_orders
  DROP CONSTRAINT IF EXISTS online_orders_status_check;
ALTER TABLE public.online_orders
  ADD CONSTRAINT online_orders_status_check
  CHECK (status = ANY (ARRAY[
    'new'::text, 'confirmed'::text, 'shipped'::text, 'delivered'::text,
    'cancelled'::text, 'converted'::text,
    'sale_order_created'::text, 'sale_order_failed'::text
  ]));