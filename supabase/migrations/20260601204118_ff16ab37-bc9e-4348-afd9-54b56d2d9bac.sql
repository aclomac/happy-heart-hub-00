ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS reference_sale_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_doc_type_chk'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_doc_type_chk
      CHECK (doc_type IN ('invoice','estimate','sale_order','delivery_challan','credit_note'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_company_doctype
  ON public.sales(company_id, doc_type, invoice_date DESC);