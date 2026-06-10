-- Contact / demo requests from public visitors
CREATE TABLE public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  business_name text,
  message text,
  preferred_contact text NOT NULL DEFAULT 'email',
  request_type text NOT NULL DEFAULT 'contact', -- contact | demo | sales
  status text NOT NULL DEFAULT 'new', -- new | contacted | closed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.contact_requests TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can submit
CREATE POLICY "cr_public_insert"
ON public.contact_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only platform admins can read / manage
CREATE POLICY "cr_admin_read"
ON public.contact_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cr_admin_update"
ON public.contact_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cr_admin_delete"
ON public.contact_requests
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_contact_requests_status_created ON public.contact_requests (status, created_at DESC);
