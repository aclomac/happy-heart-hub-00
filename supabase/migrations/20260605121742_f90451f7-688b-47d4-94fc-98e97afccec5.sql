
-- 1) Table
CREATE TABLE public.document_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('sale_invoice','purchase_bill')),
  document_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size >= 0),
  storage_path text NOT NULL UNIQUE,
  attachment_kind text NOT NULL CHECK (attachment_kind IN ('image','document')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_doc_attach_doc ON public.document_attachments(company_id, document_type, document_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_attach_company ON public.document_attachments(company_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_attachments TO authenticated;
GRANT ALL ON public.document_attachments TO service_role;

ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;

-- SELECT: any company member can read
CREATE POLICY da_select ON public.document_attachments
  FOR SELECT TO authenticated
  USING (public.has_company_access(auth.uid(), company_id));

-- INSERT: must be company member with right perm for the document type
CREATE POLICY da_insert ON public.document_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_company_access(auth.uid(), company_id)
    AND uploaded_by = auth.uid()
    AND (
      (document_type = 'sale_invoice'  AND public.has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR
      (document_type = 'purchase_bill' AND public.has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  );

-- UPDATE (used for soft-delete): same perm rules
CREATE POLICY da_update ON public.document_attachments
  FOR UPDATE TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND (
      (document_type = 'sale_invoice'  AND public.has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR
      (document_type = 'purchase_bill' AND public.has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  )
  WITH CHECK (public.has_company_access(auth.uid(), company_id));

-- DELETE (hard delete fallback): same perm rules
CREATE POLICY da_delete ON public.document_attachments
  FOR DELETE TO authenticated
  USING (
    public.has_company_access(auth.uid(), company_id)
    AND (
      (document_type = 'sale_invoice'  AND public.has_role_permission(auth.uid(), company_id, 'sales.edit'))
      OR
      (document_type = 'purchase_bill' AND public.has_role_permission(auth.uid(), company_id, 'purchase.edit'))
    )
  );

CREATE TRIGGER trg_doc_attachments_updated_at
  BEFORE UPDATE ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Storage RLS for the private `document-attachments` bucket.
-- Path convention: {company_id}/{document_type}/{document_id}/{uuid}.{ext}
-- The first folder is the company_id, so we gate on (storage.foldername(name))[1].

CREATE POLICY "doc-attach read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'document-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "doc-attach insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'document-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    ((storage.foldername(name))[2]) = 'sale_invoice'
      AND public.has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'sales.edit')
    OR
    ((storage.foldername(name))[2]) = 'purchase_bill'
      AND public.has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'purchase.edit')
  )
);

CREATE POLICY "doc-attach delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'document-attachments'
  AND public.has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    ((storage.foldername(name))[2]) = 'sale_invoice'
      AND public.has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'sales.edit')
    OR
    ((storage.foldername(name))[2]) = 'purchase_bill'
      AND public.has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'purchase.edit')
  )
);
