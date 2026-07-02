-- Migration 027: Restrict bank columns on usuarios (audit C3)
--
-- Any authenticated user (including every contratista) could read the bank
-- account number of every other user via the REST API. Column-level grants
-- remove banco/tipo_cuenta/numero_cuenta from the authenticated role; the
-- surfaces that legitimately need them (own profile, admin edit page,
-- contratos list, cuenta-de-cobro PDF) go through the service role after
-- app-level auth. anon loses SELECT on usuarios entirely.
--
-- RLS row policies remain unchanged and still apply on top of these grants.
--
-- IMPORTANT: apply only AFTER deploying the code that stops selecting these
-- columns with user-privileged clients (a select('*') would fail outright).

REVOKE SELECT ON public.usuarios FROM authenticated, anon;

GRANT SELECT (
  id, municipio_id, dependencia_id, nombre_completo, cedula, email, telefono,
  rol, activo, created_at, updated_at, cargo, direccion, foto_url, rh,
  tipo_documento, firma_url
) ON public.usuarios TO authenticated;
