-- Restrict public platform_settings read to a safe-columns view
DROP POLICY IF EXISTS ps_public_read_safe ON public.platform_settings;

CREATE OR REPLACE VIEW public.platform_settings_public
WITH (security_invoker = false) AS
SELECT
  id,
  platform_name,
  platform_logo_url,
  support_email,
  support_phone,
  support_whatsapp,
  terms_url,
  privacy_url,
  default_currency,
  maintenance_mode,
  maintenance_message,
  signup_enabled,
  demo_login_enabled
FROM public.platform_settings
LIMIT 1;

GRANT SELECT ON public.platform_settings_public TO anon, authenticated;

-- Align WITH CHECK on document_attachments UPDATE to match USING
DROP POLICY IF EXISTS da_update ON public.document_attachments;
CREATE POLICY da_update ON public.document_attachments
FOR UPDATE
USING (
  has_company_access(auth.uid(), company_id) AND (
    (document_type = 'sale_invoice' AND has_role_permission(auth.uid(), company_id, 'sales.edit'))
    OR (document_type = 'purchase_bill' AND has_role_permission(auth.uid(), company_id, 'purchase.edit'))
  )
)
WITH CHECK (
  has_company_access(auth.uid(), company_id) AND (
    (document_type = 'sale_invoice' AND has_role_permission(auth.uid(), company_id, 'sales.edit'))
    OR (document_type = 'purchase_bill' AND has_role_permission(auth.uid(), company_id, 'purchase.edit'))
  )
);