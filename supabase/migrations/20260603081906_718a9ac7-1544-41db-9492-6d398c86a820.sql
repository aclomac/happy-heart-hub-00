CREATE OR REPLACE FUNCTION public.log_audit_event(
  _company_id uuid,
  _module text,
  _action text,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _reference_no text DEFAULT NULL,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL,
  _amount_impact numeric DEFAULT NULL,
  _status text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _company_id IS NULL OR NOT public.has_company_access(v_uid, _company_id) THEN
    RAISE EXCEPTION 'Access denied for company' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    company_id, user_id, action, entity_type, entity_id, module,
    reference_no, old_value, new_value, amount_impact, status,
    user_agent, metadata
  ) VALUES (
    _company_id, v_uid, _action, COALESCE(_entity_type, _module), _entity_id, _module,
    _reference_no, _old_value, _new_value, _amount_impact, _status,
    _user_agent, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, jsonb, jsonb, numeric, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, jsonb, jsonb, numeric, text, text, jsonb) TO authenticated;