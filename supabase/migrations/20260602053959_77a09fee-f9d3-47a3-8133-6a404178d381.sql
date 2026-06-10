
-- Extend expense_categories
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Extend expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS expense_no text,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid,
  ADD COLUMN IF NOT EXISTS tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS store text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_expenses_company_date ON public.expenses(company_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON public.expenses(category_id);

-- Storage bucket for expense attachments (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-attachments', 'expense-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: company-scoped via folder = company_id
DROP POLICY IF EXISTS "expense_attach_read" ON storage.objects;
CREATE POLICY "expense_attach_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "expense_attach_insert" ON storage.objects;
CREATE POLICY "expense_attach_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'expense-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "expense_attach_update" ON storage.objects;
CREATE POLICY "expense_attach_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'expense-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "expense_attach_delete" ON storage.objects;
CREATE POLICY "expense_attach_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'expense-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
