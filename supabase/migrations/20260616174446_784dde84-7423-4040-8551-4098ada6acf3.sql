CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  type text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warehouses_company_idx ON public.warehouses(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warehouses_select ON public.warehouses;
CREATE POLICY warehouses_select ON public.warehouses
  FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

DROP POLICY IF EXISTS warehouses_write ON public.warehouses;
CREATE POLICY warehouses_write ON public.warehouses
  FOR ALL TO authenticated
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner'::public.app_role)
    OR public.has_company_role(auth.uid(), company_id, 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_company_role(auth.uid(), company_id, 'owner'::public.app_role)
    OR public.has_company_role(auth.uid(), company_id, 'admin'::public.app_role)
  );

DROP TRIGGER IF EXISTS set_warehouses_updated_at ON public.warehouses;
CREATE TRIGGER set_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();