CREATE POLICY "doc-attach update" ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'document-attachments'
  AND has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    ((storage.foldername(name))[2] = 'sale_invoice' AND has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'sales.edit'))
    OR ((storage.foldername(name))[2] = 'purchase_bill' AND has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'purchase.edit'))
  )
)
WITH CHECK (
  bucket_id = 'document-attachments'
  AND has_company_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    ((storage.foldername(name))[2] = 'sale_invoice' AND has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'sales.edit'))
    OR ((storage.foldername(name))[2] = 'purchase_bill' AND has_role_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'purchase.edit'))
  )
);