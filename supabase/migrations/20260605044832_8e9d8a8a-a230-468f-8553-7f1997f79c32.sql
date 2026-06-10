
-- Add IP allowlist to platform_settings (jsonb array of CIDR strings; empty = allow all)
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS ip_allowlist jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Add MFA required flag to platform_admins (reserved for 2FA pack)
ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false;

-- Function: check if a candidate IP is allowed by current platform_settings.ip_allowlist
-- Returns true when allowlist is empty OR when the candidate IP matches any CIDR in the list.
CREATE OR REPLACE FUNCTION public.is_ip_allowed(_ip text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list jsonb;
  v_entry text;
  v_candidate inet;
BEGIN
  SELECT ip_allowlist INTO v_list
    FROM public.platform_settings
    LIMIT 1;

  IF v_list IS NULL OR jsonb_array_length(v_list) = 0 THEN
    RETURN true;
  END IF;

  IF _ip IS NULL OR _ip = '' THEN
    -- Allowlist is non-empty but no IP could be resolved — deny by default
    RETURN false;
  END IF;

  BEGIN
    v_candidate := _ip::inet;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  FOR v_entry IN SELECT jsonb_array_elements_text(v_list) LOOP
    BEGIN
      IF v_candidate <<= v_entry::inet THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_ip_allowed(text) TO authenticated, service_role;
