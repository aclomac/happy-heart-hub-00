-- The company-logos bucket is public. Add an anon SELECT policy so the
-- storage.objects layer does not contradict the bucket's public flag.
CREATE POLICY "company_logos_public_select_anon"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'company-logos');