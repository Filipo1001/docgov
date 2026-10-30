-- ============================================================================
-- Pruebas del LARGO de «¿Qué se hizo?» del módulo Plan de Desarrollo (migraciones 078 y 079): hasta 10.000 caracteres.
--
-- Qué comprueba, con las MISMAS funciones que usa la pantalla (`pdm_borrador_guardar`, `pdm_reportar`) y con la sesión de cada persona:
--
--   · Que un texto de 10.000 caracteres se guarda en el borrador y se envía (también en una corrección), y uno de 10.001 no, con el
--     mensaje que dice el límite.
--   · Que cuenta CARACTERES, no bytes (10.000 «ñ» caben) y que los espacios de los bordes no cuentan al enviar (se recortan).
--   · Que el número vive en UN solo lugar (`pdm_privado.max_texto_reporte()`), que las dos funciones lo consultan y ya no repiten el
--     1.000, que la restricción de la tabla del borrador dice lo mismo y que nada perdió su forma ni sus permisos.
--
-- Cómo se corre: DESPUÉS de aplicar la 079, pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la
-- sesión). NO DEJA NADA ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito, y Postgres
-- deshace la transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-TEXTO: N comprobaciones, 0 fallas» y la lista.
-- La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la 079 sin su `begin` ni su `commit`, y a continuación este archivo.
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
  v_msg text; v_rep uuid; v_res jsonb;
  v_mot constant text := 'Prueba automática del largo del texto';
  v_ok text; v_largo text; v_enes text;
  v_resultado text; v_fallas int; v_total int;
begin
  -- Textos exactos: 10.000 y 10.001 caracteres, y 10.000 «ñ» (20.000 bytes).
  v_ok := rpad('Se hizo un taller en cada vereda. ', 10000, 'Se hizo un taller en cada vereda. ');
  v_largo := v_ok || 'x';
  v_enes := 'Se hizo ' || repeat('ñ', 9992);
  if char_length(v_ok) <> 10000 or char_length(v_largo) <> 10001 or char_length(v_enes) <> 10000 or octet_length(v_enes) <= 10000 then
    raise exception 'PDM-TEXTO: los textos de prueba no tienen el largo previsto';
  end if;

  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-TEXTO: no hay un administrador activo para probar'; end if;

  select u.id, u.dependencia_id into v_c, v_dep
  from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id is not null
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    and exists (select 1 from public.pdm_indicadores i where i.dependencia_id = u.dependencia_id and i.activo)
  order by u.id limit 1;
  if v_c is null then raise exception 'PDM-TEXTO: falta una persona de una secretaría con indicadores y sin acceso'; end if;

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
  if v_r is null then raise exception 'PDM-TEXTO: falta una persona activa sin acceso'; end if;

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i, v_r, v_mot));

  -- ══ El número vive en un solo lugar ═══════════════════════════════════════
  perform pg_temp.chequear('el largo máximo es de 10.000', pdm_privado.max_texto_reporte() = 10000);
  perform pg_temp.chequear('anon no alcanza la función del largo', not has_function_privilege('anon', 'pdm_privado.max_texto_reporte()', 'EXECUTE'));
  perform pg_temp.chequear('quien tiene sesión y el servidor sí', has_function_privilege('authenticated', 'pdm_privado.max_texto_reporte()', 'EXECUTE') and has_function_privilege('service_role', 'pdm_privado.max_texto_reporte()', 'EXECUTE'));
  perform pg_temp.chequear('pdm_reportar y pdm_borrador_guardar consultan la función y ya no repiten el 1.000',
    (select count(*) = 2 and bool_and(prosrc like '%char_length(v_texto) > pdm_privado.max_texto_reporte()%' and prosrc !~ 'char_length\(v_texto\) > 1000')
       from pg_proc where oid in ('public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure,
                                  'public.pdm_borrador_guardar(uuid, integer, integer, numeric, text, text, uuid[], jsonb)'::regprocedure)));
  perform pg_temp.chequear('las dos siguen sin ser de definidor, con ruta de búsqueda fija y sin acceso para anon',
    (select count(*) = 2 and bool_and(not p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
              and has_function_privilege('authenticated', p.oid, 'EXECUTE') and has_function_privilege('service_role', p.oid, 'EXECUTE')
              and not has_function_privilege('anon', p.oid, 'EXECUTE'))
       from pg_proc p where p.oid in ('public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure,
                                      'public.pdm_borrador_guardar(uuid, integer, integer, numeric, text, text, uuid[], jsonb)'::regprocedure)));
  perform pg_temp.chequear('la restricción del borrador dice 10.000',
    exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_borradores'::regclass and c.conname = 'pdm_borradores_texto_check'
              and pg_get_constraintdef(c.oid) ~ 'char_length\(texto\) <= 10000'));

  -- ══ El borrador ═══════════════════════════════════════════════════════════
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_borrador_guardar(%L::uuid, 2026, 0, 1::numeric, %L, null, ''{}''::uuid[], %L::jsonb)',
    v_i, v_largo, pg_temp.archivos(v_plan, v_i, 1)::text));
  perform pg_temp.chequear('un borrador con 10.001 caracteres NO se guarda, y dice el límite',
    v_msg = '22001 PDM: la descripción no puede pasar de 10.000 caracteres');
  v_res := pg_temp.como(v_r, format('select public.pdm_borrador_guardar(%L::uuid, 2026, 0, 1::numeric, %L, null, ''{}''::uuid[], %L::jsonb)',
    v_i, v_ok, pg_temp.archivos(v_plan, v_i, 1)::text));
  perform pg_temp.chequear('un borrador con 10.000 caracteres se guarda, entero',
    (v_res ->> 'version')::int = 1 and (select char_length(b.texto) from public.pdm_borradores b where b.indicador_id = v_i and b.anio = 2026) = 10000);

  -- ══ Enviar ════════════════════════════════════════════════════════════════
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 1::numeric, %L, %L::jsonb)', v_i, v_largo, pg_temp.archivos(v_plan, v_i, 1)::text));
  perform pg_temp.chequear('un reporte con 10.001 caracteres NO se envía, y dice el límite', v_msg = '22001 PDM: la descripción no puede pasar de 10.000 caracteres');
  perform pg_temp.chequear('…ni quedó nada guardado', (select count(*) from public.pdm_reportes where indicador_id = v_i and anio = 2026) = 0);

  -- Los espacios de los bordes no cuentan: la base los recorta al enviar (`btrim`, solo espacios; la aplicación ya manda el texto recortado,
  -- saltos de línea incluidos).
  v_rep := (pg_temp.como(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 1::numeric, %L, %L::jsonb)', v_i, '   ' || v_ok || '   ', pg_temp.archivos(v_plan, v_i, 1)::text)) ->> 'reporte')::uuid;
  perform pg_temp.chequear('un reporte con 10.000 caracteres (y espacios en los bordes) se envía', v_rep is not null);
  perform pg_temp.chequear('…con su texto entero, sin los espacios', (select r.texto = v_ok from public.pdm_reportes r where r.id = v_rep));
  perform pg_temp.chequear('…y el envío borró el borrador, como siempre', (select count(*) from public.pdm_borradores where indicador_id = v_i and anio = 2026) = 0);

  -- ══ Corregir, y caracteres que no son ASCII ═══════════════════════════════
  v_res := pg_temp.como(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 2::numeric, %L, %L::jsonb, %L)',
    v_i, v_enes, pg_temp.archivos(v_plan, v_i, 1)::text, 'Se corrige el texto del reporte'));
  perform pg_temp.chequear('una corrección con 10.000 «ñ» (20.000 bytes) pasa: cuenta caracteres, no bytes',
    (v_res ->> 'reporte') is not null and (v_res ->> 'correccion')::boolean
    and (select char_length(r.texto) from public.pdm_reportes r where r.id = (v_res ->> 'reporte')::uuid) = 10000);
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 3::numeric, %L, %L::jsonb, %L)',
    v_i, v_enes || 'ñ', pg_temp.archivos(v_plan, v_i, 1)::text, 'Se corrige el texto del reporte'));
  perform pg_temp.chequear('…y con 10.001 no', v_msg = '22001 PDM: la descripción no puede pasar de 10.000 caracteres');

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-TEXTO: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
