
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
