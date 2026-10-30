-- ============================================================================
-- Pruebas del TOPE DE ARCHIVOS por reporte del módulo Plan de Desarrollo (migraciones 075 y 077): hasta 100, y sin decir cuántos.
--
-- Qué comprueba, con las MISMAS funciones que usa la pantalla (`pdm_borrador_guardar`, `pdm_reportar`, `pdm_validar`) y con la sesión
-- de cada persona:
--
--   · Que un reporte con 100 archivos pasa y con 101 no, tanto en el borrador como al reportar y al corregir (entre lo nuevo y lo
--     conservado de la versión anterior) y que la secretaría puede marcar hasta 100 archivos al devolver, y 101 no.
--   · Que ningún mensaje de error de esos rechazos lleva el número: la aplicación no dice cuántos archivos caben.
--   · Que el número vive en UN solo lugar (`pdm_privado.max_evidencias()`), que las dos funciones lo consultan y no lo repiten, que
--     la restricción de la tabla de validaciones dice lo mismo y que nada perdió su forma ni sus permisos.
--
-- Cómo se corre: DESPUÉS de aplicar la 077, pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la
-- sesión). NO DEJA NADA ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito, y Postgres
-- deshace la transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-TOPE: N comprobaciones, 0 fallas» y la lista.
-- La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la 077 sin su `begin` ni su `commit`, y a continuación este archivo.
-- Todo queda en la misma transacción y se deshace.
--
-- No lleva identificadores de personas: elige del propio contenido de la base a un administrador, una persona de una secretaría con
-- indicadores (será su coordinadora, la que valida) y a otra persona activa sin acceso (la que reporta). Todas reciben su acceso
-- dentro de la transacción, que se deshace.
-- ============================================================================

create temp table res (descr text, ok boolean) on commit drop;

create or replace function pg_temp.chequear(p_descr text, p_ok boolean) returns void
language sql as $f$ insert into res values (p_descr, coalesce(p_ok, false)) $f$;

-- Ejecuta una instrucción COMO esa persona (con la sesión que tendría desde la aplicación) y devuelve su resultado.
create or replace function pg_temp.como(p_uid uuid, p_sql text) returns jsonb
language plpgsql as $f$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into r;
  exception when others then
    execute 'reset role';
    raise;
  end;
  execute 'reset role';
  return r;
end $f$;

-- Lo mismo para instrucciones que no devuelven una fila (o que son varias).
create or replace function pg_temp.correr(p_uid uuid, p_sql text) returns void
language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    raise;
  end;
  execute 'reset role';
end $f$;

-- Lo que dice una instrucción que debe FALLAR: el código de error y el mensaje, o null si no falló.
create or replace function pg_temp.fallo_de(p_uid uuid, p_sql text) returns text
language plpgsql as $f$
begin
  perform pg_temp.como(p_uid, p_sql);
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;

create or replace function pg_temp.fallo_de_correr(p_uid uuid, p_sql text) returns text
language plpgsql as $f$
begin
  perform pg_temp.correr(p_uid, p_sql);
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;

-- Un escalar (como texto) que lee esa persona. Los números salen sin ceros de más (10.00 → 10).
create or replace function pg_temp.una(p_uid uuid, p_sql text) returns text
language sql as $f$
  select case when jsonb_typeof(x) = 'number' then trim_scale((x #>> '{}')::numeric)::text else x #>> '{}' end
  from (select pg_temp.como(p_uid, p_sql) as x) s
$f$;

-- Cuántas filas ve esa persona de una consulta `from ... where ...`.
create or replace function pg_temp.n(p_uid uuid, p_desde text) returns int
language sql as $f$ select (pg_temp.como(p_uid, 'select to_jsonb(count(*)) ' || p_desde))::text::int $f$;

create or replace function pg_temp.validar(p_uid uuid, p_rep uuid, p_estado text, p_com text default null) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_validar(%L::uuid, %L, %L)', p_rep, p_estado, p_com)) $f$;


-- N archivos de prueba (PDF de 1000 bytes) para un indicador y un año, en la forma que recibe `pdm_reportar`.
create or replace function pg_temp.archivos(p_plan uuid, p_ind uuid, p_n int) returns jsonb
language sql as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ruta', p_plan::text || '/' || p_ind::text || '/2026/' || gen_random_uuid()::text || '.pdf',
    'nombre', 'soporte-' || g || '.pdf', 'tipo', 'application/pdf', 'bytes', '1000') order by g), '[]'::jsonb)
  from generate_series(1, p_n) g
$f$;

do $$
declare
  v_admin uuid; v_c uuid; v_r uuid; v_dep uuid; v_i uuid; v_plan uuid;
  v_msg text; v_rep uuid; v_rep2 uuid; v_res jsonb; v_ids uuid[]; v_obs jsonb;
  v_mot constant text := 'Prueba automática del tope de archivos';
  v_texto constant text := 'Se hizo una actividad de prueba para este indicador.';
  v_resultado text; v_fallas int; v_total int;
begin
  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-TOPE: no hay un administrador activo para probar'; end if;

  select u.id, u.dependencia_id into v_c, v_dep
  from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id is not null
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    and exists (select 1 from public.pdm_indicadores i where i.dependencia_id = u.dependencia_id and i.activo)
  order by u.id limit 1;
  if v_c is null then raise exception 'PDM-TOPE: falta una persona de una secretaría con indicadores y sin acceso'; end if;

  select i.id, i.plan_id into v_i, v_plan
  from public.pdm_indicadores i
  where i.dependencia_id = v_dep and i.activo
  order by exists (select 1 from public.pdm_asignaciones a where a.indicador_id = i.id), i.id
  limit 1;

  select u.id into v_r from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.id <> v_c
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
  order by u.id limit 1;
  if v_r is null then raise exception 'PDM-TOPE: falta una persona activa sin acceso'; end if;

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i, v_r, v_mot));

  -- ══ El número vive en un solo lugar ═══════════════════════════════════════
  perform pg_temp.chequear('el tope es de 100', pdm_privado.max_evidencias() = 100);
  perform pg_temp.chequear('anon no alcanza la función del tope', not has_function_privilege('anon', 'pdm_privado.max_evidencias()', 'EXECUTE'));
  perform pg_temp.chequear('quien tiene sesión y el servidor sí', has_function_privilege('authenticated', 'pdm_privado.max_evidencias()', 'EXECUTE') and has_function_privilege('service_role', 'pdm_privado.max_evidencias()', 'EXECUTE'));
  perform pg_temp.chequear('pdm_reportar y pdm_validar consultan la función y no repiten el literal',
    (select count(*) = 2 and bool_and(prosrc like '%pdm_privado.max_evidencias()%' and prosrc !~ '(>|>=|<|<=) (5|30)( |;|$)')
       from pg_proc where oid in ('public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure, 'public.pdm_validar(uuid, text, text, jsonb)'::regprocedure)));
  perform pg_temp.chequear('la restricción de observaciones dice 100',
    exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_validaciones'::regclass and c.conname = 'pdm_validaciones_observaciones_check'
              and pg_get_constraintdef(c.oid) ~ 'jsonb_array_length\(observaciones\) <= 100\)'));
  perform pg_temp.chequear('las dos funciones siguen sin ser de definidor, con ruta de búsqueda fija y sin acceso para anon',
    (select count(*) = 2 and bool_and(not p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
              and has_function_privilege('authenticated', p.oid, 'EXECUTE') and has_function_privilege('service_role', p.oid, 'EXECUTE')
              and not has_function_privilege('anon', p.oid, 'EXECUTE'))
       from pg_proc p where p.oid in ('public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure, 'public.pdm_validar(uuid, text, text, jsonb)'::regprocedure)));

  -- ══ El borrador tiene el mismo tope (migración 076) ═══════════════════════
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_borrador_guardar(%L::uuid, 2026, 0, 1::numeric, %L, null, ''{}''::uuid[], %L::jsonb)',
    v_i, v_texto, pg_temp.archivos(v_plan, v_i, 101)::text));
  perform pg_temp.chequear('un borrador con 101 archivos NO se guarda, y el mensaje no lleva el número',
    v_msg like '22023 PDM: este reporte tiene más archivos de los que admite' and substr(v_msg, 7) !~ '[0-9]');
  v_res := pg_temp.como(v_r, format('select public.pdm_borrador_guardar(%L::uuid, 2026, 0, 1::numeric, %L, null, ''{}''::uuid[], %L::jsonb)',
    v_i, v_texto, pg_temp.archivos(v_plan, v_i, 100)::text));
  perform pg_temp.chequear('un borrador con 100 archivos se guarda', jsonb_array_length(v_res -> 'archivos') = 100);

  -- ══ Reportar: 100 pasan, 101 no ═════════════════════════════════════════════
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 1::numeric, %L, %L::jsonb)', v_i, v_texto, pg_temp.archivos(v_plan, v_i, 101)::text));
  perform pg_temp.chequear('101 archivos en un reporte nuevo NO pasan', v_msg like '22023 PDM: este reporte tiene más archivos de los que admite');
  perform pg_temp.chequear('…y el mensaje no lleva el número', v_msg is not null and substr(v_msg, 7) !~ '[0-9]');
  perform pg_temp.chequear('…ni quedó nada guardado', (select count(*) from public.pdm_reportes where indicador_id = v_i and anio = 2026) = 0);

  v_rep := (pg_temp.como(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 1::numeric, %L, %L::jsonb)', v_i, v_texto, pg_temp.archivos(v_plan, v_i, 100)::text)) ->> 'reporte')::uuid;
  perform pg_temp.chequear('100 archivos en un reporte nuevo pasan', v_rep is not null);
  perform pg_temp.chequear('…y quedan los 100 guardados', (select count(*) from public.pdm_evidencias where reporte_id = v_rep) = 100);

  -- ══ Corregir: lo nuevo y lo conservado suman lo mismo ═════════════════════
  select array_agg(id order by nombre) into v_ids from public.pdm_evidencias where reporte_id = v_rep;
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 2::numeric, %L, %L::jsonb, %L, %L::uuid[])',
    v_i, v_texto, pg_temp.archivos(v_plan, v_i, 41)::text, 'Se agregan archivos que faltaban', (select array_agg(x) from unnest(v_ids[1:60]) x)::text));
  perform pg_temp.chequear('conservar 60 y subir 41 (suman 101) NO pasa', v_msg like '22023 PDM: este reporte tiene más archivos de los que admite' and substr(v_msg, 7) !~ '[0-9]');

  v_res := pg_temp.como(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 2::numeric, %L, %L::jsonb, %L, %L::uuid[])',
    v_i, v_texto, pg_temp.archivos(v_plan, v_i, 40)::text, 'Se agregan archivos que faltaban', (select array_agg(x) from unnest(v_ids[1:60]) x)::text));
  v_rep2 := (v_res ->> 'reporte')::uuid;
  perform pg_temp.chequear('conservar 60 y subir 40 (suman 100) pasa, como corrección', v_rep2 is not null and (v_res ->> 'correccion')::boolean and (v_res ->> 'conservadas')::int = 60);
  perform pg_temp.chequear('…y la nueva versión tiene sus 100', (select count(*) from public.pdm_evidencias where reporte_id = v_rep2) = 100);

  -- ══ Devolver: la secretaría marca hasta 100 ════════════════════════════════
  select jsonb_agg(jsonb_build_object('evidencia', e.id, 'motivo', 'No abre') order by e.nombre) into v_obs from public.pdm_evidencias e where e.reporte_id = v_rep2;
  perform pg_temp.chequear('el reporte tiene 100 archivos para marcar', jsonb_array_length(v_obs) = 100);

  v_msg := pg_temp.fallo_de(v_c, format('select public.pdm_validar(%L::uuid, ''devuelto'', %L, %L::jsonb)', v_rep2, 'Hay archivos con problema, revisarlos todos.',
    (v_obs || jsonb_build_array(jsonb_build_object('evidencia', gen_random_uuid(), 'motivo', 'No abre')))::text));
  perform pg_temp.chequear('marcar 101 archivos NO pasa', v_msg like '22023 PDM: se marcaron más archivos de los que tiene un reporte');
  perform pg_temp.chequear('…y el mensaje no lleva el número', v_msg is not null and substr(v_msg, 7) !~ '[0-9]');

  v_res := pg_temp.como(v_c, format('select public.pdm_validar(%L::uuid, ''devuelto'', %L, %L::jsonb)', v_rep2, 'Hay archivos con problema, revisarlos todos.', v_obs::text));
  perform pg_temp.chequear('marcar los 100 archivos pasa', (v_res ->> 'cambio') = 'devuelto' and (v_res ->> 'observados')::int = 100);
  perform pg_temp.chequear('…y las 100 observaciones quedaron guardadas',
    (select jsonb_array_length(observaciones) from public.pdm_validaciones where reporte_id = v_rep2 order by created_at desc, id desc limit 1) = 100);

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-TOPE: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
