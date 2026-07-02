-- Migration 024: Security hardening for database functions (audit A2)
--
-- 1. Pin search_path on all public functions to prevent search-path hijacking.
--    All three function bodies already schema-qualify their references
--    (public.usuarios, auth.uid()), so an empty search_path is safe.
-- 2. Revoke EXECUTE on get_user_rol() from anon: it is SECURITY DEFINER and
--    was callable by unauthenticated clients via /rest/v1/rpc/get_user_rol.
--    authenticated keeps EXECUTE because 40+ RLS policies evaluate this
--    function with the caller's privileges.

ALTER FUNCTION public.get_user_rol() SET search_path = '';
ALTER FUNCTION public.prevent_historico_update() SET search_path = '';
ALTER FUNCTION public.update_updated_at() SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.get_user_rol() FROM anon;
