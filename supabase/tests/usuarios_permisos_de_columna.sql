-- ============================================================================
-- Postura de permisos de `usuarios`: qué columnas puede cambiar una sesión de usuario.
--
-- SOLO LEE EL CATÁLOGO. No escribe nada, no simula a nadie y se puede correr en producción las veces que haga
-- falta, también como vigilancia: si alguien vuelve a conceder UPDATE sobre una columna sensible, una fila de
-- abajo pasa a `FALLA`.
--
-- Cómo se corre: pegar el archivo en el editor SQL de Supabase (o por la herramienta de la sesión). Devuelve una
-- fila por comprobación; todas deben decir `ok`. La última fila resume: `N comprobaciones, 0 fallas`.
--
-- Antes de aplicar la migración 062 las filas de «no puede actualizar» salen `FALLA`: eso es lo esperado y es lo
-- que la migración corrige.
-- ============================================================================
with sensibles(columna) as (
  values ('rol'), ('activo'), ('dependencia_id'), ('municipio_id'), ('cedula'), ('email'), ('id')
),
comprobaciones as (
  -- Las columnas sensibles NO se pueden actualizar desde una sesión (ni anónima ni autenticada).
  select 'authenticated NO puede actualizar usuarios.' || columna as comprobacion,
         not has_column_privilege('authenticated', 'public.usuarios', columna, 'UPDATE') as ok
    from sensibles
  union all
  select 'anon NO puede actualizar usuarios.' || columna,
         not has_column_privilege('anon', 'public.usuarios', columna, 'UPDATE')
    from sensibles
  union all
  -- Lo único que sí: el teléfono, y solo para quien tiene sesión.
  select 'authenticated SÍ puede actualizar usuarios.telefono',
         has_column_privilege('authenticated', 'public.usuarios', 'telefono', 'UPDATE')
  union all
  select 'anon NO puede actualizar usuarios.telefono',
         not has_column_privilege('anon', 'public.usuarios', 'telefono', 'UPDATE')
  union all
  -- Ninguna otra columna es actualizable por una sesión de usuario.
  select 'authenticated solo puede actualizar 1 columna de usuarios (telefono)',
         (select count(*) from information_schema.column_privileges
           where table_schema = 'public' and table_name = 'usuarios'
             and grantee = 'authenticated' and privilege_type = 'UPDATE') = 1
  union all
  -- La lectura NO cambió (regla 2 de CLAUDE.md): lo que la interfaz muestra de otros usuarios sigue legible.
  select 'authenticated SÍ puede leer usuarios.' || c,
         has_column_privilege('authenticated', 'public.usuarios', c, 'SELECT')
    from unnest(array['id', 'nombre_completo', 'rol', 'cargo', 'dependencia_id', 'foto_url']) c
  union all
  -- La red de seguridad existe, es un disparador BEFORE UPDATE y no la puede llamar la API.
  select 'existe el disparador usuarios_proteger_columnas (BEFORE UPDATE, por fila)',
         exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.usuarios'::regclass and t.tgname = 'usuarios_proteger_columnas'
                    and not t.tgisinternal
                    and (t.tgtype & 2) = 2      -- BEFORE
                    and (t.tgtype & 16) = 16    -- UPDATE
                    and (t.tgtype & 1) = 1)     -- por fila
  union all
  select 'la función del disparador no es ejecutable por anon ni authenticated',
         to_regprocedure('public.usuarios_proteger_columnas()') is not null
         and not has_function_privilege('anon', 'public.usuarios_proteger_columnas()', 'EXECUTE')
         and not has_function_privilege('authenticated', 'public.usuarios_proteger_columnas()', 'EXECUTE')
  union all
  select 'la función del disparador tiene search_path fijo',
         coalesce((select 'search_path=""' = any(p.proconfig) from pg_proc p
                    where p.oid = to_regprocedure('public.usuarios_proteger_columnas()')), false)
)
select comprobacion, case when ok then 'ok' else 'FALLA' end as resultado from comprobaciones
union all
select count(*) || ' comprobaciones, ' || count(*) filter (where not ok) || ' fallas', ''
  from comprobaciones;
