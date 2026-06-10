-- Lock down audit_logs: only SELECT for company owners/admins; writes go through SECURITY DEFINER log_audit_event()
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;

-- Lock down subscriptions: writes happen only via SECURITY DEFINER trigger (handle_new_user_subscription) or service_role
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;

-- Add SELECT (listing) policies on storage.objects to prevent cross-company enumeration
-- Public buckets still serve files via public URLs without RLS; this only governs the list/API path.
CREATE POLICY "company_logos_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "item_images_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'item-images'
  AND has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);