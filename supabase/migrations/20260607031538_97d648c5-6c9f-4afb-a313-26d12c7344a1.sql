
DROP POLICY IF EXISTS "oo_public_insert" ON public.online_orders;

CREATE POLICY "oo_public_insert" ON public.online_orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.online_store_settings s
       WHERE s.company_id = online_orders.company_id AND s.is_active = true
    )
    AND status = 'new'
    AND sale_invoice_id IS NULL
    AND sale_order_id IS NULL
    AND converted_at IS NULL
    AND converted_by IS NULL
    AND char_length(customer_name) BETWEEN 1 AND 120
    AND char_length(customer_phone) BETWEEN 3 AND 32
    AND (customer_address IS NULL OR char_length(customer_address) <= 500)
    AND (notes IS NULL OR char_length(notes) <= 1000)
    AND char_length(order_no) BETWEEN 1 AND 64
    AND jsonb_typeof(items) = 'array'
    AND jsonb_array_length(items) BETWEEN 1 AND 200
    AND subtotal >= 0 AND subtotal <= 100000000
    AND delivery_charge >= 0 AND delivery_charge <= 1000000
    AND total >= 0 AND total <= 100000000
  );
