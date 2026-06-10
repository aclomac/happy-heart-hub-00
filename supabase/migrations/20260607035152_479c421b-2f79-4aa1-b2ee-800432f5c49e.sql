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
