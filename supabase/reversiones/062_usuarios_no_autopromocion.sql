-- REVERSIÓN de 062_usuarios_no_autopromocion.sql
--
-- ⚠ Reabre el hueco que la 062 cierra: vuelve a dejar que cualquier sesión de usuario cambie su propio
-- `rol`, `activo`, `dependencia_id`, `municipio_id`, `cedula` y `email`. Úsala solo si la 062 rompe un flujo
-- legítimo y no se puede arreglar concediendo UPDATE sobre la columna que falta (lo preferible: ver abajo).
--
-- ANTES de revertir, prueba la salida corta: si el síntoma es «permission denied» al guardar una columna que la
-- aplicación SÍ debe poder editar con la sesión del usuario, basta con
--     grant update (esa_columna) on public.usuarios to authenticated;
-- y la 062 sigue protegiendo el resto. Nunca concedas rol, activo, dependencia_id, municipio_id, cedula ni email.
--
-- Estado original de producción, verificado el 13-oct-2026 justo antes de aplicar la 062:
--   ACL de public.usuarios = {anon=awdDxtm/postgres, authenticated=awdDxtm/postgres, ...}
--   es decir, UPDATE (la «w») a nivel de TABLA para anon y authenticated, no por columna.

drop trigger if exists usuarios_proteger_columnas on public.usuarios;
drop function if exists public.usuarios_proteger_columnas();

revoke update (telefono) on public.usuarios from authenticated;   -- el permiso por columna que añadió la 062
grant update on public.usuarios to anon, authenticated;           -- el permiso por tabla original
