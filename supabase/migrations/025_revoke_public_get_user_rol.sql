-- Migration 025: get_user_rol was still executable by anon via the implicit
-- PUBLIC grant (=X in proacl). Revoke PUBLIC; authenticated and service_role
-- retain their explicit EXECUTE grants needed for RLS policy evaluation.
REVOKE EXECUTE ON FUNCTION public.get_user_rol() FROM PUBLIC;
