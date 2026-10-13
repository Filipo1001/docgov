-- 062_usuarios_no_autopromocion.sql
--
-- Una sesión de usuario solo puede editar su teléfono en `usuarios`.
--
-- El problema: la política `usuarios_update_own` limita FILAS (`id = auth.uid()`), no COLUMNAS, y el rol
-- `authenticated` tenía UPDATE sobre todas las columnas, incluidas `rol`, `activo`, `dependencia_id`,
-- `cedula`, `email` y `municipio_id`. Como `get_user_rol()` lee `usuarios.rol` y de él cuelgan las políticas
-- de administrador de todas las tablas (y las de escritura de `pdm_*`), el rol era escribible por quien
-- debía estar limitado por él.
--
-- Por qué es seguro cerrarlo: la aplicación solo escribe `usuarios` con la sesión del usuario en un lugar,
-- `app/actions/usuario.ts` (`.update({ telefono })`). Todo lo demás —alta, rol, estado, dependencia, foto,
-- firma, correo— pasa por el cliente administrador (`service_role`), que no depende de estos permisos.
--
-- Dos capas, a propósito:
--   1. Permisos por columna: lo normal. Es lo que impide el cambio.
--   2. Disparador: la red de seguridad. Si un día alguien vuelve a conceder UPDATE sobre una columna
--      sensible (una migración distraída, una columna nueva con GRANT amplio: regla 2 de CLAUDE.md),
--      el disparador sigue rechazando el cambio desde una sesión de usuario.
--
-- NO toca los permisos de SELECT (la regla 2 de CLAUDE.md sigue igual) ni las políticas RLS.

-- 1. Permisos por columna -------------------------------------------------------------------------------
-- REVOKE a nivel de tabla quita también los permisos de UPDATE por columna.
revoke update on public.usuarios from anon, authenticated;
grant update (telefono) on public.usuarios to authenticated;

-- 2. Red de seguridad -----------------------------------------------------------------------------------
-- `current_user` es el rol con el que PostgREST ejecuta la petición: `authenticated` o `anon` para una
-- sesión de usuario, `service_role` para el cliente administrador, `postgres` para migraciones y el editor
-- SQL. La función es SECURITY INVOKER, así que `current_user` es quien dispara el UPDATE.
create or replace function public.usuarios_proteger_columnas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.id             is distinct from old.id
    or new.rol            is distinct from old.rol
    or new.activo         is distinct from old.activo
    or new.dependencia_id is distinct from old.dependencia_id
    or new.municipio_id   is distinct from old.municipio_id
    or new.cedula         is distinct from old.cedula
    or new.email          is distinct from old.email
  ) then
    raise exception 'USUARIOS: el rol, el estado, la dependencia, el municipio, la cédula y el correo solo los cambia el administrador desde el servidor'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Una función de disparador no se llama por la API, pero se cierra igual: es lo que hace `otrosi_aplicado_inmutable`.
revoke all on function public.usuarios_proteger_columnas() from public, anon, authenticated;

drop trigger if exists usuarios_proteger_columnas on public.usuarios;
create trigger usuarios_proteger_columnas
  before update on public.usuarios
  for each row execute function public.usuarios_proteger_columnas();
