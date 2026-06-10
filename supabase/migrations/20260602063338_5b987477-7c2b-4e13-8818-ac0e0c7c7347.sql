-- Create dedicated bucket for cash reconciliation attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('reconciliation-attachments', 'reconciliation-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Company-scoped storage policies (folder name = company_id)
DROP POLICY IF EXISTS "recon_attach_read" ON storage.objects;
CREATE POLICY "recon_attach_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'reconciliation-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "recon_attach_insert" ON storage.objects;
CREATE POLICY "recon_attach_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reconciliation-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "recon_attach_update" ON storage.objects;
CREATE POLICY "recon_attach_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'reconciliation-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "recon_attach_delete" ON storage.objects;
CREATE POLICY "recon_attach_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'reconciliation-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);