
-- =====================================================
-- ERPOVO authorization hardening
-- =====================================================

-- 1. subscription_plans catalog -----------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  max_companies integer NOT NULL DEFAULT 1,
  max_devices integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sp_read_all ON public.subscription_plans;
CREATE POLICY sp_read_all ON public.subscription_plans FOR SELECT USING (true);
DROP POLICY IF EXISTS sp_admin_write ON public.subscription_plans;
CREATE POLICY sp_admin_write ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.subscription_plans (key, label, max_companies, max_devices, price, features, sort_order)
VALUES
  ('basic', 'Basic', 1, 1, 0,
   '{"payroll":false,"reports":true,"multi_user":false,"sales":true,"purchases":true,"inventory":true}'::jsonb, 1),
  ('gold', 'Gold', 2, 2, 60,
   '{"payroll":true,"reports":true,"multi_user":true,"sales":true,"purchases":true,"inventory":true}'::jsonb, 2),
  ('pro', 'Pro', 999999, 10, 100,
   '{"payroll":true,"reports":true,"multi_user":true,"sales":true,"purchases":true,"inventory":true,"api":true}'::jsonb, 3)
ON CONFLICT (key) DO UPDATE
  SET max_companies = EXCLUDED.max_companies,
      max_devices = EXCLUDED.max_devices,
      price = EXCLUDED.price,
      features = EXCLUDED.features,
      label = EXCLUDED.label;

-- 2. subscriptions.features ---------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.subscriptions s
   SET features = p.features
  FROM public.subscription_plans p
 WHERE p.key = s.plan
   AND (s.features IS NULL OR s.features = '{}'::jsonb);

-- 3. New business tables ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL DEFAULT 'bank',
  account_number text,
  ifsc text,
  opening_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bank_account_id uuid,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric NOT NULL DEFAULT 0,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  category text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_transactions TO authenticated;
GRANT ALL ON public.cash_transactions TO service_role;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.employee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'cash',
  reference_no text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_payments TO authenticated;
GRANT ALL ON public.employee_payments TO service_role;
ALTER TABLE public.employee_payments ENABLE ROW LEVEL SECURITY;

-- 4. Security definer helper functions ----------------------------------
CREATE OR REPLACE FUNCTION public.has_company_access(_user uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND owner_id = _user)
      OR EXISTS (SELECT 1 FROM public.company_members WHERE company_id = _company AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_user uuid, _company uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND owner_id = _user)
      OR EXISTS (
        SELECT 1 FROM public.company_members
         WHERE company_id = _company AND user_id = _user AND role = _role
      );
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE owner_id = _user
       AND status IN ('trial','active')
       AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.company_owner(_company uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_id FROM public.companies WHERE id = _company;
$$;

-- subscription tied to company owner, since features live on owner's plan
CREATE OR REPLACE FUNCTION public.company_has_active_subscription(_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_active_subscription(public.company_owner(_company));
$$;

CREATE OR REPLACE FUNCTION public.has_feature_access(_user uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (p.features ->> _feature)::boolean
       FROM public.subscriptions s
       JOIN public.subscription_plans p ON p.key = s.plan
      WHERE s.owner_id = _user
        AND s.status IN ('trial','active')
        AND s.expires_at > now()
      LIMIT 1),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.company_has_feature(_company uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_feature_access(public.company_owner(_company), _feature);
$$;

CREATE OR REPLACE FUNCTION public.has_role_permission(_user uuid, _company uuid, _key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_perm jsonb;
BEGIN
  -- Owner of company always allowed
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND owner_id = _user) THEN
    RETURN true;
  END IF;
  -- Global admin role always allowed
  IF public.has_role(_user, 'admin') THEN
    RETURN true;
  END IF;
  SELECT role INTO v_role FROM public.company_members
    WHERE company_id = _company AND user_id = _user LIMIT 1;
  IF v_role IS NULL THEN
    RETURN false;
  END IF;
  -- Company admin/owner role always allowed
  IF v_role IN ('owner','admin') THEN
    RETURN true;
  END IF;
  SELECT permissions INTO v_perm FROM public.role_permissions
    WHERE company_id = _company AND role = v_role::text LIMIT 1;
  IF v_perm IS NULL THEN
    RETURN false;
  END IF;
  RETURN COALESCE((v_perm ->> _key)::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.current_company_count(_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.companies WHERE owner_id = _user;
$$;

CREATE OR REPLACE FUNCTION public.current_device_count(_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.devices WHERE user_id = _user;
$$;

CREATE OR REPLACE FUNCTION public.user_max_companies(_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(max_companies), 1) FROM public.subscriptions WHERE owner_id = _user;
$$;

CREATE OR REPLACE FUNCTION public.user_max_devices(_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(max_devices), 1) FROM public.subscriptions WHERE owner_id = _user;
$$;

-- 5. Limit-enforcement triggers ------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_company_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current int;
  v_max int;
BEGIN
  v_current := public.current_company_count(NEW.owner_id);
  v_max := public.user_max_companies(NEW.owner_id);
  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Company limit reached' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_company_limit ON public.companies;
CREATE TRIGGER trg_enforce_company_limit
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_limit();

CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current int;
  v_max int;
BEGIN
  -- skip if device row already exists for that fingerprint (upsert path)
  IF EXISTS (
    SELECT 1 FROM public.devices
     WHERE user_id = NEW.user_id
       AND device_fingerprint = NEW.device_fingerprint
       AND id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  v_current := public.current_device_count(NEW.user_id);
  v_max := public.user_max_devices(NEW.user_id);
  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Device limit exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_device_limit ON public.devices;
CREATE TRIGGER trg_enforce_device_limit
  BEFORE INSERT ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_device_limit();

-- ensure unique fingerprint per user
CREATE UNIQUE INDEX IF NOT EXISTS devices_user_fingerprint_uniq
  ON public.devices (user_id, device_fingerprint);

-- 6. Rewrite RLS for business tables ------------------------------------
-- Helper macro: companies & subscription on USING; permission on WITH CHECK

-- parties
DROP POLICY IF EXISTS parties_member_all ON public.parties;
CREATE POLICY parties_select ON public.parties FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY parties_write ON public.parties FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'parties.write'));

-- items
DROP POLICY IF EXISTS items_member_all ON public.items;
CREATE POLICY items_select ON public.items FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY items_write ON public.items FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'items.write'));

-- sales
DROP POLICY IF EXISTS sales_member_all ON public.sales;
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY sales_write ON public.sales FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'sales.write'));

-- sale_items
DROP POLICY IF EXISTS sale_items_member_all ON public.sale_items;
CREATE POLICY sale_items_select ON public.sale_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id
                   AND public.has_company_access(auth.uid(), s.company_id)));
CREATE POLICY sale_items_write ON public.sale_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id
                   AND public.has_company_access(auth.uid(), s.company_id)
                   AND public.company_has_active_subscription(s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id
                   AND public.has_company_access(auth.uid(), s.company_id)
                   AND public.company_has_active_subscription(s.company_id)
                   AND public.has_role_permission(auth.uid(), s.company_id, 'sales.write')));

-- purchases
DROP POLICY IF EXISTS purchases_member_all ON public.purchases;
CREATE POLICY purchases_select ON public.purchases FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY purchases_write ON public.purchases FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'purchases.write'));

-- purchase_items
DROP POLICY IF EXISTS purchase_items_member_all ON public.purchase_items;
CREATE POLICY purchase_items_select ON public.purchase_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id
                   AND public.has_company_access(auth.uid(), p.company_id)));
CREATE POLICY purchase_items_write ON public.purchase_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id
                   AND public.has_company_access(auth.uid(), p.company_id)
                   AND public.company_has_active_subscription(p.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id
                   AND public.has_company_access(auth.uid(), p.company_id)
                   AND public.company_has_active_subscription(p.company_id)
                   AND public.has_role_permission(auth.uid(), p.company_id, 'purchases.write')));

-- expenses
DROP POLICY IF EXISTS expenses_member_all ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY expenses_write ON public.expenses FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'expenses.write'));

-- payments
DROP POLICY IF EXISTS payments_member_all ON public.payments;
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY payments_write ON public.payments FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'payments.write'));

-- bank_accounts
CREATE POLICY bank_select ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY bank_write ON public.bank_accounts FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'cash.write'));

-- cash_transactions
CREATE POLICY cash_select ON public.cash_transactions FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY cash_write ON public.cash_transactions FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.has_role_permission(auth.uid(), company_id, 'cash.write'));

-- HR tables — require payroll feature -----------------------------------
-- employees
DROP POLICY IF EXISTS employees_member_all ON public.employees;
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_feature(company_id, 'payroll'));
CREATE POLICY employees_write ON public.employees FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id)
         AND public.company_has_feature(company_id, 'payroll'))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.company_has_feature(company_id, 'payroll')
              AND public.has_role_permission(auth.uid(), company_id, 'payroll.write'));

-- attendance
DROP POLICY IF EXISTS attendance_member_all ON public.attendance;
CREATE POLICY attendance_select ON public.attendance FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_feature(company_id, 'payroll'));
CREATE POLICY attendance_write ON public.attendance FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id)
         AND public.company_has_feature(company_id, 'payroll'))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.company_has_feature(company_id, 'payroll')
              AND public.has_role_permission(auth.uid(), company_id, 'payroll.write'));

-- salary_slips
DROP POLICY IF EXISTS salary_slips_member_all ON public.salary_slips;
CREATE POLICY salary_slips_select ON public.salary_slips FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_feature(company_id, 'payroll'));
CREATE POLICY salary_slips_write ON public.salary_slips FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id)
         AND public.company_has_feature(company_id, 'payroll'))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.company_has_feature(company_id, 'payroll')
              AND public.has_role_permission(auth.uid(), company_id, 'payroll.write'));

-- employee_payments
CREATE POLICY emp_pay_select ON public.employee_payments FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_feature(company_id, 'payroll'));
CREATE POLICY emp_pay_write ON public.employee_payments FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id)
         AND public.company_has_active_subscription(company_id)
         AND public.company_has_feature(company_id, 'payroll'))
  WITH CHECK (public.has_company_access(auth.uid(), company_id)
              AND public.company_has_active_subscription(company_id)
              AND public.company_has_feature(company_id, 'payroll')
              AND public.has_role_permission(auth.uid(), company_id, 'payroll.write'));

-- role_permissions (only owner/admin can manage)
DROP POLICY IF EXISTS role_permissions_member_all ON public.role_permissions;
CREATE POLICY role_perm_select ON public.role_permissions FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY role_perm_write ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'owner')
         OR public.has_company_role(auth.uid(), company_id, 'admin')
         OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid()))
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'owner')
              OR public.has_company_role(auth.uid(), company_id, 'admin')
              OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid()));

-- tax_rates — keep open to members
-- (existing policy is fine; no change)

-- 7. Indexes for perf ---------------------------------------------------
CREATE INDEX IF NOT EXISTS companies_owner_idx ON public.companies(owner_id);
CREATE INDEX IF NOT EXISTS devices_user_idx ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS company_members_user_idx ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS company_members_company_idx ON public.company_members(company_id);
