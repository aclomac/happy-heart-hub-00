ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS po_no text,
  ADD COLUMN IF NOT EXISTS po_date date,
  ADD COLUMN IF NOT EXISTS billing_name text;