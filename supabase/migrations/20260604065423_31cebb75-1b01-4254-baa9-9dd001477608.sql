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