
-- 1. Storage: company-logos and item-images — restrict write/delete to company members
DROP POLICY IF EXISTS "Authenticated users can upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete company logos" ON storage.objects;
DROP POLICY IF EXISTS "Company logos are publicly readable" ON storage.objects;

CREATE POLICY "company_logos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "company_logos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "company_logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
-- No SELECT policy needed — bucket is public so files are served via public URL; omitting SELECT prevents bucket listing.

DROP POLICY IF EXISTS "item images auth upload" ON storage.objects;
DROP POLICY IF EXISTS "item images auth update" ON storage.objects;
DROP POLICY IF EXISTS "item images auth delete" ON storage.objects;
DROP POLICY IF EXISTS "item images public read" ON storage.objects;

CREATE POLICY "item_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "item_images_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "item_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'item-images' AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- 2. Subscriptions: remove direct INSERT/UPDATE from authenticated users.
DROP POLICY IF EXISTS subscriptions_own_insert ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_own_update ON public.subscriptions;
-- Trial creation still works via SECURITY DEFINER trigger handle_new_user_subscription.
-- Plan upgrades must go through service_role (server-side after payment verification).

-- 3. Audit logs: remove client INSERT — audit writes must use SECURITY DEFINER.
DROP POLICY IF EXISTS al_insert ON public.audit_logs;

-- 4. Tax rates: gate writes by has_role_permission consistent with other tables
DROP POLICY IF EXISTS tax_rates_member_all ON public.tax_rates;
CREATE POLICY tax_rates_select ON public.tax_rates FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));
CREATE POLICY tax_rates_write ON public.tax_rates FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id) AND public.company_has_active_subscription(company_id) AND public.has_role_permission(auth.uid(), company_id, 'items.write'));

-- 5. Revoke EXECUTE on SECURITY DEFINER helpers from anon (none should be callable unauthenticated).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role_permission(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_feature_access(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_has_active_subscription(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_has_feature(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_company_count(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_device_count(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_max_companies(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_max_devices(uuid) FROM anon, public;
