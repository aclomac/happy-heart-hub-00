
-- Phase 4: Platform Settings, Support Tickets, Announcements

-- 1) Platform settings (singleton row)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name text NOT NULL DEFAULT 'ERPovo',
  platform_logo_url text,
  support_email text,
  support_phone text,
  support_whatsapp text,
  terms_url text,
  privacy_url text,
  default_currency text NOT NULL DEFAULT 'BDT',
  default_timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  default_trial_days integer NOT NULL DEFAULT 14,
  default_invoice_prefix text NOT NULL DEFAULT 'INV',
  default_receipt_prefix text NOT NULL DEFAULT 'RCP',
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  signup_enabled boolean NOT NULL DEFAULT true,
  demo_login_enabled boolean NOT NULL DEFAULT false,
  is_singleton boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton UNIQUE (is_singleton)
);

GRANT SELECT ON public.platform_settings TO authenticated, anon;
GRANT INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ps_public_read ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY ps_admin_write ON public.platform_settings
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

INSERT INTO public.platform_settings (is_singleton) VALUES (true)
ON CONFLICT (is_singleton) DO NOTHING;

CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  subject text NOT NULL,
  module text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  proof_url text,
  assigned_to uuid,
  last_reply_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (priority IN ('low','normal','high','urgent')),
  CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed'))
);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY st_own_select ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_platform_admin(auth.uid()));

CREATE POLICY st_own_insert ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY st_admin_update ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_support_tickets_user ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX idx_support_tickets_status ON public.support_tickets (status, created_at DESC);

-- 3) Support ticket messages
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY stm_select ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR (
      NOT is_internal AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = support_ticket_messages.ticket_id AND t.user_id = auth.uid()
      )
    )
  );

CREATE POLICY stm_insert ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      is_platform_admin(auth.uid())
      OR (
        NOT is_internal AND EXISTS (
          SELECT 1 FROM public.support_tickets t
          WHERE t.id = support_ticket_messages.ticket_id AND t.user_id = auth.uid()
        )
      )
    )
  );

CREATE INDEX idx_stm_ticket ON public.support_ticket_messages (ticket_id, created_at);

-- 4) Platform announcements
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  audience text NOT NULL DEFAULT 'all',
  target_plan text,
  target_company_id uuid,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_dismissible boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (type IN ('info','warning','success','maintenance')),
  CHECK (audience IN ('all','plan','company','expired','trial'))
);

GRANT SELECT ON public.platform_announcements TO authenticated;
GRANT ALL ON public.platform_announcements TO service_role;

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY pa_user_select_active ON public.platform_announcements
  FOR SELECT TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR (
      is_active = true
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at >= now())
    )
  );

CREATE POLICY pa_admin_all ON public.platform_announcements
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE TRIGGER platform_announcements_updated_at
  BEFORE UPDATE ON public.platform_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Dismissals
CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.platform_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

GRANT SELECT, INSERT ON public.announcement_dismissals TO authenticated;
GRANT ALL ON public.announcement_dismissals TO service_role;

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY ad_own ON public.announcement_dismissals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY ad_own_insert ON public.announcement_dismissals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
