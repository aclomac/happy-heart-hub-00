ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS sale_invoice_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by uuid;

ALTER TABLE public.online_orders DROP CONSTRAINT IF EXISTS online_orders_status_check;
ALTER TABLE public.online_orders ADD CONSTRAINT online_orders_status_check
  CHECK (status IN ('new','confirmed','shipped','delivered','cancelled','converted'));

CREATE UNIQUE INDEX IF NOT EXISTS online_orders_unique_invoice
  ON public.online_orders(sale_invoice_id) WHERE sale_invoice_id IS NOT NULL;