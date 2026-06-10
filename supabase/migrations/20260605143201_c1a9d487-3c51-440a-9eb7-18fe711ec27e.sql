-- 1) platform_settings: hide ip_allowlist from anon/authenticated via column-level grants.
REVOKE SELECT ON public.platform_settings FROM anon, authenticated;
GRANT SELECT (
  id, platform_name, platform_logo_url, support_email, support_phone, support_whatsapp,
  terms_url, privacy_url, default_currency, default_timezone, default_trial_days,
  default_invoice_prefix, default_receipt_prefix, maintenance_mode, maintenance_message,
  signup_enabled, demo_login_enabled, is_singleton, updated_by, created_at, updated_at
) ON public.platform_settings TO anon, authenticated;

-- 2) payment_settings: add RESTRICTIVE deny so any future permissive policy still requires platform admin.
DROP POLICY IF EXISTS ps_restrict_non_admin_select ON public.payment_settings;
CREATE POLICY ps_restrict_non_admin_select
  ON public.payment_settings
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (public.is_platform_admin(auth.uid()));

-- 3) document_attachments: tighten UPDATE — authenticated only + uploader ownership.
DROP POLICY IF EXISTS da_update ON public.document_attachments;
CREATE POLICY da_update
  ON public.document_attachments
  FOR UPDATE
  TO authenticated
  USING (
    has_company_access(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND (
      (document_type = 'sale_invoice'    AND has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR (document_type = 'purchase_bill' AND has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  )
  WITH CHECK (
    has_company_access(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND (
      (document_type = 'sale_invoice'    AND has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR (document_type = 'purchase_bill' AND has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  );