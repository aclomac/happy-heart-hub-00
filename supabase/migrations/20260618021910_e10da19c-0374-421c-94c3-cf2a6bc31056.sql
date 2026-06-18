DROP VIEW IF EXISTS public.public_online_store_settings;

CREATE TABLE IF NOT EXISTS public.public_online_store_settings (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  store_name text NOT NULL,
  slug text NOT NULL,
  description text,
  logo_url text,
  cover_url text,
  is_active boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

GRANT SELECT ON public.public_online_store_settings TO anon;
GRANT SELECT ON public.public_online_store_settings TO authenticated;
GRANT ALL ON public.public_online_store_settings TO service_role;

ALTER TABLE public.public_online_store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_storefront_active_read ON public.public_online_store_settings;
CREATE POLICY public_storefront_active_read
ON public.public_online_store_settings
FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE OR REPLACE FUNCTION public.sync_public_online_store_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.public_online_store_settings WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.public_online_store_settings (
    id,
    company_id,
    store_name,
    slug,
    description,
    logo_url,
    cover_url,
    is_active,
    view_count,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.company_id,
    NEW.store_name,
    NEW.slug,
    NEW.description,
    NEW.logo_url,
    NEW.cover_url,
    NEW.is_active,
    NEW.view_count,
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    store_name = EXCLUDED.store_name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    logo_url = EXCLUDED.logo_url,
    cover_url = EXCLUDED.cover_url,
    is_active = EXCLUDED.is_active,
    view_count = EXCLUDED.view_count,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_public_online_store_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_public_online_store_settings() FROM anon;
REVOKE ALL ON FUNCTION public.sync_public_online_store_settings() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_public_online_store_settings() TO service_role;

DROP TRIGGER IF EXISTS trg_sync_public_online_store_settings ON public.online_store_settings;
CREATE TRIGGER trg_sync_public_online_store_settings
AFTER INSERT OR UPDATE OR DELETE ON public.online_store_settings
FOR EACH ROW EXECUTE FUNCTION public.sync_public_online_store_settings();

INSERT INTO public.public_online_store_settings (
  id,
  company_id,
  store_name,
  slug,
  description,
  logo_url,
  cover_url,
  is_active,
  view_count,
  created_at,
  updated_at
)
SELECT
  id,
  company_id,
  store_name,
  slug,
  description,
  logo_url,
  cover_url,
  is_active,
  view_count,
  created_at,
  updated_at
FROM public.online_store_settings
ON CONFLICT (id) DO UPDATE SET
  company_id = EXCLUDED.company_id,
  store_name = EXCLUDED.store_name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  logo_url = EXCLUDED.logo_url,
  cover_url = EXCLUDED.cover_url,
  is_active = EXCLUDED.is_active,
  view_count = EXCLUDED.view_count,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;