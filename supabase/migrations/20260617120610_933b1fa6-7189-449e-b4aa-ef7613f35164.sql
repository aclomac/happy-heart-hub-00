-- Drop the over-strict full unique constraint on (company_id, invoice_no).
-- It prevented legitimate reuse of the same invoice_no across different
-- doc_types (e.g. an invoice and an estimate with the same number) and
-- across soft-deleted rows.
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_company_id_invoice_no_key;

-- Ensure the active-row unique index on (company_id, doc_type, invoice_no)
-- exists. This is the canonical DB-level guard the replay/upload path
-- relies on for cleanly-failing duplicate inserts.
CREATE UNIQUE INDEX IF NOT EXISTS sales_company_doc_invoice_no_active_uidx
  ON public.sales (company_id, doc_type, invoice_no)
  WHERE deleted_at IS NULL;