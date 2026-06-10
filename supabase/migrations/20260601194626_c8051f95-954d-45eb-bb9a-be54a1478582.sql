
REVOKE EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_has_active_subscription(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_feature_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_has_feature(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_permission(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_company_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_device_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_max_companies(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_max_devices(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_company_limit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_device_limit() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_feature_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_has_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_permission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_device_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_max_companies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_max_devices(uuid) TO authenticated;
