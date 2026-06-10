
-- Soft delete columns across modules + recycle bin extensions

DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
  'sales','purchases','payments','expenses','parties','party_groups',
  'items','item_categories','expense_categories',
  'bank_accounts','cash_transactions','cheques','loans','loan_payments',
  'employee_payments','salary_slips','cash_reconciliations','bank_transfers'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS delete_reason text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS restored_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS restored_by uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS permanently_deleted_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS permanently_deleted_by uuid', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id) WHERE deleted_at IS NULL',
      t || '_active_idx', t);
  END LOOP;
END$$;

-- Recycle bin denormalized columns for fast listing & filtering
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS module text;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS reference_no text;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS party_name text;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS restored_at timestamptz;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS restored_by uuid;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS permanently_deleted_at timestamptz;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS permanently_deleted_by uuid;
ALTER TABLE public.recycle_bin ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'deleted';

CREATE INDEX IF NOT EXISTS recycle_bin_company_status_idx
  ON public.recycle_bin (company_id, status, deleted_at DESC);
CREATE INDEX IF NOT EXISTS recycle_bin_entity_idx
  ON public.recycle_bin (entity_type, entity_id);
