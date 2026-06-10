-- 1) Remove permissive public-read policy on platform_settings.
DROP POLICY IF EXISTS ps_public_read_safe ON public.platform_settings;

-- Ensure platform admins can still read (covered by ps_admin_write FOR ALL, but add explicit SELECT for clarity).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'ps_admin_read' AND polrelid = 'public.platform_settings'::regclass
  ) THEN
    CREATE POLICY ps_admin_read ON public.platform_settings
      FOR SELECT TO authenticated
      USING (public.is_platform_admin(auth.uid()));
  END IF;
END$$;

-- 2) Restrict document_attachments DELETE to the original uploader.
DROP POLICY IF EXISTS da_delete ON public.document_attachments;
CREATE POLICY da_delete ON public.document_attachments
  FOR DELETE TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND (
      (document_type = 'sale_invoice'  AND public.has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR (document_type = 'purchase_bill' AND public.has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  );