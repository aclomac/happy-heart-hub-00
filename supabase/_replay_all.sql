-- ===== supabase/migrations/20260601173024_b91f3956-4097-44c2-a3e1-47707129e87b.sql =====

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "profiles_own_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('owner','admin','accountant','salesperson','viewer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ COMPANIES ============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_type TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  currency TEXT NOT NULL DEFAULT 'BDT',
  fiscal_year_start TEXT NOT NULL DEFAULT '07-01',
  logo_url TEXT,
  gst_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- security definer: avoids recursion when used in policies on other tables
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.companies WHERE id = _company_id AND owner_id = _user_id
  )
$$;

CREATE POLICY "companies_member_select" ON public.companies FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_company_member(id, auth.uid()));
CREATE POLICY "companies_owner_insert" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "companies_owner_update" ON public.companies FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY "companies_owner_delete" ON public.companies FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "members_self_or_owner_select" ON public.company_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid()));
CREATE POLICY "members_owner_manage_insert" ON public.company_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid()));
CREATE POLICY "members_owner_manage_update" ON public.company_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid()));
CREATE POLICY "members_owner_manage_delete" ON public.company_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid()));

-- ============ PARTIES ============
CREATE TABLE public.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('customer','supplier','both')),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_parties_company ON public.parties(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties TO authenticated;
GRANT ALL ON public.parties TO service_role;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties_member_all" ON public.parties FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- ============ ITEMS ============
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'PCS',
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  low_stock_alert NUMERIC(14,3),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  hsn_code TEXT,
  image_url TEXT,
  is_service BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_company ON public.items(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_member_all" ON public.items FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- ============ SALES ============
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','partial','unpaid','overdue','draft','cancelled')),
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  delivery_charge NUMERIC(14,2) NOT NULL DEFAULT 0,
  round_off NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_no)
);
CREATE INDEX idx_sales_company_date ON public.sales(company_id, invoice_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_member_all" ON public.sales FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  qty NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'PCS',
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_member_all" ON public.sale_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.is_company_member(s.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.is_company_member(s.company_id, auth.uid())));

-- ============ PURCHASES ============
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bill_no TEXT NOT NULL,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','partial','unpaid','overdue','draft','cancelled')),
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, bill_no)
);
CREATE INDEX idx_purchases_company_date ON public.purchases(company_id, bill_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases_member_all" ON public.purchases FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  qty NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'PCS',
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_purchase_items_purchase ON public.purchase_items(purchase_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_items_member_all" ON public.purchase_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND public.is_company_member(p.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND public.is_company_member(p.company_id, auth.uid())));

-- ============ PAYMENTS & EXPENSES ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  method TEXT NOT NULL DEFAULT 'cash',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference_no TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_company_date ON public.payments(company_id, payment_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_member_all" ON public.payments FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_company_date ON public.expenses(company_id, expense_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_member_all" ON public.expenses FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER t_profiles_updated  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_parties_updated   BEFORE UPDATE ON public.parties   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_items_updated     BEFORE UPDATE ON public.items     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_sales_updated     BEFORE UPDATE ON public.sales     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_purchases_updated BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUTO PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== supabase/migrations/20260601173048_d66c238d-fb2a-46c6-b2d0-c6ccc2c29f0b.sql =====

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ===== supabase/migrations/20260601175722_745f686a-7eec-4ba3-a846-33055e6327ac.sql =====

-- Payroll: employees
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  code text,
  name text NOT NULL,
  designation text,
  department text,
  phone text,
  email text,
  address text,
  pay_type text NOT NULL DEFAULT 'fixed',
  base_salary numeric NOT NULL DEFAULT 0,
  joining_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employees_member_all ON public.employees FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attendance
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'present',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_member_all ON public.attendance FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- Salary slips
CREATE TABLE public.salary_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  period_month text NOT NULL,
  days_present numeric NOT NULL DEFAULT 0,
  days_total numeric NOT NULL DEFAULT 30,
  gross numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  bonus numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_slips TO authenticated;
GRANT ALL ON public.salary_slips TO service_role;
ALTER TABLE public.salary_slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY salary_slips_member_all ON public.salary_slips FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE TRIGGER update_salary_slips_updated_at BEFORE UPDATE ON public.salary_slips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tax rates
CREATE TABLE public.tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'GST',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_rates TO authenticated;
GRANT ALL ON public.tax_rates TO service_role;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_rates_member_all ON public.tax_rates FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- Storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Company logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can upload company logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can update company logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can delete company logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos');

-- ===== supabase/migrations/20260601180728_5742cdf1-3870-4117-9922-e4ad8119e063.sql =====

-- Subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic','gold','pro')),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','expired','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  max_companies integer NOT NULL DEFAULT 1,
  max_devices integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_own_select" ON public.subscriptions FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "subscriptions_own_insert" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "subscriptions_own_update" ON public.subscriptions FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Devices
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  device_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_fingerprint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices_own_all" ON public.devices FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Role permissions
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  role text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_member_all" ON public.role_permissions FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE TRIGGER trg_role_permissions_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create trial subscription for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.subscriptions (owner_id, plan, status, expires_at, max_companies, max_devices)
  VALUES (NEW.id, 'basic', 'trial', now() + interval '30 days', 1, 1)
  ON CONFLICT (owner_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- Backfill existing users
INSERT INTO public.subscriptions (owner_id, plan, status, expires_at, max_companies, max_devices)
SELECT id, 'basic', 'trial', now() + interval '30 days', 1, 1 FROM auth.users
ON CONFLICT (owner_id) DO NOTHING;

-- ===== supabase/migrations/20260601181144_f35508a3-02d3-4c83-ae59-6af533c210e7.sql =====

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'salesman';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'biller';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stock_keeper';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr_manager';

-- ===== supabase/migrations/20260601185325_7b11a092-9615-4c5b-994b-8e91cc8e5ca2.sql =====

-- payment_requests
CREATE TABLE public.payment_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('gold','pro')),
  amount NUMERIC NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  sender_info TEXT NOT NULL,
  screenshot_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_own_select" ON public.payment_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pr_own_insert" ON public.payment_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "pr_admin_update" ON public.payment_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payment_requests_updated
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- payment_settings
CREATE TABLE public.payment_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  method TEXT NOT NULL,
  label TEXT NOT NULL,
  account_number TEXT,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ps_auth_select" ON public.payment_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ps_admin_insert" ON public.payment_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ps_admin_update" ON public.payment_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ps_admin_delete" ON public.payment_settings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payment_settings_updated
  BEFORE UPDATE ON public.payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default payment methods
INSERT INTO public.payment_settings (method, label, account_number, instructions, sort_order) VALUES
  ('bkash', 'bKash', '01XXXXXXXXX', 'Send Money to this bKash number, then submit the transaction ID below.', 1),
  ('nagad', 'Nagad', '01XXXXXXXXX', 'Send Money via Nagad, then submit the transaction ID below.', 2),
  ('rocket', 'Rocket', '01XXXXXXXXX', 'Send Money via Rocket, then submit the transaction ID below.', 3),
  ('bank', 'Bank Transfer', 'Bank: XYZ — A/C: 0000000000', 'Transfer to the listed bank account and submit the reference number.', 4),
  ('stripe', 'Stripe / Card (coming soon)', NULL, 'Card payments will be available soon.', 5);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "payment_screenshots_user_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "payment_screenshots_user_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-screenshots' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ===== supabase/migrations/20260601185807_14bd7527-cf2b-4b12-888f-8b43f0847633.sql =====

CREATE OR REPLACE FUNCTION public.promote_first_user_to_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_promote_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_promote_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.promote_first_user_to_admin();

-- ===== supabase/migrations/20260601185828_a0ec2c39-21cf-4fdd-b2c9-23a12b28de40.sql =====

REVOKE ALL ON FUNCTION public.promote_first_user_to_admin() FROM PUBLIC, anon, authenticated;

-- ===== supabase/migrations/20260601194548_680b8d25-e092-44de-8e2c-1485050cdc66.sql =====

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

-- ===== supabase/migrations/20260601194626_c8051f95-954d-45eb-bb9a-be54a1478582.sql =====

REVOKE EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_has_active_subscription(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_feature_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_has_feature(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_permission(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_company_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_device_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_max_companies(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_max_devices(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_company_limit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_device_limit() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_feature_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_has_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_permission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_device_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_max_companies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_max_devices(uuid) TO authenticated;

-- ===== supabase/migrations/20260601203455_8ed91f42-910b-4066-8686-8914e19bad09.sql =====
CREATE OR REPLACE FUNCTION public.has_role_permission(_user uuid, _company uuid, _key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_perm jsonb;
BEGIN
  IF _user IS NULL OR _company IS NULL THEN
    RETURN false;
  END IF;

  -- Owner of THIS specific company
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND owner_id = _user) THEN
    RETURN true;
  END IF;

  -- Must be a member of THIS specific company. No global-admin bypass.
  SELECT role INTO v_role FROM public.company_members
   WHERE company_id = _company AND user_id = _user
   LIMIT 1;
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role IN ('owner','admin') THEN
    RETURN true;
  END IF;

  SELECT permissions INTO v_perm FROM public.role_permissions
   WHERE company_id = _company AND role = v_role::text
   LIMIT 1;
  IF v_perm IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE((v_perm ->> _key)::boolean, false);
END;
$$;

UPDATE public.subscriptions
   SET max_companies = 999999
 WHERE plan = 'pro' AND max_companies < 999999;

UPDATE public.subscription_plans
   SET max_companies = 999999
 WHERE key = 'pro' AND max_companies < 999999;
-- ===== supabase/migrations/20260601204118_ff16ab37-bc9e-4348-afd9-54b56d2d9bac.sql =====
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS reference_sale_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_doc_type_chk'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_doc_type_chk
      CHECK (doc_type IN ('invoice','estimate','sale_order','delivery_challan','credit_note'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_company_doctype
  ON public.sales(company_id, doc_type, invoice_date DESC);
-- ===== supabase/migrations/20260601204747_8ae0dd6f-0eb3-441d-bfff-bc928af65fd0.sql =====
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
-- ===== supabase/migrations/20260601210014_28fa1b43-278e-4637-9645-bf968836e891.sql =====
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

-- ===== supabase/migrations/20260602053959_77a09fee-f9d3-47a3-8133-6a404178d381.sql =====

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

-- ===== supabase/migrations/20260602060156_f040cf09-0900-4b0a-8027-3fbfe0a9ad44.sql =====

-- Bank accounts: branch, note, provider
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS provider text;

-- Cash transactions: link to source documents
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS reference_type text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS reference_id uuid;
CREATE INDEX IF NOT EXISTS idx_cash_txn_ref ON public.cash_transactions(reference_type, reference_id);

-- Loans: extra fields
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS counterparty_type text NOT NULL DEFAULT 'payable';
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS payment_account_kind text;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS payment_bank_id uuid;

-- Loan payments
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  interest_amount numeric NOT NULL DEFAULT 0,
  principal_amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  bank_account_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_payments TO authenticated;
GRANT ALL ON public.loan_payments TO service_role;

ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY lp_select ON public.loan_payments FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY lp_write ON public.loan_payments FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id) AND public.has_role_permission(auth.uid(), company_id, 'cash.write'));

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON public.loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_company ON public.loan_payments(company_id);

-- ===== supabase/migrations/20260602062656_fe8bd4ba-d821-467e-a22b-fcb5567a86b8.sql =====
CREATE TABLE public.cash_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  recon_date date NOT NULL DEFAULT CURRENT_DATE,
  store text,
  opening_balance numeric NOT NULL DEFAULT 0,
  system_balance numeric NOT NULL DEFAULT 0,
  physical_balance numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'matched',
  note text,
  attachment_url text,
  responsible_user_id uuid,
  adjustment_txn_id uuid,
  is_cancelled boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_reconciliations TO authenticated;
GRANT ALL ON public.cash_reconciliations TO service_role;

ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY recon_select ON public.cash_reconciliations
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY recon_write ON public.cash_reconciliations
  FOR ALL TO authenticated
  USING (has_company_access(auth.uid(), company_id) AND company_has_active_subscription(company_id))
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND company_has_active_subscription(company_id)
    AND has_role_permission(auth.uid(), company_id, 'cash.write')
  );

CREATE INDEX idx_cash_recon_company_date ON public.cash_reconciliations (company_id, recon_date DESC);
CREATE INDEX idx_cash_recon_company_status ON public.cash_reconciliations (company_id, status);
-- ===== supabase/migrations/20260602063338_5b987477-7c2b-4e13-8818-ac0e0c7c7347.sql =====
-- Create dedicated bucket for cash reconciliation attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('reconciliation-attachments', 'reconciliation-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Company-scoped storage policies (folder name = company_id)
DROP POLICY IF EXISTS "recon_attach_read" ON storage.objects;
CREATE POLICY "recon_attach_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'reconciliation-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "recon_attach_insert" ON storage.objects;
CREATE POLICY "recon_attach_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reconciliation-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "recon_attach_update" ON storage.objects;
CREATE POLICY "recon_attach_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'reconciliation-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "recon_attach_delete" ON storage.objects;
CREATE POLICY "recon_attach_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'reconciliation-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
-- ===== supabase/migrations/20260602065007_ac3df735-d1c0-44ce-bb07-fec76204bb1d.sql =====

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

-- ===== supabase/migrations/20260602070316_43811a04-f257-45a8-9f28-417917fecf3a.sql =====

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS reference_no text,
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS amount_impact numeric,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

UPDATE public.audit_logs SET module = entity_type WHERE module IS NULL AND entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON public.audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_module ON public.audit_logs (company_id, module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_user ON public.audit_logs (company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_action ON public.audit_logs (company_id, action);

DROP POLICY IF EXISTS al_select ON public.audit_logs;
CREATE POLICY al_select ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner'::app_role)
    OR public.has_company_role(auth.uid(), company_id, 'admin'::app_role)
  );

-- ===== supabase/migrations/20260602071511_6a5a4ac6-44ac-480a-8451-0d0d6c3d946b.sql =====

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

-- ===== supabase/migrations/20260602122636_e317c872-d1ec-4e96-b200-22d54be8ea8a.sql =====
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dhaka';
-- ===== supabase/migrations/20260603074344_3ebfdbb5-968d-4ee0-8b4e-59906ebfc29e.sql =====

-- 1. Storage: company-logos and item-images — restrict write/delete to company members
DROP POLICY IF EXISTS "Authenticated users can upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete company logos" ON storage.objects;
DROP POLICY IF EXISTS "Company logos are publicly readable" ON storage.objects;

CREATE POLICY "company_logos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "company_logos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "company_logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
-- No SELECT policy needed — bucket is public so files are served via public URL; omitting SELECT prevents bucket listing.

DROP POLICY IF EXISTS "item images auth upload" ON storage.objects;
DROP POLICY IF EXISTS "item images auth update" ON storage.objects;
DROP POLICY IF EXISTS "item images auth delete" ON storage.objects;
DROP POLICY IF EXISTS "item images public read" ON storage.objects;

CREATE POLICY "item_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "item_images_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "item_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'item-images' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- 2. Subscriptions: remove direct INSERT/UPDATE from authenticated users.
DROP POLICY IF EXISTS subscriptions_own_insert ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_own_update ON public.subscriptions;
-- Trial creation still works via SECURITY DEFINER trigger handle_new_user_subscription.
-- Plan upgrades must go through service_role (server-side after payment verification).

-- 3. Audit logs: remove client INSERT — audit writes must use SECURITY DEFINER.
DROP POLICY IF EXISTS al_insert ON public.audit_logs;

-- 4. Tax rates: gate writes by has_role_permission consistent with other tables
DROP POLICY IF EXISTS tax_rates_member_all ON public.tax_rates;
CREATE POLICY tax_rates_select ON public.tax_rates FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY tax_rates_write ON public.tax_rates FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id) AND public.has_role_permission(auth.uid(), company_id, 'items.write'));

-- 5. Revoke EXECUTE on SECURITY DEFINER helpers from anon (none should be callable unauthenticated).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role_permission(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_feature_access(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_has_active_subscription(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_has_feature(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_company_count(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_device_count(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_max_companies(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_max_devices(uuid) FROM anon, public;

-- ===== supabase/migrations/20260603081906_718a9ac7-1544-41db-9492-6d398c86a820.sql =====
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _company_id uuid,
  _module text,
  _action text,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _reference_no text DEFAULT NULL,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL,
  _amount_impact numeric DEFAULT NULL,
  _status text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _company_id IS NULL OR NOT public.has_company_access(v_uid, _company_id) THEN
    RAISE EXCEPTION 'Access denied for company' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    company_id, user_id, action, entity_type, entity_id, module,
    reference_no, old_value, new_value, amount_impact, status,
    user_agent, metadata
  ) VALUES (
    _company_id, v_uid, _action, COALESCE(_entity_type, _module), _entity_id, _module,
    _reference_no, _old_value, _new_value, _amount_impact, _status,
    _user_agent, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, jsonb, jsonb, numeric, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, jsonb, jsonb, numeric, text, text, jsonb) TO authenticated;
-- ===== supabase/migrations/20260603082601_47bfe9e5-4899-4856-858a-4839f9de849c.sql =====
-- Lock down audit_logs: only SELECT for company owners/admins; writes go through SECURITY DEFINER log_audit_event()
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;

-- Lock down subscriptions: writes happen only via SECURITY DEFINER trigger (handle_new_user_subscription) or service_role
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;

-- Add SELECT (listing) policies on storage.objects to prevent cross-company enumeration
-- Public buckets still serve files via public URLs without RLS; this only governs the list/API path.
CREATE POLICY "company_logos_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "item_images_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'item-images'
  AND has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
-- ===== supabase/migrations/20260603090805_90ede33b-a299-46d4-8a81-43b742cdce8d.sql =====

-- recycle_bin: split write policy
DROP POLICY IF EXISTS rb_write ON public.recycle_bin;
CREATE POLICY rb_insert ON public.recycle_bin FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));
CREATE POLICY rb_update ON public.recycle_bin FOR UPDATE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'))
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'admin'));
CREATE POLICY rb_delete ON public.recycle_bin FOR DELETE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'));

-- stock_movements: require a write-capable role
DROP POLICY IF EXISTS sm_write ON public.stock_movements;
CREATE POLICY sm_write ON public.stock_movements FOR ALL TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND (
      public.has_role_permission(auth.uid(), company_id, 'items.write')
      OR public.has_role_permission(auth.uid(), company_id, 'sales.write')
      OR public.has_role_permission(auth.uid(), company_id, 'purchases.write')
    )
  )
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND (
      public.has_role_permission(auth.uid(), company_id, 'items.write')
      OR public.has_role_permission(auth.uid(), company_id, 'sales.write')
      OR public.has_role_permission(auth.uid(), company_id, 'purchases.write')
    )
  );

-- item_store_stock: derived cache, only admin/owner may touch directly
-- NOTE: This table was created manually in the original project's dashboard
-- and was never captured by a historical migration. Re-create it here so the
-- replay script is self-contained against an empty Cloud DB.
CREATE TABLE IF NOT EXISTS public.item_store_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  item_id uuid NOT NULL,
  variant_id uuid NULL,
  warehouse_id uuid NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  opening_stock numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS item_store_stock_unique
  ON public.item_store_stock (company_id, item_id, warehouse_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS item_store_stock_company_idx ON public.item_store_stock (company_id);
CREATE INDEX IF NOT EXISTS item_store_stock_item_idx ON public.item_store_stock (item_id);
CREATE INDEX IF NOT EXISTS item_store_stock_warehouse_idx ON public.item_store_stock (warehouse_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_store_stock TO authenticated;
GRANT ALL ON public.item_store_stock TO service_role;

ALTER TABLE public.item_store_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iss_read ON public.item_store_stock;
CREATE POLICY iss_read ON public.item_store_stock FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

DROP POLICY IF EXISTS iss_write ON public.item_store_stock;
CREATE POLICY iss_write ON public.item_store_stock FOR ALL TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'admin'))
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'admin'));

-- ===== supabase/migrations/20260603091036_ae65fa5b-4801-4c1b-8a78-f6e66426e366.sql =====

DROP POLICY IF EXISTS role_perm_write ON public.role_permissions;
CREATE POLICY role_perm_write ON public.role_permissions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = role_permissions.company_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = role_permissions.company_id AND c.owner_id = auth.uid()));

-- ===== supabase/migrations/20260603123941_34524bcf-36ba-4ff3-a421-35a6d5010337.sql =====

-- 1. Extend subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yearly_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_sp_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_sp_updated_at BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. platform_admins
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'super_admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Helper (security definer; safe — only reads platform_admins by user_id)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user)
$$;

CREATE POLICY pa_select_self_or_admin ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY pa_admin_write ON public.platform_admins
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 3. platform_audit_logs
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY pal_admin_select ON public.platform_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Writes happen via SECURITY DEFINER function only.
CREATE OR REPLACE FUNCTION public.log_platform_audit(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.platform_audit_logs (actor_user_id, action, target_type, target_id, metadata)
  VALUES (v_uid, _action, _target_type, _target_id, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 4. company_subscriptions
CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  plan_id uuid,
  plan_key text,
  status text NOT NULL DEFAULT 'trial',
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_company ON public.company_subscriptions(company_id);

GRANT SELECT ON public.company_subscriptions TO authenticated;
GRANT ALL ON public.company_subscriptions TO service_role;

ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cs_select ON public.company_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_company_access(auth.uid(), company_id)
  );

CREATE POLICY cs_admin_write ON public.company_subscriptions
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_cs_updated_at ON public.company_subscriptions;
CREATE TRIGGER trg_cs_updated_at BEFORE UPDATE ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Allow platform admins to read profiles + companies + subscriptions broadly
CREATE POLICY profiles_platform_admin_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY companies_platform_admin_select ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY subscriptions_platform_admin_select ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 6. Allow platform admins to write subscription_plans (existing policy already
-- allows global 'admin'; add platform_admin path).
DROP POLICY IF EXISTS sp_platform_admin_write ON public.subscription_plans;
CREATE POLICY sp_platform_admin_write ON public.subscription_plans
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ===== supabase/migrations/20260603130612_63a77866-fe87-437a-93d6-33422dd7af50.sql =====

CREATE OR REPLACE FUNCTION public.add_platform_admin_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_target FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', _email USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.platform_admins (user_id, role)
  VALUES (v_target, 'super_admin')
  ON CONFLICT (user_id) DO NOTHING;
  PERFORM public.log_platform_audit('platform_admin.add', 'platform_admin', v_target,
    jsonb_build_object('email', _email));
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_platform_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.platform_admins;
  IF v_count <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last platform admin' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.platform_admins WHERE user_id = _user_id;
  PERFORM public.log_platform_audit('platform_admin.remove', 'platform_admin', _user_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_platform_admin_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_platform_admin(uuid) TO authenticated;

-- ===== supabase/migrations/20260603131533_394307be-503c-439d-8d55-94ec78880773.sql =====

-- payment_settings: extend with Phase 2 columns
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS min_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_amount numeric,
  ADD COLUMN IF NOT EXISTS sandbox_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS api_key text,
  ADD COLUMN IF NOT EXISTS webhook_secret text;

-- Switch payment_settings write policies to platform admin
DROP POLICY IF EXISTS ps_admin_insert ON public.payment_settings;
DROP POLICY IF EXISTS ps_admin_update ON public.payment_settings;
DROP POLICY IF EXISTS ps_admin_delete ON public.payment_settings;

CREATE POLICY ps_platform_admin_insert ON public.payment_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY ps_platform_admin_update ON public.payment_settings
  FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY ps_platform_admin_delete ON public.payment_settings
  FOR DELETE TO authenticated
  USING (is_platform_admin(auth.uid()));

-- payment_requests: extend schema
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BDT',
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS proof_url text;

ALTER TABLE public.payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_status_check;
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_status_check
  CHECK (status IN ('pending','under_review','approved','rejected','cancelled'));

ALTER TABLE public.payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_plan_check;

ALTER TABLE public.payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_billing_period_check;
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_billing_period_check
  CHECK (billing_period IN ('monthly','yearly'));

-- Allow platform admins to read and update all payment requests
DROP POLICY IF EXISTS pr_platform_admin_select ON public.payment_requests;
CREATE POLICY pr_platform_admin_select ON public.payment_requests
  FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS pr_platform_admin_update ON public.payment_requests;
CREATE POLICY pr_platform_admin_update ON public.payment_requests
  FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- Allow company owners/admins to read their company's payment requests
DROP POLICY IF EXISTS pr_company_admin_select ON public.payment_requests;
CREATE POLICY pr_company_admin_select ON public.payment_requests
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND (
      has_company_role(auth.uid(), company_id, 'owner'::app_role)
      OR has_company_role(auth.uid(), company_id, 'admin'::app_role)
    )
  );

CREATE INDEX IF NOT EXISTS idx_pr_company ON public.payment_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON public.payment_requests(status);

-- ===== supabase/migrations/20260603133901_55dc1d3a-3aa2-496d-97f6-e0c2b4602c47.sql =====
-- Phase 3: Feature overrides, coupons, redemptions + helper functions

-- =============== company_feature_overrides ===============
CREATE TABLE public.company_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  is_beta boolean NOT NULL DEFAULT false,
  internal_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, feature_key)
);

GRANT SELECT ON public.company_feature_overrides TO authenticated;
GRANT ALL ON public.company_feature_overrides TO service_role;

ALTER TABLE public.company_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY cfo_platform_admin_all ON public.company_feature_overrides
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY cfo_company_select_own ON public.company_feature_overrides
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE TRIGGER cfo_updated_at
  BEFORE UPDATE ON public.company_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== platform_coupons ===============
CREATE TABLE public.platform_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('flat','percentage')),
  discount_value numeric NOT NULL CHECK (discount_value >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  plan_key text,
  billing_period text NOT NULL DEFAULT 'all' CHECK (billing_period IN ('monthly','yearly','all')),
  company_id uuid,
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  internal_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.platform_coupons TO authenticated;
GRANT ALL ON public.platform_coupons TO service_role;

ALTER TABLE public.platform_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY pc_platform_admin_all ON public.platform_coupons
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE TRIGGER pc_updated_at
  BEFORE UPDATE ON public.platform_coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== coupon_redemptions ===============
CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.platform_coupons(id) ON DELETE CASCADE,
  payment_request_id uuid NOT NULL,
  company_id uuid,
  user_id uuid NOT NULL,
  discount_applied numeric NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, payment_request_id)
);

GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_platform_admin_all ON public.coupon_redemptions
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY cr_own_select ON public.coupon_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============== Add coupon_id to payment_requests ===============
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.platform_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

-- =============== Helper: feature with override precedence ===============
CREATE OR REPLACE FUNCTION public.company_feature_resolved(_company uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override record;
BEGIN
  SELECT enabled, expires_at INTO v_override
    FROM public.company_feature_overrides
   WHERE company_id = _company AND feature_key = _feature
   LIMIT 1;

  IF FOUND THEN
    IF v_override.expires_at IS NULL OR v_override.expires_at > now() THEN
      RETURN v_override.enabled;
    END IF;
  END IF;

  -- Fall back to plan
  RETURN public.company_has_feature(_company, _feature);
END;
$$;

-- =============== Helper: validate coupon ===============
CREATE OR REPLACE FUNCTION public.validate_coupon(
  _code text,
  _plan_key text,
  _billing_period text,
  _company_id uuid,
  _user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.platform_coupons
   WHERE upper(code) = upper(_code) LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not found');
  END IF;
  IF NOT c.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is inactive');
  END IF;
  IF c.valid_from > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not yet active');
  END IF;
  IF c.valid_until IS NOT NULL AND c.valid_until < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon expired');
  END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon usage limit reached');
  END IF;
  IF c.plan_key IS NOT NULL AND c.plan_key <> _plan_key THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this plan');
  END IF;
  IF c.billing_period <> 'all' AND c.billing_period <> _billing_period THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this billing period');
  END IF;
  IF c.company_id IS NOT NULL AND c.company_id <> _company_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this company');
  END IF;
  IF c.user_id IS NOT NULL AND c.user_id <> _user_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not valid for this user');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', c.id,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value
  );
END;
$$;

-- =============== Helper: mark stale devices ===============
CREATE OR REPLACE FUNCTION public.platform_mark_stale_devices(_days int DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.devices
   WHERE last_seen_at < now() - make_interval(days => _days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_platform_audit('devices.mark_stale','devices', NULL,
    jsonb_build_object('days', _days, 'removed', v_count));
  RETURN v_count;
END;
$$;
-- ===== supabase/migrations/20260603135940_bb6b5931-90a3-496c-99fd-8ccdb30bb99e.sql =====

-- Phase 4: Platform Settings, Support Tickets, Announcements

-- 1) Platform settings (singleton row)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name text NOT NULL DEFAULT 'ERPovo',
  platform_logo_url text,
  support_email text,
  support_phone text,
  support_whatsapp text,
  terms_url text,
  privacy_url text,
  default_currency text NOT NULL DEFAULT 'BDT',
  default_timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  default_trial_days integer NOT NULL DEFAULT 14,
  default_invoice_prefix text NOT NULL DEFAULT 'INV',
  default_receipt_prefix text NOT NULL DEFAULT 'RCP',
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  signup_enabled boolean NOT NULL DEFAULT true,
  demo_login_enabled boolean NOT NULL DEFAULT false,
  is_singleton boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton UNIQUE (is_singleton)
);

GRANT SELECT ON public.platform_settings TO authenticated, anon;
GRANT INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ps_public_read ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY ps_admin_write ON public.platform_settings
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

INSERT INTO public.platform_settings (is_singleton) VALUES (true)
ON CONFLICT (is_singleton) DO NOTHING;

CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  subject text NOT NULL,
  module text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  proof_url text,
  assigned_to uuid,
  last_reply_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (priority IN ('low','normal','high','urgent')),
  CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed'))
);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY st_own_select ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_platform_admin(auth.uid()));

CREATE POLICY st_own_insert ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY st_admin_update ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_support_tickets_user ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX idx_support_tickets_status ON public.support_tickets (status, created_at DESC);

-- 3) Support ticket messages
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY stm_select ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR (
      NOT is_internal AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = support_ticket_messages.ticket_id AND t.user_id = auth.uid()
      )
    )
  );

CREATE POLICY stm_insert ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      is_platform_admin(auth.uid())
      OR (
        NOT is_internal AND EXISTS (
          SELECT 1 FROM public.support_tickets t
          WHERE t.id = support_ticket_messages.ticket_id AND t.user_id = auth.uid()
        )
      )
    )
  );

CREATE INDEX idx_stm_ticket ON public.support_ticket_messages (ticket_id, created_at);

-- 4) Platform announcements
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  audience text NOT NULL DEFAULT 'all',
  target_plan text,
  target_company_id uuid,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_dismissible boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (type IN ('info','warning','success','maintenance')),
  CHECK (audience IN ('all','plan','company','expired','trial'))
);

GRANT SELECT ON public.platform_announcements TO authenticated;
GRANT ALL ON public.platform_announcements TO service_role;

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY pa_user_select_active ON public.platform_announcements
  FOR SELECT TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR (
      is_active = true
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at >= now())
    )
  );

CREATE POLICY pa_admin_all ON public.platform_announcements
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE TRIGGER platform_announcements_updated_at
  BEFORE UPDATE ON public.platform_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Dismissals
CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.platform_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

GRANT SELECT, INSERT ON public.announcement_dismissals TO authenticated;
GRANT ALL ON public.announcement_dismissals TO service_role;

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY ad_own ON public.announcement_dismissals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY ad_own_insert ON public.announcement_dismissals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ===== supabase/migrations/20260603141420_28cc4dcc-0c9c-4e19-b05d-6e3cf8292b9a.sql =====
-- Contact / demo requests from public visitors
CREATE TABLE public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  business_name text,
  message text,
  preferred_contact text NOT NULL DEFAULT 'email',
  request_type text NOT NULL DEFAULT 'contact', -- contact | demo | sales
  status text NOT NULL DEFAULT 'new', -- new | contacted | closed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.contact_requests TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can submit
CREATE POLICY "cr_public_insert"
ON public.contact_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only platform admins can read / manage
CREATE POLICY "cr_admin_read"
ON public.contact_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cr_admin_update"
ON public.contact_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cr_admin_delete"
ON public.contact_requests
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_contact_requests_status_created ON public.contact_requests (status, created_at DESC);

-- ===== supabase/migrations/20260603142519_2dc3813b-8a4d-403d-8a23-f0c52bb527b7.sql =====
-- Defensive: stock_transfers / stock_transfer_items were originally created
-- via the dashboard, so no migration defines them. Recreate idempotently
-- before any dependent policy/index/grant runs.
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  from_warehouse_id UUID,
  to_warehouse_id UUID,
  transfer_no TEXT,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID,
  posted_by UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_company ON public.stock_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_date ON public.stock_transfers(company_id, transfer_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS st_select ON public.stock_transfers;
CREATE POLICY st_select ON public.stock_transfers FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
DROP POLICY IF EXISTS st_write ON public.stock_transfers;
CREATE POLICY st_write ON public.stock_transfers FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  variant_id UUID,
  qty NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'PCS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON public.stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_item ON public.stock_transfer_items(item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfer_items TO service_role;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sti_select ON public.stock_transfer_items;
CREATE POLICY sti_select ON public.stock_transfer_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_items.transfer_id
      AND public.has_company_access(auth.uid(), t.company_id)
  ));

DROP POLICY IF EXISTS sti_write ON public.stock_transfer_items;
CREATE POLICY sti_write ON public.stock_transfer_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_items.transfer_id
      AND public.has_company_access(auth.uid(), t.company_id)
      AND public.has_role_permission(auth.uid(), t.company_id, 'items.write')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_items.transfer_id
      AND public.has_company_access(auth.uid(), t.company_id)
      AND public.company_has_active_subscription(t.company_id)
      AND public.has_role_permission(auth.uid(), t.company_id, 'items.write')
  ));
-- ===== supabase/migrations/20260603143343_b149193b-3005-43df-9a08-7dcce78d7ece.sql =====
DROP POLICY IF EXISTS ps_auth_select ON public.payment_settings;
CREATE POLICY ps_platform_admin_select ON public.payment_settings
  FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));
-- ===== supabase/migrations/20260603150950_4a0210ff-d565-4d9c-aa64-203be44ba09a.sql =====

-- Make subscription_plans the source of truth for max_companies / max_devices.
CREATE OR REPLACE FUNCTION public.user_max_companies(_user uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.max_companies
       FROM public.subscriptions s
       JOIN public.subscription_plans p ON p.key = s.plan
      WHERE s.owner_id = _user
      ORDER BY p.max_companies DESC
      LIMIT 1),
    (SELECT MAX(max_companies) FROM public.subscriptions WHERE owner_id = _user),
    1
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_max_devices(_user uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.max_devices
       FROM public.subscriptions s
       JOIN public.subscription_plans p ON p.key = s.plan
      WHERE s.owner_id = _user
      ORDER BY p.max_devices DESC
      LIMIT 1),
    (SELECT MAX(max_devices) FROM public.subscriptions WHERE owner_id = _user),
    1
  );
$function$;

-- Backfill stale subscription rows so their cached max_* mirror the plan.
UPDATE public.subscriptions s
   SET max_companies = p.max_companies,
       max_devices   = p.max_devices
  FROM public.subscription_plans p
 WHERE p.key = s.plan
   AND (s.max_companies <> p.max_companies OR s.max_devices <> p.max_devices);

-- ===== supabase/migrations/20260603151816_d357f32d-c9d3-42f3-a449-fea171408b05.sql =====

-- 1. payment_requests: remove global-admin bypasses; platform admins already covered
DROP POLICY IF EXISTS pr_admin_update ON public.payment_requests;
DROP POLICY IF EXISTS pr_own_select ON public.payment_requests;
CREATE POLICY pr_own_select ON public.payment_requests
  FOR SELECT USING (user_id = auth.uid());

-- 2. subscription_plans: remove global-admin write; platform admin policy remains
DROP POLICY IF EXISTS sp_admin_write ON public.subscription_plans;

-- 3. settings_kv: require settings.write role permission (owner/admin auto-true)
DROP POLICY IF EXISTS skv_write ON public.settings_kv;
CREATE POLICY skv_write ON public.settings_kv
  FOR ALL
  USING (public.has_role_permission(auth.uid(), company_id, 'settings.write'))
  WITH CHECK (public.has_role_permission(auth.uid(), company_id, 'settings.write'));

-- ===== supabase/migrations/20260604065423_31cebb75-1b01-4254-baa9-9dd001477608.sql =====
CREATE TABLE public.saved_audit_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('app','platform')),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_audit_views_app_needs_company
    CHECK (scope <> 'app' OR company_id IS NOT NULL)
);

CREATE INDEX saved_audit_views_owner_idx ON public.saved_audit_views(owner_user_id);
CREATE INDEX saved_audit_views_scope_company_idx ON public.saved_audit_views(scope, company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_audit_views TO authenticated;
GRANT ALL ON public.saved_audit_views TO service_role;

ALTER TABLE public.saved_audit_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_audit_views: owner can read own app view in own company"
  ON public.saved_audit_views FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    AND (
      (scope = 'app' AND company_id IS NOT NULL AND public.has_company_access(auth.uid(), company_id))
      OR (scope = 'platform' AND public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "saved_audit_views: owner can insert own view"
  ON public.saved_audit_views FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      (scope = 'app' AND company_id IS NOT NULL AND public.has_company_access(auth.uid(), company_id))
      OR (scope = 'platform' AND public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "saved_audit_views: owner can update own view"
  ON public.saved_audit_views FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      (scope = 'app' AND company_id IS NOT NULL AND public.has_company_access(auth.uid(), company_id))
      OR (scope = 'platform' AND public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "saved_audit_views: owner can delete own view"
  ON public.saved_audit_views FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE TRIGGER trg_saved_audit_views_updated_at
  BEFORE UPDATE ON public.saved_audit_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- ===== supabase/migrations/20260604071412_61a5ee24-2fd0-4109-b5b1-6667e3dfbc51.sql =====
-- 1. contact_requests: restrict reads to platform admins only
DROP POLICY IF EXISTS cr_admin_read ON public.contact_requests;
CREATE POLICY cr_admin_read ON public.contact_requests
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 2. settings_kv: restrict write policy to authenticated role
DROP POLICY IF EXISTS skv_write ON public.settings_kv;
CREATE POLICY skv_write ON public.settings_kv
  FOR ALL TO authenticated
  USING (public.has_role_permission(auth.uid(), company_id, 'settings.write'))
  WITH CHECK (public.has_role_permission(auth.uid(), company_id, 'settings.write'));

-- 3. platform_admins: replace ALL policy with explicit INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS pa_admin_write ON public.platform_admins;
CREATE POLICY pa_admin_insert ON public.platform_admins
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY pa_admin_update ON public.platform_admins
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY pa_admin_delete ON public.platform_admins
  FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));
-- ===== supabase/migrations/20260604143033_d1f9a6a3-7d86-4bce-b3fa-646368233cb5.sql =====

-- Tighten contact_requests admin update/delete to platform admins only
DROP POLICY IF EXISTS cr_admin_update ON public.contact_requests;
DROP POLICY IF EXISTS cr_admin_delete ON public.contact_requests;

CREATE POLICY cr_admin_update ON public.contact_requests
  FOR UPDATE
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY cr_admin_delete ON public.contact_requests
  FOR DELETE
  USING (public.is_platform_admin(auth.uid()));

-- Tighten payment-screenshots storage SELECT policy to platform admins only
DROP POLICY IF EXISTS payment_screenshots_user_select ON storage.objects;

CREATE POLICY payment_screenshots_user_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'payment-screenshots'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_platform_admin(auth.uid())
    )
  );

-- ===== supabase/migrations/20260604152850_aa48a465-7001-4ba0-a7cf-966a9e9297ef.sql =====
ALTER TABLE public.online_store_settings
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
-- ===== supabase/migrations/20260604153730_2a2fb5f3-e1cd-4ad0-82e9-870d8ad474ba.sql =====
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS sale_invoice_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by uuid;

ALTER TABLE public.online_orders DROP CONSTRAINT IF EXISTS online_orders_status_check;
ALTER TABLE public.online_orders ADD CONSTRAINT online_orders_status_check
  CHECK (status IN ('new','confirmed','shipped','delivered','cancelled','converted'));

CREATE UNIQUE INDEX IF NOT EXISTS online_orders_unique_invoice
  ON public.online_orders(sale_invoice_id) WHERE sale_invoice_id IS NOT NULL;
-- ===== supabase/migrations/20260604161738_f1c5b9c0-b89f-4e8e-a281-46f7a346e397.sql =====
-- Explicitly deny direct client INSERT/UPDATE/DELETE on audit_logs.
-- Writes must go through the log_audit_event() SECURITY DEFINER RPC.
CREATE POLICY "al_no_direct_insert" ON public.audit_logs
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);
CREATE POLICY "al_no_direct_update" ON public.audit_logs
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);
CREATE POLICY "al_no_direct_delete" ON public.audit_logs
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- Explicitly deny direct client INSERT/UPDATE/DELETE on coupon_redemptions.
-- Platform admins retain full access via the existing cr_platform_admin_all policy
-- (RESTRICTIVE policies do not apply to roles outside the TO list).
CREATE POLICY "cr_no_direct_insert" ON public.coupon_redemptions
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);
CREATE POLICY "cr_no_direct_update" ON public.coupon_redemptions
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);
CREATE POLICY "cr_no_direct_delete" ON public.coupon_redemptions
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);
-- ===== supabase/migrations/20260604163055_347ec061-cf34-4ecd-8acc-745353ca8983.sql =====

CREATE TABLE public.online_store_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  visible boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  online_price numeric(14,2),
  online_description text,
  online_image_url text,
  online_category text,
  sort_order int NOT NULL DEFAULT 0,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, item_id)
);

GRANT SELECT ON public.online_store_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_store_items TO authenticated;
GRANT ALL ON public.online_store_items TO service_role;

ALTER TABLE public.online_store_items ENABLE ROW LEVEL SECURITY;

-- Public anonymous read: only visible items belonging to an active store
CREATE POLICY "osi_public_read_visible" ON public.online_store_items
  FOR SELECT TO anon
  USING (
    visible = true
    AND EXISTS (
      SELECT 1 FROM public.online_store_settings s
       WHERE s.company_id = online_store_items.company_id
         AND s.is_active = true
    )
  );

-- Authenticated read: same as public OR company members can see all
CREATE POLICY "osi_auth_read" ON public.online_store_items
  FOR SELECT TO authenticated
  USING (has_company_access(auth.uid(), company_id));

-- Authenticated write: company members with items.write permission
CREATE POLICY "osi_auth_write" ON public.online_store_items
  FOR ALL TO authenticated
  USING (has_company_access(auth.uid(), company_id))
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  );

CREATE INDEX idx_osi_company ON public.online_store_items(company_id);
CREATE INDEX idx_osi_company_visible ON public.online_store_items(company_id, visible);

CREATE TRIGGER trg_osi_updated_at
  BEFORE UPDATE ON public.online_store_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== supabase/migrations/20260604175835_49d6063d-8820-408a-8704-053b0ee2c5a4.sql =====
CREATE POLICY "payment_screenshots_admin_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'payment-screenshots' AND public.is_platform_admin(auth.uid())) WITH CHECK (bucket_id = 'payment-screenshots' AND public.is_platform_admin(auth.uid()));

CREATE POLICY "payment_screenshots_admin_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'payment-screenshots' AND public.is_platform_admin(auth.uid()));
-- ===== supabase/migrations/20260604183556_82dfc018-de15-496b-b52e-0a1d239edfb7.sql =====
-- Add RESTRICTIVE policies on platform_audit_logs to prevent direct writes from any role except service_role.
-- All inserts should flow through log_platform_audit() SECURITY DEFINER function.

CREATE POLICY "pal_block_direct_insert"
ON public.platform_audit_logs
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "pal_block_direct_update"
ON public.platform_audit_logs
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "pal_block_direct_delete"
ON public.platform_audit_logs
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);
-- ===== supabase/migrations/20260605044832_8e9d8a8a-a230-468f-8553-7f1997f79c32.sql =====

-- Add IP allowlist to platform_settings (jsonb array of CIDR strings; empty = allow all)
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS ip_allowlist jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Add MFA required flag to platform_admins (reserved for 2FA pack)
ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false;

-- Function: check if a candidate IP is allowed by current platform_settings.ip_allowlist
-- Returns true when allowlist is empty OR when the candidate IP matches any CIDR in the list.
CREATE OR REPLACE FUNCTION public.is_ip_allowed(_ip text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list jsonb;
  v_entry text;
  v_candidate inet;
BEGIN
  SELECT ip_allowlist INTO v_list
    FROM public.platform_settings
    LIMIT 1;

  IF v_list IS NULL OR jsonb_array_length(v_list) = 0 THEN
    RETURN true;
  END IF;

  IF _ip IS NULL OR _ip = '' THEN
    -- Allowlist is non-empty but no IP could be resolved — deny by default
    RETURN false;
  END IF;

  BEGIN
    v_candidate := _ip::inet;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  FOR v_entry IN SELECT jsonb_array_elements_text(v_list) LOOP
    BEGIN
      IF v_candidate <<= v_entry::inet THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_ip_allowed(text) TO authenticated, service_role;

-- ===== supabase/migrations/20260605052528_8e87412f-9132-4498-80d0-85ad5c283f2c.sql =====
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS sale_order_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS online_orders_unique_sale_order
  ON public.online_orders(sale_order_id) WHERE sale_order_id IS NOT NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE INDEX IF NOT EXISTS idx_sales_source ON public.sales(source_type, source_id)
  WHERE source_type IS NOT NULL;

ALTER TABLE public.online_orders
  DROP CONSTRAINT IF EXISTS online_orders_status_check;
ALTER TABLE public.online_orders
  ADD CONSTRAINT online_orders_status_check
  CHECK (status = ANY (ARRAY[
    'new'::text, 'confirmed'::text, 'shipped'::text, 'delivered'::text,
    'cancelled'::text, 'converted'::text,
    'sale_order_created'::text, 'sale_order_failed'::text
  ]));
-- ===== supabase/migrations/20260605060513_bb77ab28-1ba3-4c17-812a-994e20057b05.sql =====
-- 1. Public-safe view of platform settings (no ip_allowlist, no internal config)
CREATE OR REPLACE VIEW public.platform_public_settings
WITH (security_invoker = true)
AS
SELECT
  id,
  platform_name,
  support_email,
  support_phone,
  support_whatsapp,
  signup_enabled,
  demo_login_enabled,
  maintenance_mode,
  maintenance_message
FROM public.platform_settings;

GRANT SELECT ON public.platform_public_settings TO anon, authenticated;

-- 2. Drop the over-permissive public read policy that exposed ip_allowlist
DROP POLICY IF EXISTS ps_public_read ON public.platform_settings;

-- 3. Keep a narrow read policy for the view's security_invoker check: allow
--    anon/authenticated to SELECT the same safe columns via the view.
--    security_invoker means the view runs with the caller's permissions, so
--    we still need a base-table policy. Restrict it to the safe column set
--    by re-adding a SELECT policy but only used through the view; clients
--    that try to SELECT ip_allowlist or other fields directly will get
--    blocked by application code path (everyone now reads the view).
CREATE POLICY ps_public_read_safe
  ON public.platform_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Note: We can't restrict by column in an RLS policy. The protection comes
-- from clients reading the view (which projects only safe columns) and
-- super-admin operations going through SECURITY DEFINER functions for
-- ip_allowlist (see platform-security.functions.ts).
-- To fully revoke direct column access from anon, revoke column-level
-- privileges on the sensitive columns:
REVOKE SELECT ON public.platform_settings FROM anon;
REVOKE SELECT ON public.platform_settings FROM authenticated;
GRANT SELECT (
  id,
  platform_name,
  support_email,
  support_phone,
  support_whatsapp,
  signup_enabled,
  demo_login_enabled,
  maintenance_mode,
  maintenance_message
) ON public.platform_settings TO anon, authenticated;
-- ===== supabase/migrations/20260605102727_0e2b173b-8a7a-46cb-81a3-b66ecee6b525.sql =====
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS po_no text,
  ADD COLUMN IF NOT EXISTS po_date date,
  ADD COLUMN IF NOT EXISTS billing_name text;
-- ===== supabase/migrations/20260605111055_057d9294-9f42-4770-89e8-54b79a9931e4.sql =====
-- Race-safe duplicate guard: prevent two concurrent invoice saves from getting
-- the same invoice_no within (company_id, doc_type) for active (non-deleted)
-- rows. Partial index so soft-deleted rows are excluded (matches app behavior).
CREATE UNIQUE INDEX IF NOT EXISTS sales_company_doc_invoice_no_active_uidx
  ON public.sales (company_id, doc_type, invoice_no)
  WHERE deleted_at IS NULL;
-- ===== supabase/migrations/20260605114609_bdaecc15-6894-4873-85c5-887bf00a0a3d.sql =====
-- Replace the over-permissive read policy on platform_announcements so that
-- audience targeting is actually enforced at the RLS layer. Untargeted
-- announcements stay public to authenticated users; targeted ones are scoped
-- to users with company access or matching plan.

DROP POLICY IF EXISTS pa_user_select_active ON public.platform_announcements;

CREATE POLICY pa_user_select_active
  ON public.platform_announcements
  FOR SELECT
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      is_active = true
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at >= now())
      AND (
        target_company_id IS NULL
        OR public.has_company_access(auth.uid(), target_company_id)
      )
      AND (
        target_plan IS NULL
        OR EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.owner_id = auth.uid()
            AND s.plan = platform_announcements.target_plan
            AND s.status IN ('trial', 'active')
            AND s.expires_at > now()
        )
      )
    )
  );
-- ===== supabase/migrations/20260605121742_f90451f7-688b-47d4-94fc-98e97afccec5.sql =====

-- 1) Table
CREATE TABLE public.document_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('sale_invoice','purchase_bill')),
  document_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size >= 0),
  storage_path text NOT NULL UNIQUE,
  attachment_kind text NOT NULL CHECK (attachment_kind IN ('image','document')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_doc_attach_doc ON public.document_attachments(company_id, document_type, document_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_attach_company ON public.document_attachments(company_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_attachments TO authenticated;
GRANT ALL ON public.document_attachments TO service_role;

ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;

-- SELECT: any company member can read
CREATE POLICY da_select ON public.document_attachments
  FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

-- INSERT: must be company member with right perm for the document type
CREATE POLICY da_insert ON public.document_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND (
      (document_type = 'sale_invoice'  AND public.has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR
      (document_type = 'purchase_bill' AND public.has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  );

-- UPDATE (used for soft-delete): same perm rules
CREATE POLICY da_update ON public.document_attachments
  FOR UPDATE TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND (
      (document_type = 'sale_invoice'  AND public.has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR
      (document_type = 'purchase_bill' AND public.has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  )
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

-- DELETE (hard delete fallback): same perm rules
CREATE POLICY da_delete ON public.document_attachments
  FOR DELETE TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND (
      (document_type = 'sale_invoice'  AND public.has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR
      (document_type = 'purchase_bill' AND public.has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  );

CREATE TRIGGER trg_doc_attachments_updated_at
  BEFORE UPDATE ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Storage RLS for the private `document-attachments` bucket.
-- Path convention: {company_id}/{document_type}/{document_id}/{uuid}.{ext}
-- The first folder is the company_id, so we gate on (storage.foldername(name))[1].

CREATE POLICY "doc-attach read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'document-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "doc-attach insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'document-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    ((storage.foldername(name))[2]) = 'sale_invoice'
      AND public.has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'sales.edit')
    OR
    ((storage.foldername(name))[2]) = 'purchase_bill'
      AND public.has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'purchase.edit')
  )
);

CREATE POLICY "doc-attach delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'document-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    ((storage.foldername(name))[2]) = 'sale_invoice'
      AND public.has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'sales.edit')
    OR
    ((storage.foldername(name))[2]) = 'purchase_bill'
      AND public.has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'purchase.edit')
  )
);

-- ===== supabase/migrations/20260605124636_71a0a417-cb89-451a-8d3a-a030f6eae5c0.sql =====
-- Restrict public platform_settings read to a safe-columns view
DROP POLICY IF EXISTS ps_public_read_safe ON public.platform_settings;

CREATE OR REPLACE VIEW public.platform_settings_public
WITH (security_invoker = false) AS
SELECT
  id,
  platform_name,
  platform_logo_url,
  support_email,
  support_phone,
  support_whatsapp,
  terms_url,
  privacy_url,
  default_currency,
  maintenance_mode,
  maintenance_message,
  signup_enabled,
  demo_login_enabled
FROM public.platform_settings
LIMIT 1;

GRANT SELECT ON public.platform_settings_public TO anon, authenticated;

-- Align WITH CHECK on document_attachments UPDATE to match USING
DROP POLICY IF EXISTS da_update ON public.document_attachments;
CREATE POLICY da_update ON public.document_attachments
FOR UPDATE
USING (
  has_company_access(auth.uid(), company_id) AND (
    (document_type = 'sale_invoice' AND has_role_permission(auth.uid(), company_id, 'sales.edit'))
    OR (document_type = 'purchase_bill' AND has_role_permission(auth.uid(), company_id, 'purchase.edit'))
  )
)
WITH CHECK (
  has_company_access(auth.uid(), company_id) AND (
    (document_type = 'sale_invoice' AND has_role_permission(auth.uid(), company_id, 'sales.edit'))
    OR (document_type = 'purchase_bill' AND has_role_permission(auth.uid(), company_id, 'purchase.edit'))
  )
);
-- ===== supabase/migrations/20260605124715_b6b2f60c-d340-4400-88a4-b213d914681d.sql =====
-- Remove the definer view; replace with column-level grants on base table
DROP VIEW IF EXISTS public.platform_settings_public;

-- Restore a public SELECT policy on the base table (RLS row-level only; columns are gated by GRANTs below)
DROP POLICY IF EXISTS ps_public_read_safe ON public.platform_settings;
CREATE POLICY ps_public_read_safe ON public.platform_settings
FOR SELECT
USING (true);

-- Revoke all table-level SELECT from public roles, then grant only safe columns
REVOKE SELECT ON public.platform_settings FROM anon, authenticated;

GRANT SELECT (
  id,
  platform_name,
  platform_logo_url,
  support_email,
  support_phone,
  support_whatsapp,
  terms_url,
  privacy_url,
  default_currency,
  maintenance_mode,
  maintenance_message,
  signup_enabled,
  demo_login_enabled
) ON public.platform_settings TO anon, authenticated;

-- Platform admins (and service role) retain full access via existing ALL policy / service_role grants
GRANT ALL ON public.platform_settings TO service_role;
-- ===== supabase/migrations/20260605124755_40eb0198-da25-4987-a076-4fe873162ba8.sql =====
CREATE OR REPLACE FUNCTION public.get_platform_settings_admin()
RETURNS SETOF public.platform_settings
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.platform_settings LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_settings_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_settings_admin() TO authenticated, service_role;
-- ===== supabase/migrations/20260605143201_c1a9d487-3c51-440a-9eb7-18fe711ec27e.sql =====
-- 1) platform_settings: hide ip_allowlist from anon/authenticated via column-level grants.
REVOKE SELECT ON public.platform_settings FROM anon, authenticated;
GRANT SELECT (
  id, platform_name, platform_logo_url, support_email, support_phone, support_whatsapp,
  terms_url, privacy_url, default_currency, default_timezone, default_trial_days,
  default_invoice_prefix, default_receipt_prefix, maintenance_mode, maintenance_message,
  signup_enabled, demo_login_enabled, is_singleton, updated_by, created_at, updated_at
) ON public.platform_settings TO anon, authenticated;

-- 2) payment_settings: add RESTRICTIVE deny so any future permissive policy still requires platform admin.
DROP POLICY IF EXISTS ps_restrict_non_admin_select ON public.payment_settings;
CREATE POLICY ps_restrict_non_admin_select
  ON public.payment_settings
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (public.is_platform_admin(auth.uid()));

-- 3) document_attachments: tighten UPDATE — authenticated only + uploader ownership.
DROP POLICY IF EXISTS da_update ON public.document_attachments;
CREATE POLICY da_update
  ON public.document_attachments
  FOR UPDATE
  TO authenticated
  USING (
    has_company_access(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND (
      (document_type = 'sale_invoice'    AND has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR (document_type = 'purchase_bill' AND has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  )
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND (
      (document_type = 'sale_invoice'    AND has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR (document_type = 'purchase_bill' AND has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  );
-- ===== supabase/migrations/20260605152315_ae2e1f6b-89f5-45d9-80ff-743aead6ecc7.sql =====
-- 1) Remove permissive public-read policy on platform_settings.
DROP POLICY IF EXISTS ps_public_read_safe ON public.platform_settings;

-- Ensure platform admins can still read (covered by ps_admin_write FOR ALL, but add explicit SELECT for clarity).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'ps_admin_read' AND polrelid = 'public.platform_settings'::regclass
  ) THEN
    CREATE POLICY ps_admin_read ON public.platform_settings
      FOR SELECT TO authenticated
      USING (public.is_platform_admin(auth.uid()));
  END IF;
END$$;

-- 2) Restrict document_attachments DELETE to the original uploader.
DROP POLICY IF EXISTS da_delete ON public.document_attachments;
CREATE POLICY da_delete ON public.document_attachments
  FOR DELETE TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND (
      (document_type = 'sale_invoice'  AND public.has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR (document_type = 'purchase_bill' AND public.has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  );
-- ===== supabase/migrations/20260605161022_9b84dbeb-54af-49fa-91e8-e6145e209ff6.sql =====
CREATE POLICY "doc-attach update" ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'document-attachments'
  AND has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    ((storage.foldername(name))[2] = 'sale_invoice' AND has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'sales.edit'))
    OR ((storage.foldername(name))[2] = 'purchase_bill' AND has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'purchase.edit'))
  )
)
WITH CHECK (
  bucket_id = 'document-attachments'
  AND has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    ((storage.foldername(name))[2] = 'sale_invoice' AND has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'sales.edit'))
    OR ((storage.foldername(name))[2] = 'purchase_bill' AND has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'purchase.edit'))
  )
);
-- ===== supabase/migrations/20260606124339_937bc2b6-a601-4a50-96e6-50069e528cb6.sql =====
-- Ensure unique SKU per company for active items
CREATE UNIQUE INDEX IF NOT EXISTS items_company_sku_active_idx ON public.items (company_id, sku) WHERE (deleted_at IS NULL AND sku IS NOT NULL);

-- Create manufacturing recipe tables
CREATE TABLE IF NOT EXISTS public.item_manufacturing_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES auth.users,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    additional_cost NUMERIC(20, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(item_id)
);

CREATE TABLE IF NOT EXISTS public.item_manufacturing_recipe_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES public.item_manufacturing_recipes(id) ON DELETE CASCADE,
    material_item_id UUID NOT NULL REFERENCES public.items(id),
    qty NUMERIC(20, 4) NOT NULL DEFAULT 1,
    unit TEXT,
    purchase_price_at_time NUMERIC(20, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS
ALTER TABLE public.item_manufacturing_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_manufacturing_recipe_lines ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_manufacturing_recipes TO authenticated;
GRANT ALL ON public.item_manufacturing_recipes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_manufacturing_recipe_lines TO authenticated;
GRANT ALL ON public.item_manufacturing_recipe_lines TO service_role;

-- Policies
CREATE POLICY "Users can manage their own recipes" ON public.item_manufacturing_recipes
    FOR ALL USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

CREATE POLICY "Users can manage their own recipe lines" ON public.item_manufacturing_recipe_lines
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.item_manufacturing_recipes r
        WHERE r.id = recipe_id AND r.company_id = auth.uid()
    )) WITH CHECK (EXISTS (
        SELECT 1 FROM public.item_manufacturing_recipes r
        WHERE r.id = recipe_id AND r.company_id = auth.uid()
    ));

-- Update trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_item_manufacturing_recipes_updated_at
    BEFORE UPDATE ON public.item_manufacturing_recipes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== supabase/migrations/20260606130237_83ef56d0-0c9a-42d7-925a-91e3e75edc63.sql =====
-- Update unique SKU index to be case-insensitive
DROP INDEX IF EXISTS public.items_company_sku_active_idx;
CREATE UNIQUE INDEX items_company_sku_active_idx ON public.items (company_id, LOWER(sku)) WHERE (deleted_at IS NULL AND sku IS NOT NULL);

-- ===== supabase/migrations/20260606131929_75dd8736-c388-4a12-a056-7f91304b5664.sql =====

-- Fix 1: Broken RLS on manufacturing recipe tables (wrong uid vs company_id comparison)
DROP POLICY IF EXISTS "Users can manage their own recipes" ON public.item_manufacturing_recipes;
DROP POLICY IF EXISTS "Users can manage their own recipe lines" ON public.item_manufacturing_recipe_lines;

CREATE POLICY "Company members can manage recipes"
  ON public.item_manufacturing_recipes
  FOR ALL
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Company members can manage recipe lines"
  ON public.item_manufacturing_recipe_lines
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND public.has_company_access(auth.uid(), r.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND public.has_company_access(auth.uid(), r.company_id)
  ));

-- Fix 2: Restrict recycle_bin SELECT to owners/admins (snapshots may contain sensitive payroll/financial data)
DROP POLICY IF EXISTS "rb_select" ON public.recycle_bin;
CREATE POLICY "rb_select"
  ON public.recycle_bin
  FOR SELECT
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner'::public.app_role)
    OR public.has_company_role(auth.uid(), company_id, 'admin'::public.app_role)
  );

-- Fix 3: Set immutable search_path on update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- ===== supabase/migrations/20260606155349_7548a3b0-418f-4d9b-9dc9-ae47c4bdc462.sql =====
-- The company-logos bucket is public. Add an anon SELECT policy so the
-- storage.objects layer does not contradict the bucket's public flag.
CREATE POLICY "company_logos_public_select_anon"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'company-logos');
-- ===== supabase/migrations/20260606170959_c1f8d794-acaf-4da6-8b92-ddebc35c37b9.sql =====

-- Public storefront needs anon read for item-images bucket (mirrors company_logos policy)
CREATE POLICY "item_images_public_select_anon"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'item-images');

-- Public SECURITY DEFINER function exposing only non-sensitive platform settings.
CREATE OR REPLACE FUNCTION public.get_public_platform_settings()
RETURNS TABLE (
  platform_name text,
  maintenance_mode boolean,
  maintenance_message text,
  signup_enabled boolean,
  demo_login_enabled boolean,
  support_email text,
  support_phone text,
  support_whatsapp text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    platform_name,
    maintenance_mode,
    maintenance_message,
    signup_enabled,
    demo_login_enabled,
    support_email,
    support_phone,
    support_whatsapp
  FROM public.platform_settings
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_platform_settings() TO anon, authenticated;

-- ===== supabase/migrations/20260606180623_173b2a8a-9e2a-47a1-9486-0aa178b657d3.sql =====
DROP POLICY IF EXISTS "Company members can manage recipes" ON public.item_manufacturing_recipes;
CREATE POLICY "Company members can manage recipes" ON public.item_manufacturing_recipes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_company_access(auth.uid(), company_id))
  WITH CHECK (has_company_access(auth.uid(), company_id));

DROP POLICY IF EXISTS "Company members can manage recipe lines" ON public.item_manufacturing_recipe_lines;
CREATE POLICY "Company members can manage recipe lines" ON public.item_manufacturing_recipe_lines
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.item_manufacturing_recipes r WHERE r.id = item_manufacturing_recipe_lines.recipe_id AND has_company_access(auth.uid(), r.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.item_manufacturing_recipes r WHERE r.id = item_manufacturing_recipe_lines.recipe_id AND has_company_access(auth.uid(), r.company_id)));
-- ===== supabase/migrations/20260606182334_907ba371-19eb-4519-91fe-c8390ef884cd.sql =====

-- Require items.write permission to create/update/delete manufacturing recipes
DROP POLICY IF EXISTS "Company members can manage recipes" ON public.item_manufacturing_recipes;

CREATE POLICY "Recipes read by company members"
  ON public.item_manufacturing_recipes
  FOR SELECT
  TO authenticated
  USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "Recipes write requires items.write"
  ON public.item_manufacturing_recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  );

CREATE POLICY "Recipes update requires items.write"
  ON public.item_manufacturing_recipes
  FOR UPDATE
  TO authenticated
  USING (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  )
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  );

CREATE POLICY "Recipes delete requires items.write"
  ON public.item_manufacturing_recipes
  FOR DELETE
  TO authenticated
  USING (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'items.write')
  );

-- Same for recipe lines
DROP POLICY IF EXISTS "Company members can manage recipe lines" ON public.item_manufacturing_recipe_lines;

CREATE POLICY "Recipe lines read by company members"
  ON public.item_manufacturing_recipe_lines
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
  ));

CREATE POLICY "Recipe lines insert requires items.write"
  ON public.item_manufacturing_recipe_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
      AND has_role_permission(auth.uid(), r.company_id, 'items.write')
  ));

CREATE POLICY "Recipe lines update requires items.write"
  ON public.item_manufacturing_recipe_lines
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
      AND has_role_permission(auth.uid(), r.company_id, 'items.write')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
      AND has_role_permission(auth.uid(), r.company_id, 'items.write')
  ));

CREATE POLICY "Recipe lines delete requires items.write"
  ON public.item_manufacturing_recipe_lines
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_manufacturing_recipes r
    WHERE r.id = item_manufacturing_recipe_lines.recipe_id
      AND has_company_access(auth.uid(), r.company_id)
      AND has_role_permission(auth.uid(), r.company_id, 'items.write')
  ));

-- ===== supabase/migrations/20260607023605_1b20219e-7ac5-41d4-8e6e-13d8bd58223e.sql =====
-- Add explicit RESTRICTIVE policy on platform_settings to make non-admin read blocking unambiguous
CREATE POLICY "ps_restrict_non_admin_select"
ON public.platform_settings
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (public.is_platform_admin(auth.uid()));
-- ===== supabase/migrations/20260607031538_97d648c5-6c9f-4afb-a313-26d12c7344a1.sql =====

DROP POLICY IF EXISTS "oo_public_insert" ON public.online_orders;

CREATE POLICY "oo_public_insert" ON public.online_orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.online_store_settings s
       WHERE s.company_id = online_orders.company_id AND s.is_active = true
    )
    AND status = 'new'
    AND sale_invoice_id IS NULL
    AND sale_order_id IS NULL
    AND converted_at IS NULL
    AND converted_by IS NULL
    AND char_length(customer_name) BETWEEN 1 AND 120
    AND char_length(customer_phone) BETWEEN 3 AND 32
    AND (customer_address IS NULL OR char_length(customer_address) <= 500)
    AND (notes IS NULL OR char_length(notes) <= 1000)
    AND char_length(order_no) BETWEEN 1 AND 64
    AND jsonb_typeof(items) = 'array'
    AND jsonb_array_length(items) BETWEEN 1 AND 200
    AND subtotal >= 0 AND subtotal <= 100000000
    AND delivery_charge >= 0 AND delivery_charge <= 1000000
    AND total >= 0 AND total <= 100000000
  );

-- ===== supabase/migrations/20260607035152_479c421b-2f79-4aa1-b2ee-800432f5c49e.sql =====
-- Create Other Income Categories table
CREATE TABLE public.other_income_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, name)
);

-- Create Other Incomes table
CREATE TABLE public.other_incomes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.other_income_categories(id) ON DELETE SET NULL,
    amount NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (amount > 0),
    income_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_no TEXT,
    party_source TEXT,
    bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    payment_method TEXT, -- cash, bank, etc.
    notes TEXT,
    attachment_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.other_income_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_incomes ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_income_categories TO authenticated;
GRANT ALL ON public.other_income_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_incomes TO authenticated;
GRANT ALL ON public.other_incomes TO service_role;

-- RLS Policies
CREATE POLICY "Users can manage their company's other income categories" 
ON public.other_income_categories 
FOR ALL 
USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage their company's other incomes" 
ON public.other_incomes 
FOR ALL 
USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- Updated At Triggers
CREATE TRIGGER update_other_income_categories_updated_at BEFORE UPDATE ON public.other_income_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_other_incomes_updated_at BEFORE UPDATE ON public.other_incomes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Optional: Initial categories for new companies could be added via a trigger, 
-- but for now we'll let users create them as per Vyapar's flow.

-- ===== supabase/migrations/20260607041352_e95721d7-88ca-4bde-b703-ee6cd2f1ed29.sql =====
-- 1. Tighten other_income policies to authenticated role
DROP POLICY IF EXISTS "Users can manage their company's other income categories" ON public.other_income_categories;
DROP POLICY IF EXISTS "Users can manage their company's other incomes" ON public.other_incomes;

CREATE POLICY "Users can manage their company's other income categories"
ON public.other_income_categories
FOR ALL
TO authenticated
USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage their company's other incomes"
ON public.other_incomes
FOR ALL
TO authenticated
USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 2. Harden anonymous contact_requests insert with length/format checks
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='contact_requests' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.contact_requests', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Anyone can submit valid contact requests"
ON public.contact_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(name) BETWEEN 1 AND 120
  AND char_length(email) BETWEEN 3 AND 255
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND (phone IS NULL OR char_length(phone) BETWEEN 3 AND 32)
  AND (business_name IS NULL OR char_length(business_name) <= 200)
  AND (message IS NULL OR char_length(message) <= 2000)
  AND char_length(preferred_contact) <= 32
  AND char_length(request_type) <= 64
  AND status = 'new'
);

-- ===== supabase/migrations/20260607042529_b8cc7908-5c37-4a26-b853-e92088d7762d.sql =====
-- Update online_orders status constraint
ALTER TABLE public.online_orders DROP CONSTRAINT IF EXISTS online_orders_status_check;
ALTER TABLE public.online_orders ADD CONSTRAINT online_orders_status_check
CHECK (status = ANY (ARRAY[
  'pending'::text, 'confirmed'::text, 'packed'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'returned'::text,
  'converted'::text, 'sale_order_created'::text, 'sale_order_failed'::text
]));

-- Create status logs table
CREATE TABLE public.online_order_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Permissions
GRANT SELECT, INSERT ON public.online_order_status_logs TO authenticated;
GRANT ALL ON public.online_order_status_logs TO service_role;

-- RLS
ALTER TABLE public.online_order_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs for their company" ON public.online_order_status_logs
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert logs for their company" ON public.online_order_status_logs
    FOR INSERT TO authenticated
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- Create index for performance
CREATE INDEX idx_online_order_status_logs_order_id ON public.online_order_status_logs(order_id);
CREATE INDEX idx_online_order_status_logs_company_id ON public.online_order_status_logs(company_id);
-- ===== supabase/migrations/20260607043626_2bb50200-f49d-4979-a8fc-9932c9482a94.sql =====
-- 1. Create couriers table
CREATE TABLE IF NOT EXISTS public.couriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    website_url TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Add columns to online_orders
ALTER TABLE public.online_orders 
ADD COLUMN IF NOT EXISTS courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tracking_id TEXT,
ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS cod_amount NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'not_assigned',
ADD COLUMN IF NOT EXISTS delivery_note TEXT,
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- 3. Add delivery_status constraint
ALTER TABLE public.online_orders DROP CONSTRAINT IF EXISTS online_orders_delivery_status_check;
ALTER TABLE public.online_orders ADD CONSTRAINT online_orders_delivery_status_check 
CHECK (delivery_status = ANY (ARRAY['not_assigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned']));

-- 4. Permissions for couriers
GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;

-- 5. RLS for couriers
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view couriers for their company" ON public.couriers
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage couriers for their company" ON public.couriers
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 6. Trigger for updated_at on couriers
CREATE TRIGGER trg_couriers_updated BEFORE UPDATE ON public.couriers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Indices
CREATE INDEX IF NOT EXISTS idx_couriers_company_id ON public.couriers(company_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_courier_id ON public.online_orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_delivery_status ON public.online_orders(delivery_status);

-- 8. Helper function to seed default couriers for a company
CREATE OR REPLACE FUNCTION public.seed_default_couriers(target_company_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO public.couriers (company_id, name)
    VALUES 
        (target_company_id, 'Pathao'),
        (target_company_id, 'Steadfast'),
        (target_company_id, 'RedX'),
        (target_company_id, 'Paperfly'),
        (target_company_id, 'Sundarban')
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== supabase/migrations/20260607045001_41d9fff6-58ca-49eb-b7d3-d2dc54653b17.sql =====
-- 1. Create cod_settlements table
CREATE TABLE IF NOT EXISTS public.cod_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
    courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
    cod_amount NUMERIC NOT NULL DEFAULT 0,
    courier_charge NUMERIC NOT NULL DEFAULT 0,
    receivable_amount NUMERIC NOT NULL DEFAULT 0, -- cod_amount - courier_charge
    received_amount NUMERIC NOT NULL DEFAULT 0,
    pending_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, partial, settled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(order_id)
);

-- 2. Create cod_receipts table
CREATE TABLE IF NOT EXISTS public.cod_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settlement_id UUID NOT NULL REFERENCES public.cod_settlements(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    received_at DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_no TEXT,
    notes TEXT,
    transaction_id UUID, -- Link to cash_transactions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Add courier_charge to online_orders if not exists
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS courier_charge NUMERIC NOT NULL DEFAULT 0;

-- 4. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cod_settlements TO authenticated;
GRANT ALL ON public.cod_settlements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cod_receipts TO authenticated;
GRANT ALL ON public.cod_receipts TO service_role;

-- 5. RLS
ALTER TABLE public.cod_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cod_settlements for their company" ON public.cod_settlements
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage cod_settlements for their company" ON public.cod_settlements
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can view cod_receipts for their company" ON public.cod_receipts
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage cod_receipts for their company" ON public.cod_receipts
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 6. Triggers
CREATE TRIGGER trg_cod_settlements_updated BEFORE UPDATE ON public.cod_settlements
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cod_receipts_updated BEFORE UPDATE ON public.cod_receipts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Indices
CREATE INDEX IF NOT EXISTS idx_cod_settlements_company_id ON public.cod_settlements(company_id);
CREATE INDEX IF NOT EXISTS idx_cod_settlements_courier_id ON public.cod_settlements(courier_id);
CREATE INDEX IF NOT EXISTS idx_cod_settlements_status ON public.cod_settlements(status);
CREATE INDEX IF NOT EXISTS idx_cod_receipts_company_id ON public.cod_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_cod_receipts_settlement_id ON public.cod_receipts(settlement_id);
-- ===== supabase/migrations/20260607045740_e9b0c608-6771-4005-845c-1ee26ab14271.sql =====
-- 1. Create return_exchange table
CREATE TABLE IF NOT EXISTS public.return_exchange (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL, -- Original sale invoice if exists
    order_id UUID REFERENCES public.online_orders(id) ON DELETE SET NULL, -- Original online order if exists
    customer_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    type TEXT NOT NULL CHECK (type IN ('return', 'exchange')),
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    qty NUMERIC NOT NULL DEFAULT 1,
    reason TEXT NOT NULL,
    restock_option TEXT NOT NULL CHECK (restock_option IN ('restock', 'damaged', 'none')),
    refund_amount NUMERIC NOT NULL DEFAULT 0,
    refund_status TEXT NOT NULL DEFAULT 'pending' CHECK (refund_status IN ('pending', 'paid', 'cancelled', 'n/a')),
    refund_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    delivery_charge NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    transaction_id UUID, -- Link to cash_transactions for refund
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Create replacement_items table (for exchanges)
CREATE TABLE IF NOT EXISTS public.replacement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    return_id UUID NOT NULL REFERENCES public.return_exchange(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    qty NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Add damaged_stock to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS damaged_stock NUMERIC NOT NULL DEFAULT 0;

-- 4. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_exchange TO authenticated;
GRANT ALL ON public.return_exchange TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replacement_items TO authenticated;
GRANT ALL ON public.replacement_items TO service_role;

-- 5. RLS
ALTER TABLE public.return_exchange ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view return_exchange for their company" ON public.return_exchange
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage return_exchange for their company" ON public.return_exchange
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can view replacement_items for their company" ON public.replacement_items
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage replacement_items for their company" ON public.replacement_items
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 6. Triggers
CREATE TRIGGER trg_return_exchange_updated BEFORE UPDATE ON public.return_exchange
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Indices
CREATE INDEX IF NOT EXISTS idx_return_exchange_company_id ON public.return_exchange(company_id);
CREATE INDEX IF NOT EXISTS idx_return_exchange_sale_id ON public.return_exchange(sale_id);
CREATE INDEX IF NOT EXISTS idx_return_exchange_order_id ON public.return_exchange(order_id);
CREATE INDEX IF NOT EXISTS idx_replacement_items_return_id ON public.replacement_items(return_id);
-- ===== supabase/migrations/20260607050507_6130e298-177b-4cf2-b18a-7fc8fca8aad1.sql =====
-- 1. Create item_variants table
CREATE TABLE IF NOT EXISTS public.item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    color TEXT,
    size TEXT,
    model TEXT,
    sale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    wholesale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    mrp NUMERIC(14,2) NOT NULL DEFAULT 0,
    stock NUMERIC(14,3) NOT NULL DEFAULT 0,
    low_stock_alert NUMERIC(14,3),
    unit TEXT NOT NULL DEFAULT 'PCS',
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(company_id, sku)
);

-- 2. Add variant_id columns to existing tables
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;
ALTER TABLE public.return_exchange ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;
ALTER TABLE public.replacement_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL;

-- 3. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_variants TO authenticated;
GRANT ALL ON public.item_variants TO service_role;

-- 4. RLS
ALTER TABLE public.item_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_variants_member_all" ON public.item_variants
    FOR ALL TO authenticated
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- 5. Trigger for updated_at
CREATE TRIGGER t_item_variants_updated BEFORE UPDATE ON public.item_variants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Indices
CREATE INDEX IF NOT EXISTS idx_item_variants_item ON public.item_variants(item_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_company ON public.item_variants(company_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_sku ON public.item_variants(sku);
-- ===== supabase/migrations/20260607051726_3cb0cab5-3012-403a-980b-8cc7fe464040.sql =====
-- Marketing Campaigns
CREATE TABLE public.marketing_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL, -- Facebook, Google, TikTok, Instagram, YouTube, Marketplace, Other
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  budget DECIMAL(15,2),
  status TEXT NOT NULL DEFAULT 'active', -- active, paused, completed
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company marketing campaigns" ON public.marketing_campaigns
  FOR ALL USING (company_id IN (SELECT id FROM public.companies))
  WITH CHECK (company_id IN (SELECT id FROM public.companies));

-- Marketing Costs (Ad Cost Entries)
CREATE TABLE public.marketing_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  payment_method TEXT, -- cash, bank, etc.
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  posted_txn_id UUID REFERENCES public.cash_transactions(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  item_variant_id UUID REFERENCES public.item_variants(id) ON DELETE SET NULL,
  online_order_id UUID REFERENCES public.online_orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  notes TEXT,
  attachment_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_costs TO authenticated;
GRANT ALL ON public.marketing_costs TO service_role;
ALTER TABLE public.marketing_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company marketing costs" ON public.marketing_costs
  FOR ALL USING (company_id IN (SELECT id FROM public.companies))
  WITH CHECK (company_id IN (SELECT id FROM public.companies));

-- Audit Triggers
CREATE TRIGGER update_marketing_campaigns_updated_at BEFORE UPDATE ON public.marketing_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_costs_updated_at BEFORE UPDATE ON public.marketing_costs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit Events
CREATE OR REPLACE FUNCTION public.log_marketing_campaign_change() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, event_type, table_name, record_id, old_data, new_data)
  VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'marketing_campaign.created'
      WHEN TG_OP = 'UPDATE' THEN 'marketing_campaign.updated'
      ELSE 'marketing_campaign.deleted'
    END,
    'marketing_campaigns',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_marketing_campaign_changes AFTER INSERT OR UPDATE OR DELETE ON public.marketing_campaigns FOR EACH ROW EXECUTE FUNCTION public.log_marketing_campaign_change();

CREATE OR REPLACE FUNCTION public.log_marketing_cost_change() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, event_type, table_name, record_id, old_data, new_data)
  VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'marketing_cost.created'
      WHEN TG_OP = 'UPDATE' THEN 'marketing_cost.updated'
      ELSE 'marketing_cost.deleted'
    END,
    'marketing_costs',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_marketing_cost_changes AFTER INSERT OR UPDATE OR DELETE ON public.marketing_costs FOR EACH ROW EXECUTE FUNCTION public.log_marketing_cost_change();

-- ===== supabase/migrations/20260607053503_f7e50e5a-d7a4-4eea-8b8a-3b09e69e6bb5.sql =====
-- Fix marketing_campaigns RLS
DROP POLICY IF EXISTS "Users can manage their own company marketing campaigns" ON public.marketing_campaigns;

CREATE POLICY "mc_select" ON public.marketing_campaigns FOR SELECT
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "mc_write" ON public.marketing_campaigns FOR ALL
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
  );

-- Fix marketing_costs RLS
DROP POLICY IF EXISTS "Users can manage their own company marketing costs" ON public.marketing_costs;

CREATE POLICY "mcost_select" ON public.marketing_costs FOR SELECT
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "mcost_write" ON public.marketing_costs FOR ALL
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'expenses.write')
  );

-- Fix item_variants: add write permission check
DROP POLICY IF EXISTS "Users can manage item_variants for their company" ON public.item_variants;
DROP POLICY IF EXISTS "Company members can manage item variants" ON public.item_variants;

CREATE POLICY "iv_select" ON public.item_variants FOR SELECT
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "iv_write" ON public.item_variants FOR ALL
  TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND public.has_role_permission(auth.uid(), company_id, 'items.write')
  );

-- Fix mutable search_path on audit trigger functions
CREATE OR REPLACE FUNCTION public.log_marketing_campaign_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, event_type, table_name, record_id, old_data, new_data)
  VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'marketing_campaign.created'
      WHEN TG_OP = 'UPDATE' THEN 'marketing_campaign.updated'
      ELSE 'marketing_campaign.deleted'
    END,
    'marketing_campaigns',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_marketing_cost_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, event_type, table_name, record_id, old_data, new_data)
  VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'marketing_cost.created'
      WHEN TG_OP = 'UPDATE' THEN 'marketing_cost.updated'
      ELSE 'marketing_cost.deleted'
    END,
    'marketing_costs',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NEW;
END;
$function$;

-- ===== supabase/migrations/20260607182229_0359a61a-564b-4232-b095-09fff6bb904f.sql =====

DROP POLICY IF EXISTS "item_variants_member_all" ON public.item_variants;

DROP POLICY IF EXISTS "Users can insert logs for their company" ON public.online_order_status_logs;
CREATE POLICY "Users can insert logs for their company"
  ON public.online_order_status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND has_role_permission(auth.uid(), company_id, 'sales.write')
  );

CREATE OR REPLACE FUNCTION public.seed_default_couriers(target_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.couriers (company_id, name)
    VALUES 
        (target_company_id, 'Pathao'),
        (target_company_id, 'Steadfast'),
        (target_company_id, 'RedX'),
        (target_company_id, 'Paperfly'),
        (target_company_id, 'Sundarban')
    ON CONFLICT DO NOTHING;
END;
$function$;

-- ===== supabase/migrations/20260617000000_factory_payroll.sql =====
-- PENDING MIGRATION — apply this SQL via the Supabase migration tool when available,
-- or copy into supabase/migrations/ with a fresh timestamp prefix.
-- Adds Factory Employee Payroll & Production Labour tables.

-- 1) Employees: add wage_type, daily_wage, overtime_rate, payment_method
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS wage_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS daily_wage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE public.employees
  SET wage_type = CASE
    WHEN pay_type = 'daily' THEN 'daily'
    WHEN pay_type = 'contract' THEN 'contract'
    ELSE 'monthly'
  END
  WHERE wage_type = 'monthly';

DO $$ BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_wage_type_chk
    CHECK (wage_type IN ('monthly', 'daily', 'contract'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Labour rates: product × work_type × rate, with optional worker override
CREATE TABLE IF NOT EXISTS public.labour_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  work_type text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  unit text DEFAULT 'pcs',
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labour_rates TO authenticated;
GRANT ALL ON public.labour_rates TO service_role;
ALTER TABLE public.labour_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labour_rates_member_all ON public.labour_rates;
CREATE POLICY labour_rates_member_all ON public.labour_rates FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE INDEX IF NOT EXISTS labour_rates_lookup_idx
  ON public.labour_rates (company_id, item_id, work_type, effective_date DESC);

-- 3) Contract work entries
CREATE TABLE IF NOT EXISTS public.contract_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  work_type text NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  production_ref text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_work_status_chk CHECK (status IN ('unpaid', 'partial', 'paid'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_work_entries TO authenticated;
GRANT ALL ON public.contract_work_entries TO service_role;
ALTER TABLE public.contract_work_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_work_member_all ON public.contract_work_entries;
CREATE POLICY contract_work_member_all ON public.contract_work_entries FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE INDEX IF NOT EXISTS contract_work_emp_idx
  ON public.contract_work_entries (company_id, employee_id, status);

-- 4) Contract payments + allocations
CREATE TABLE IF NOT EXISTS public.contract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  posted_txn_id uuid,
  notes text,
  status text NOT NULL DEFAULT 'posted',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO authenticated;
GRANT ALL ON public.contract_payments TO service_role;
ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_payments_member_all ON public.contract_payments;
CREATE POLICY contract_payments_member_all ON public.contract_payments FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.contract_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.contract_payments(id) ON DELETE CASCADE,
  work_entry_id uuid NOT NULL REFERENCES public.contract_work_entries(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payment_allocations TO authenticated;
GRANT ALL ON public.contract_payment_allocations TO service_role;
ALTER TABLE public.contract_payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_alloc_member_all ON public.contract_payment_allocations;
CREATE POLICY contract_alloc_member_all ON public.contract_payment_allocations FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contract_payments p
    WHERE p.id = payment_id AND public.is_company_member(p.company_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contract_payments p
    WHERE p.id = payment_id AND public.is_company_member(p.company_id, auth.uid())
  ));

-- ===== pending factory_payroll =====
-- PENDING MIGRATION — apply this SQL via the Supabase migration tool when available,
-- or copy into supabase/migrations/ with a fresh timestamp prefix.
-- Adds Factory Employee Payroll & Production Labour tables.

-- 1) Employees: add wage_type, daily_wage, overtime_rate, payment_method
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS wage_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS daily_wage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE public.employees
  SET wage_type = CASE
    WHEN pay_type = 'daily' THEN 'daily'
    WHEN pay_type = 'contract' THEN 'contract'
    ELSE 'monthly'
  END
  WHERE wage_type = 'monthly';

DO $$ BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_wage_type_chk
    CHECK (wage_type IN ('monthly', 'daily', 'contract'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Labour rates: product × work_type × rate, with optional worker override
CREATE TABLE IF NOT EXISTS public.labour_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  work_type text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  unit text DEFAULT 'pcs',
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labour_rates TO authenticated;
GRANT ALL ON public.labour_rates TO service_role;
ALTER TABLE public.labour_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labour_rates_member_all ON public.labour_rates;
CREATE POLICY labour_rates_member_all ON public.labour_rates FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE INDEX IF NOT EXISTS labour_rates_lookup_idx
  ON public.labour_rates (company_id, item_id, work_type, effective_date DESC);

-- 3) Contract work entries
CREATE TABLE IF NOT EXISTS public.contract_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  work_type text NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  production_ref text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_work_status_chk CHECK (status IN ('unpaid', 'partial', 'paid'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_work_entries TO authenticated;
GRANT ALL ON public.contract_work_entries TO service_role;
ALTER TABLE public.contract_work_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_work_member_all ON public.contract_work_entries;
CREATE POLICY contract_work_member_all ON public.contract_work_entries FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE INDEX IF NOT EXISTS contract_work_emp_idx
  ON public.contract_work_entries (company_id, employee_id, status);

-- 4) Contract payments + allocations
CREATE TABLE IF NOT EXISTS public.contract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  posted_txn_id uuid,
  notes text,
  status text NOT NULL DEFAULT 'posted',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO authenticated;
GRANT ALL ON public.contract_payments TO service_role;
ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_payments_member_all ON public.contract_payments;
CREATE POLICY contract_payments_member_all ON public.contract_payments FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.contract_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.contract_payments(id) ON DELETE CASCADE,
  work_entry_id uuid NOT NULL REFERENCES public.contract_work_entries(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payment_allocations TO authenticated;
GRANT ALL ON public.contract_payment_allocations TO service_role;
ALTER TABLE public.contract_payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_alloc_member_all ON public.contract_payment_allocations;
CREATE POLICY contract_alloc_member_all ON public.contract_payment_allocations FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contract_payments p
    WHERE p.id = payment_id AND public.is_company_member(p.company_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contract_payments p
    WHERE p.id = payment_id AND public.is_company_member(p.company_id, auth.uid())
  ));
