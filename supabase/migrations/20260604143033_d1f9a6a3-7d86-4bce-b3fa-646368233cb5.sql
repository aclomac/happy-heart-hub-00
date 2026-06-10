
-- Tighten contact_requests admin update/delete to platform admins only
DROP POLICY IF EXISTS cr_admin_update ON public.contact_requests;
DROP POLICY IF EXISTS cr_admin_delete ON public.contact_requests;

CREATE POLICY cr_admin_update ON public.contact_requests
  FOR UPDATE
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY cr_admin_delete ON public.contact_requests
  FOR DELETE
  USING (public.is_platform_admin(auth.uid()));

-- Tighten payment-screenshots storage SELECT policy to platform admins only
DROP POLICY IF EXISTS payment_screenshots_user_select ON storage.objects;

CREATE POLICY payment_screenshots_user_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'payment-screenshots'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_platform_admin(auth.uid())
    )
  );
