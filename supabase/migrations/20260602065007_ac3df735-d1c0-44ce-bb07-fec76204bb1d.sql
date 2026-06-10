
-- ============ cash_transactions ============
ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cash_transactions_status_check') THEN
    ALTER TABLE public.cash_transactions
      ADD CONSTRAINT cash_transactions_status_check CHECK (status IN ('posted','reversed'));
  END IF;
END $$;

UPDATE public.cash_transactions SET posted_at = created_at WHERE posted_at IS NULL OR posted_at = now();

-- Partial unique index: dedupe only when caller supplied a real parent reference.
-- 'manual' and NULL references represent free-form cash entries and stay unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS cash_txn_ref_unique
  ON public.cash_transactions (company_id, reference_type, reference_id)
  WHERE reference_id IS NOT NULL
    AND reference_type IS NOT NULL
    AND reference_type <> 'manual'
    AND status = 'posted';

CREATE INDEX IF NOT EXISTS cash_txn_status_idx ON public.cash_transactions (company_id, status);

-- ============ cash_reconciliations ============
ALTER TABLE public.cash_reconciliations
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cash_recon_status_check') THEN
    ALTER TABLE public.cash_reconciliations
      ADD CONSTRAINT cash_recon_status_check CHECK (status IN ('draft','posted','reversed','cancelled'));
  END IF;
END $$;

UPDATE public.cash_reconciliations
   SET posted_at = COALESCE(posted_at, created_at),
       posted_by = COALESCE(posted_by, created_by),
       status = CASE WHEN is_cancelled THEN 'cancelled' ELSE 'posted' END,
       reversed_at = CASE WHEN is_cancelled THEN cancelled_at ELSE reversed_at END,
       reversed_by = CASE WHEN is_cancelled THEN cancelled_by ELSE reversed_by END;

-- ============ bank_transfers ============
ALTER TABLE public.bank_transfers
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bank_transfers_status_check') THEN
    ALTER TABLE public.bank_transfers
      ADD CONSTRAINT bank_transfers_status_check CHECK (status IN ('posted','reversed'));
  END IF;
END $$;

-- ============ cheques ============
ALTER TABLE public.cheques
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS posted_txn_id uuid;

-- ============ loan_payments ============
ALTER TABLE public.loan_payments
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS posted_txn_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='loan_payments_status_check') THEN
    ALTER TABLE public.loan_payments
      ADD CONSTRAINT loan_payments_status_check CHECK (status IN ('posted','reversed'));
  END IF;
END $$;

-- ============ employee_payments ============
ALTER TABLE public.employee_payments
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS posted_txn_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_payments_status_check') THEN
    ALTER TABLE public.employee_payments
      ADD CONSTRAINT employee_payments_status_check CHECK (status IN ('posted','reversed'));
  END IF;
END $$;

-- ============ payments ============
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS posted_txn_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_status_check') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_status_check CHECK (status IN ('posted','reversed'));
  END IF;
END $$;

-- ============ expenses ============
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS posted_txn_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='expenses_status_check') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_status_check CHECK (status IN ('posted','reversed'));
  END IF;
END $$;

-- ============ salary_slips ============
ALTER TABLE public.salary_slips
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS posted_txn_id uuid;
