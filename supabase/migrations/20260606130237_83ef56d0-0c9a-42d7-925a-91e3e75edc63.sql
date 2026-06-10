-- Update unique SKU index to be case-insensitive
DROP INDEX IF EXISTS public.items_company_sku_active_idx;
CREATE UNIQUE INDEX items_company_sku_active_idx ON public.items (company_id, LOWER(sku)) WHERE (deleted_at IS NULL AND sku IS NOT NULL);
