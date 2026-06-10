
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
