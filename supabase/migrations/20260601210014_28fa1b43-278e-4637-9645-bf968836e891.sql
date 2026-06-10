-- =========================================================================
-- Phase A: ERPOVO feature buildout — additive schema
-- =========================================================================

-- ---------- 1. PARTY GROUPS ----------
CREATE TABLE IF NOT EXISTS public.party_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_groups TO authenticated;
GRANT ALL ON public.party_groups TO service_role;
ALTER TABLE public.party_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY pg_select ON public.party_groups FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY pg_write ON public.party_groups FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'parties.write'));
CREATE TRIGGER trg_party_groups_updated BEFORE UPDATE ON public.party_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2. ITEM CATEGORIES ----------
CREATE TABLE IF NOT EXISTS public.item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_categories TO authenticated;
GRANT ALL ON public.item_categories TO service_role;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY ic_select ON public.item_categories FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY ic_write ON public.item_categories FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'items.write'));
CREATE TRIGGER trg_item_categories_updated BEFORE UPDATE ON public.item_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. UNITS ----------
CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY un_select ON public.units FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY un_write ON public.units FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'items.write'));

-- ---------- 4. STOCK MOVEMENTS ----------
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  item_id uuid NOT NULL,
  qty numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  reference_type text,
  reference_id uuid,
  notes text,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY sm_select ON public.stock_movements FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY sm_write ON public.stock_movements FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'items.write'));

-- ---------- 5. STOCK ADJUSTMENTS ----------
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  item_id uuid NOT NULL,
  qty_change numeric NOT NULL,
  reason text NOT NULL DEFAULT 'manual',
  notes text,
  adjustment_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sa_select ON public.stock_adjustments FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY sa_write ON public.stock_adjustments FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'items.write'));

-- ---------- 6. CHEQUES ----------
CREATE TABLE IF NOT EXISTS public.cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  party_id uuid,
  bank_account_id uuid,
  cheque_number text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cleared','bounced','cancelled')),
  cheque_date date NOT NULL DEFAULT CURRENT_DATE,
  cleared_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheques TO authenticated;
GRANT ALL ON public.cheques TO service_role;
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
CREATE POLICY ch_select ON public.cheques FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY ch_write ON public.cheques FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'cash.write'));
CREATE TRIGGER trg_cheques_updated BEFORE UPDATE ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 7. LOANS ----------
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  lender_name text NOT NULL,
  principal numeric NOT NULL DEFAULT 0,
  outstanding numeric NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY ln_select ON public.loans FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY ln_write ON public.loans FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'cash.write'));
CREATE TRIGGER trg_loans_updated BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 8. BANK TRANSFERS ----------
CREATE TABLE IF NOT EXISTS public.bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  from_kind text NOT NULL CHECK (from_kind IN ('cash','bank')),
  from_bank_id uuid,
  to_kind text NOT NULL CHECK (to_kind IN ('cash','bank')),
  to_bank_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transfers TO authenticated;
GRANT ALL ON public.bank_transfers TO service_role;
ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_select ON public.bank_transfers FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY bt_write ON public.bank_transfers FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'cash.write'));

-- ---------- 9. ONLINE STORE SETTINGS ----------
CREATE TABLE IF NOT EXISTS public.online_store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  store_name text NOT NULL,
  description text,
  logo_url text,
  cover_url text,
  is_active boolean NOT NULL DEFAULT true,
  view_count integer NOT NULL DEFAULT 0,
  whatsapp_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.online_store_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_store_settings TO authenticated;
GRANT ALL ON public.online_store_settings TO service_role;
ALTER TABLE public.online_store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY oss_public_read ON public.online_store_settings FOR SELECT
  USING (is_active = true);
CREATE POLICY oss_member_read ON public.online_store_settings FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY oss_write ON public.online_store_settings FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id));
CREATE TRIGGER trg_online_store_settings_updated BEFORE UPDATE ON public.online_store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 10. ONLINE ORDERS ----------
CREATE TABLE IF NOT EXISTS public.online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  order_no text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_address text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  delivery_charge numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','shipped','delivered','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.online_orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_orders TO authenticated;
GRANT ALL ON public.online_orders TO service_role;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY oo_public_insert ON public.online_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.online_store_settings s
      WHERE s.company_id = online_orders.company_id
        AND s.is_active = true
    )
  );
CREATE POLICY oo_member_read ON public.online_orders FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY oo_member_write ON public.online_orders FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));
CREATE POLICY oo_member_delete ON public.online_orders FOR DELETE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE TRIGGER trg_online_orders_updated BEFORE UPDATE ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 11. SETTINGS KV ----------
CREATE TABLE IF NOT EXISTS public.settings_kv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings_kv TO authenticated;
GRANT ALL ON public.settings_kv TO service_role;
ALTER TABLE public.settings_kv ENABLE ROW LEVEL SECURITY;
CREATE POLICY skv_select ON public.settings_kv FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY skv_write ON public.settings_kv FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));
CREATE TRIGGER trg_settings_kv_updated BEFORE UPDATE ON public.settings_kv
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 12. RECYCLE BIN ----------
CREATE TABLE IF NOT EXISTS public.recycle_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recycle_bin TO authenticated;
GRANT ALL ON public.recycle_bin TO service_role;
ALTER TABLE public.recycle_bin ENABLE ROW LEVEL SECURITY;
CREATE POLICY rb_select ON public.recycle_bin FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY rb_write ON public.recycle_bin FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

-- ---------- 13. AUDIT LOGS ----------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY al_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY al_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

-- ---------- 14. ADDITIVE COLUMNS ----------
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS loyalty_points numeric NOT NULL DEFAULT 0;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS wholesale_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mrp numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_default text;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS labor_charge numeric NOT NULL DEFAULT 0;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS salary_type text NOT NULL DEFAULT 'fixed' CHECK (salary_type IN ('fixed','hajira')),
  ADD COLUMN IF NOT EXISTS daily_wage numeric NOT NULL DEFAULT 0;

ALTER TABLE public.salary_slips
  ADD COLUMN IF NOT EXISTS advance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due numeric NOT NULL DEFAULT 0;

-- ---------- 15. STORAGE BUCKET ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('item-images', 'item-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "item images public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'item-images');
CREATE POLICY "item images auth upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images');
CREATE POLICY "item images auth update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images');
CREATE POLICY "item images auth delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'item-images');

-- ---------- 16. INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON public.stock_movements(company_id, item_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_cheques_company ON public.cheques(company_id, status, cheque_date DESC);
CREATE INDEX IF NOT EXISTS idx_online_orders_company ON public.online_orders(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_company ON public.recycle_bin(company_id, entity_type, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_kv_company_key ON public.settings_kv(company_id, key);
CREATE INDEX IF NOT EXISTS idx_parties_group ON public.parties(company_id, group_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON public.items(company_id, category_id);
