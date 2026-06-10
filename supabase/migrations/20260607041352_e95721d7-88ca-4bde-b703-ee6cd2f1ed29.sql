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
