-- Add RESTRICTIVE policies on platform_audit_logs to prevent direct writes from any role except service_role.
-- All inserts should flow through log_platform_audit() SECURITY DEFINER function.

CREATE POLICY "pal_block_direct_insert"
ON public.platform_audit_logs
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "pal_block_direct_update"
ON public.platform_audit_logs
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "pal_block_direct_delete"
ON public.platform_audit_logs
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);