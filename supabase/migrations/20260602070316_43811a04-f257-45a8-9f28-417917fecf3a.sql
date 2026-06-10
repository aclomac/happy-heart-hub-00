
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
