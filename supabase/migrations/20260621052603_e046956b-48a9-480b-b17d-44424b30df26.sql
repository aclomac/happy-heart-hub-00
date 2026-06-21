
-- =========================================================
-- sync_changes
-- =========================================================
CREATE TABLE public.sync_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  table_name text NOT NULL,
  record_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('insert','update','delete')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  device_id text,
  user_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX sync_changes_company_updated_idx
  ON public.sync_changes (company_id, updated_at DESC);
CREATE INDEX sync_changes_company_table_idx
  ON public.sync_changes (company_id, table_name, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_changes TO authenticated;
GRANT ALL ON public.sync_changes TO service_role;

ALTER TABLE public.sync_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_changes company members read"
  ON public.sync_changes FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "sync_changes company members insert"
  ON public.sync_changes FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "sync_changes company members update"
  ON public.sync_changes FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "sync_changes company members delete"
  ON public.sync_changes FOR DELETE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE TRIGGER sync_changes_set_updated_at
  BEFORE UPDATE ON public.sync_changes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- sync_conflicts
-- =========================================================
CREATE TABLE public.sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  table_name text NOT NULL,
  record_id text NOT NULL,
  local_payload jsonb,
  remote_payload jsonb,
  reason text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sync_conflicts_company_status_idx
  ON public.sync_conflicts (company_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_conflicts TO authenticated;
GRANT ALL ON public.sync_conflicts TO service_role;

ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_conflicts company members read"
  ON public.sync_conflicts FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "sync_conflicts company members insert"
  ON public.sync_conflicts FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "sync_conflicts company members update"
  ON public.sync_conflicts FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "sync_conflicts company members delete"
  ON public.sync_conflicts FOR DELETE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE TRIGGER sync_conflicts_set_updated_at
  BEFORE UPDATE ON public.sync_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- device_sync_state
-- =========================================================
CREATE TABLE public.device_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  device_id text NOT NULL,
  table_name text NOT NULL,
  last_pull_at timestamptz,
  last_push_at timestamptz,
  cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, device_id, table_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_sync_state TO authenticated;
GRANT ALL ON public.device_sync_state TO service_role;

ALTER TABLE public.device_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_sync_state company members read"
  ON public.device_sync_state FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "device_sync_state company members insert"
  ON public.device_sync_state FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "device_sync_state company members update"
  ON public.device_sync_state FOR UPDATE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "device_sync_state company members delete"
  ON public.device_sync_state FOR DELETE TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

CREATE TRIGGER device_sync_state_set_updated_at
  BEFORE UPDATE ON public.device_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
