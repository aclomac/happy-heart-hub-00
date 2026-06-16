DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='stock_movements' AND column_name='notes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='stock_movements' AND column_name='note'
  ) THEN
    ALTER TABLE public.stock_movements RENAME COLUMN notes TO note;
  END IF;
END $$;

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_no text;

CREATE INDEX IF NOT EXISTS stock_movements_warehouse_idx ON public.stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS stock_movements_reference_no_idx ON public.stock_movements(reference_no);