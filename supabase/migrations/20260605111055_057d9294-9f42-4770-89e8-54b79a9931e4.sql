-- Race-safe duplicate guard: prevent two concurrent invoice saves from getting
-- the same invoice_no within (company_id, doc_type) for active (non-deleted)
-- rows. Partial index so soft-deleted rows are excluded (matches app behavior).
CREATE UNIQUE INDEX IF NOT EXISTS sales_company_doc_invoice_no_active_uidx
  ON public.sales (company_id, doc_type, invoice_no)
  WHERE deleted_at IS NULL;