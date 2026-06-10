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
