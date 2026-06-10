-- 1. Purchases sub-doc type
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'bill',
  ADD COLUMN IF NOT EXISTS reference_purchase_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_doc_type_check'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_doc_type_check
      CHECK (doc_type IN ('bill','purchase_order','debit_note'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchases_company_doctype_date_idx
  ON public.purchases (company_id, doc_type, bill_date DESC);

-- 2. Expenses extra fields
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence text;

-- 3. Expense categories
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_cat_select ON public.expense_categories;
CREATE POLICY expense_cat_select ON public.expense_categories
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

DROP POLICY IF EXISTS expense_cat_write ON public.expense_categories;
CREATE POLICY expense_cat_write ON public.expense_categories
  FOR ALL TO authenticated
  USING (
    has_company_access(auth.uid(), company_id)
    AND company_has_active_subscription(company_id)
  )
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND company_has_active_subscription(company_id)
    AND has_role_permission(auth.uid(), company_id, 'expenses.write')
  );

DROP TRIGGER IF EXISTS expense_categories_set_updated_at ON public.expense_categories;
CREATE TRIGGER expense_categories_set_updated_at
  BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();