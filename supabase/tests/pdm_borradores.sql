-- ============================================================================
-- Pruebas del BORRADOR del reporte del módulo Plan de Desarrollo (migración 076), con las MISMAS funciones que usa la pantalla y con la
-- sesión de cada persona:
--
--   · Quién ve el borrador: las personas que tienen el indicador a su cargo (responsable y apoyo, las dos); NO la coordinadora de la
--     secretaría, ni el administrador, ni alguien con acceso al módulo pero sin ese indicador, ni `anon`.
--   · Que las tablas del borrador no tienen permisos de escritura para nadie más que el servidor (se escribe solo con las funciones).
--   · Guardar: crea el borrador con una versión; guardar con la versión vieja o con 0 cuando ya existe se niega (no se pisa en silencio lo
--     de otra persona); quien no tiene el indicador a su cargo no puede guardar; un borrador puede estar incompleto pero lo que trae tiene
--     que servir (valor, textos, tipos y pesos de archivo, ruta del indicador y año, tope de archivos sin decir el número, nada repetido,
--     nada que ya sea evidencia de un reporte, nada vacío).
--   · Los archivos del borrador son una lista: los que ya no están se devuelven como retirados (el servidor los quita del almacenamiento).
--   · Descartar: se niega con la versión vieja, y con la buena borra el borrador y devuelve todas las rutas.
--   · Enviar: `pdm_reportar` con archivos del borrador borra el borrador (y sus filas de archivos) en la misma transacción; también cuando
--     es una corrección que conserva archivos de la versión anterior.
--   · Las funciones no son de definidor (las públicas), tienen ruta de búsqueda fija y `anon` no las alcanza.
--
-- Cómo se corre: DESPUÉS de aplicar la 076, pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la sesión).
-- NO DEJA NADA ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito, y Postgres deshace la
-- transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-BORRADOR: N comprobaciones, 0 fallas» y la lista. La última línea
-- (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la 076 sin su `begin` ni su `commit`, y a continuación este archivo.
--
-- No lleva identificadores de personas: elige del propio contenido de la base a un administrador, a una persona de una secretaría con
-- indicadores (la coordinadora) y a tres personas activas sin acceso (dos con el indicador a su cargo y una sin él). Todas reciben su
-- acceso dentro de la transacción, que se deshace.
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


-- N archivos de prueba (PDF de 1000 bytes) para un indicador y un año, en la forma que recibe `pdm_borrador_guardar`.
create or replace function pg_temp.archivos(p_plan uuid, p_ind uuid, p_n int) returns jsonb
language sql as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ruta', p_plan::text || '/' || p_ind::text || '/2026/' || gen_random_uuid()::text || '.pdf',
    'nombre', 'soporte-' || g || '.pdf', 'tipo', 'application/pdf', 'bytes', '1000') order by g), '[]'::jsonb)
  from generate_series(1, p_n) g
$f$;

-- Guarda un borrador como esa persona. El valor va como TEXTO (para poder pasar la palabra null); el motivo, como texto o NULL de verdad.
create or replace function pg_temp.guardar(p_uid uuid, p_ind uuid, p_ver int, p_valor text, p_texto text, p_motivo text, p_conservar text, p_archivos jsonb)
returns jsonb
language sql as $f$
  select pg_temp.como(p_uid, format('select public.pdm_borrador_guardar(%L::uuid, 2026, %s, %s::numeric, %L, %L, %L::uuid[], %L::jsonb)',
    p_ind, p_ver, p_valor, p_texto, p_motivo, p_conservar, p_archivos::text))
$f$;

create or replace function pg_temp.fallo_guardar(p_uid uuid, p_ind uuid, p_ver int, p_valor text, p_texto text, p_motivo text, p_conservar text, p_archivos jsonb)
returns text
language sql as $f$
  select pg_temp.fallo_de(p_uid, format('select public.pdm_borrador_guardar(%L::uuid, 2026, %s, %s::numeric, %L, %L, %L::uuid[], %L::jsonb)',
    p_ind, p_ver, p_valor, p_texto, p_motivo, p_conservar, p_archivos::text))
$f$;

do $$
declare
  v_admin uuid; v_c uuid; v_r uuid; v_r2 uuid; v_x uuid; v_dep uuid; v_i uuid; v_plan uuid;
  v_msg text; v_res jsonb; v_res2 jsonb; v_arch jsonb; v_arch2 jsonb; v_rep uuid; v_rep2 uuid; v_ev uuid; v_ver int;
  v_mot constant text := 'Prueba automática del borrador';
  v_texto constant text := 'Avance parcial: se hicieron cuatro de los diez talleres.';
  v_resultado text; v_fallas int; v_total int;
begin
  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-BORRADOR: no hay un administrador activo para probar'; end if;

  select u.id, u.dependencia_id into v_c, v_dep
  from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id is not null
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    and exists (select 1 from public.pdm_indicadores i where i.dependencia_id = u.dependencia_id and i.activo)
  order by u.id limit 1;
  if v_c is null then raise exception 'PDM-BORRADOR: falta una persona de una secretaría con indicadores y sin acceso'; end if;

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
  select u.id into v_r2 from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.id not in (v_c, v_r)
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
  order by u.id limit 1;
  select u.id into v_x from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.id not in (v_c, v_r, v_r2)
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
  order by u.id limit 1;
  if v_r is null or v_r2 is null or v_x is null then raise exception 'PDM-BORRADOR: faltan tres personas activas sin acceso'; end if;

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r2, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_x, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i, v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i, v_r2, v_mot));

  -- ══ Las tablas y las funciones: permisos ═════════════════════════════════
  perform pg_temp.chequear('nadie con sesión escribe en las tablas del borrador (solo el servidor)',
    not exists (select 1 from unnest(array['public.pdm_borradores', 'public.pdm_borrador_archivos']) t, unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
                 where has_table_privilege('authenticated', t, p) or has_table_privilege('anon', t, p)));
  perform pg_temp.chequear('quien tiene sesión lee; anon no',
    has_table_privilege('authenticated', 'public.pdm_borradores', 'SELECT') and not has_table_privilege('anon', 'public.pdm_borradores', 'SELECT')
    and has_table_privilege('authenticated', 'public.pdm_borrador_archivos', 'SELECT') and not has_table_privilege('anon', 'public.pdm_borrador_archivos', 'SELECT'));
  perform pg_temp.chequear('las funciones públicas: de invocador, ruta fija, sin anon, con sesión sí',
    (select count(*) = 2 and bool_and(not p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
              and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE'))
       from pg_proc p where p.oid in ('public.pdm_borrador_guardar(uuid, integer, integer, numeric, text, text, uuid[], jsonb)'::regprocedure, 'public.pdm_borrador_descartar(uuid, integer, integer)'::regprocedure)));

  -- ══ Guardar: primer borrador, compartido y privado ═══════════════════════
  perform pg_temp.chequear('antes de guardar nadie ve ningún borrador', pg_temp.n(v_r, format('from public.pdm_borradores where indicador_id = %L', v_i)) = 0);

  v_arch := pg_temp.archivos(v_plan, v_i, 2);
  v_res := pg_temp.guardar(v_r, v_i, 0, '4', v_texto, null, '{}', v_arch);
  perform pg_temp.chequear('el primer guardado crea el borrador con la versión 1, sus 2 archivos y quién lo guardó',
    (v_res ->> 'version')::int = 1 and jsonb_array_length(v_res -> 'archivos') = 2 and jsonb_array_length(v_res -> 'retirados') = 0 and (v_res ->> 'editado_por_id')::uuid = v_r);
  perform pg_temp.chequear('queda guardado lo escrito (valor, texto) y los archivos',
    (select b.valor = 4 and b.texto = v_texto and b.motivo is null and (select count(*) from public.pdm_borrador_archivos a where a.borrador_id = b.id) = 2
       from public.pdm_borradores b where b.indicador_id = v_i and b.anio = 2026));

  perform pg_temp.chequear('quien lo guardó lo ve', pg_temp.n(v_r, format('from public.pdm_borradores where indicador_id = %L', v_i)) = 1);
  perform pg_temp.chequear('…y sus archivos', pg_temp.n(v_r, 'from public.pdm_borrador_archivos') = 2);
  perform pg_temp.chequear('el otro responsable del mismo indicador (compartido) también lo ve', pg_temp.n(v_r2, format('from public.pdm_borradores where indicador_id = %L', v_i)) = 1);
  perform pg_temp.chequear('…y sus archivos', pg_temp.n(v_r2, 'from public.pdm_borrador_archivos') = 2);
  perform pg_temp.chequear('la coordinadora de la secretaría NO lo ve', pg_temp.n(v_c, 'from public.pdm_borradores') = 0 and pg_temp.n(v_c, 'from public.pdm_borrador_archivos') = 0);
  perform pg_temp.chequear('el administrador NO lo ve', pg_temp.n(v_admin, 'from public.pdm_borradores') = 0 and pg_temp.n(v_admin, 'from public.pdm_borrador_archivos') = 0);
  perform pg_temp.chequear('alguien con acceso al módulo pero sin ese indicador NO lo ve', pg_temp.n(v_x, 'from public.pdm_borradores') = 0 and pg_temp.n(v_x, 'from public.pdm_borrador_archivos') = 0);

  -- ══ Guardar: versiones y quién puede ═════════════════════════════════════
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 0, '4', v_texto, null, '{}', pg_temp.archivos(v_plan, v_i, 1));
  perform pg_temp.chequear('guardar «como si no hubiera borrador» cuando ya existe se niega', v_msg like '40001 PDM: el borrador cambió mientras lo editabas%');
  v_msg := pg_temp.fallo_guardar(v_c, v_i, 1, '4', v_texto, null, '{}', v_arch);
  perform pg_temp.chequear('la coordinadora no puede guardar (no tiene el indicador a su cargo)', v_msg like '42501 PDM: este indicador no está a tu cargo');
  v_msg := pg_temp.fallo_guardar(v_x, v_i, 1, '4', v_texto, null, '{}', v_arch);
  -- Quien ni siquiera ve el indicador recibe «no existe o no tienes acceso»; quien lo ve pero no lo tiene a su cargo, «no está a tu cargo».
  perform pg_temp.chequear('alguien sin ese indicador tampoco (42501, sin saber más)', v_msg like '42501 PDM: %');
  v_msg := pg_temp.fallo_guardar(v_admin, v_i, 1, '4', v_texto, null, '{}', v_arch);
  perform pg_temp.chequear('ni el administrador (no reporta por otro)', v_msg like '42501 PDM: este indicador no está a tu cargo');

  -- El segundo responsable continúa el borrador: quita un archivo, agrega otro, cambia el valor.
  v_arch2 := jsonb_build_array(v_arch -> 0) || pg_temp.archivos(v_plan, v_i, 1);
  v_res2 := pg_temp.guardar(v_r2, v_i, 1, '6', v_texto || ' Y se prepara el quinto.', null, '{}', v_arch2);
  perform pg_temp.chequear('otro responsable continúa el borrador: la versión sube a 2 y queda él como quien lo editó',
    (v_res2 ->> 'version')::int = 2 and (v_res2 ->> 'editado_por_id')::uuid = v_r2
    and (select b.creado_por = v_r and b.editado_por = v_r2 and b.valor = 6 from public.pdm_borradores b where b.indicador_id = v_i and b.anio = 2026));
  perform pg_temp.chequear('el archivo que ya no está se devuelve como retirado, y solo ese',
    jsonb_array_length(v_res2 -> 'retirados') = 1 and (v_res2 -> 'retirados' ->> 0) = (v_arch -> 1 ->> 'ruta'));
  perform pg_temp.chequear('la lista de archivos quedó con 2 (uno de antes y uno nuevo)',
    jsonb_array_length(v_res2 -> 'archivos') = 2 and (select count(*) from public.pdm_borrador_archivos) = 2
    and exists (select 1 from public.pdm_borrador_archivos where ruta = v_arch -> 0 ->> 'ruta'));
  perform pg_temp.chequear('el archivo que se conservó sigue a nombre de quien lo subió primero',
    (select subido_por = v_r from public.pdm_borrador_archivos where ruta = v_arch -> 0 ->> 'ruta'));

  v_msg := pg_temp.fallo_guardar(v_r, v_i, 1, '7', v_texto, null, '{}', v_arch2);
  perform pg_temp.chequear('guardar con la versión vieja (la otra persona ya guardó) se niega, sin pisar nada',
    v_msg like '40001 PDM: el borrador cambió mientras lo editabas%' and (select b.valor = 6 from public.pdm_borradores b where b.indicador_id = v_i and b.anio = 2026));

  -- ══ Guardar: lo que trae tiene que servir (aunque esté incompleto) ═══════
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', repeat('a', 1001), null, '{}', v_arch2);
  perform pg_temp.chequear('un texto de más de 1.000 caracteres no se guarda', v_msg like '22001%');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '-1', v_texto, null, '{}', v_arch2);
  perform pg_temp.chequear('un valor negativo no se guarda', v_msg like '22023%');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', v_texto, repeat('m', 501), '{}', v_arch2);
  perform pg_temp.chequear('un motivo de más de 500 caracteres no se guarda', v_msg like '22001%');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, 'null', '', null, '{}', '[]'::jsonb);
  perform pg_temp.chequear('un borrador sin nada (ni valor, ni texto, ni motivo, ni archivos) no se guarda', v_msg like '22023 PDM: no hay nada que guardar en el borrador');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', v_texto, null, '{}', pg_temp.archivos(v_plan, v_i, 101));
  perform pg_temp.chequear('101 archivos no caben, y el mensaje no lleva el número', v_msg like '22023 PDM: este reporte tiene más archivos de los que admite' and substr(v_msg, 7) !~ '[0-9]');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', v_texto, null, '{}', jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || v_i::text || '/2026/' || gen_random_uuid()::text || '.exe', 'nombre', 'x.exe', 'tipo', 'application/x-msdownload', 'bytes', '1000')));
  perform pg_temp.chequear('un tipo que no se admite no se guarda', v_msg like '22023 PDM: tipo de archivo no permitido%');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', v_texto, null, '{}', jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || v_i::text || '/2026/' || gen_random_uuid()::text || '.pdf', 'nombre', 'x.pdf', 'tipo', 'application/pdf', 'bytes', '999999999')));
  perform pg_temp.chequear('un archivo más pesado que su tipo no se guarda', v_msg like '22022 PDM: este archivo pesa más de lo que admite su tipo%');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', v_texto, null, '{}', jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || gen_random_uuid()::text || '/2026/' || gen_random_uuid()::text || '.pdf', 'nombre', 'x.pdf', 'tipo', 'application/pdf', 'bytes', '1000')));
  perform pg_temp.chequear('una ruta de otro indicador no se guarda', v_msg like '22023 PDM: una evidencia no corresponde a este indicador y este año');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', v_texto, null, '{}', jsonb_build_array(v_arch -> 0, v_arch -> 0));
  perform pg_temp.chequear('el mismo archivo dos veces no se guarda', v_msg like '22023 PDM: un mismo archivo está repetido');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', v_texto, null, '{}', jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || v_i::text || '/2026/../x.pdf', 'nombre', 'x.pdf', 'tipo', 'application/pdf', 'bytes', '1000')));
  perform pg_temp.chequear('una ruta con «..» no se guarda', v_msg like '22023 PDM: una evidencia no corresponde a este indicador y este año');
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 2, '6', v_texto, null, array[gen_random_uuid()]::text, v_arch2);
  perform pg_temp.chequear('conservar un archivo que no es de este indicador y año no se guarda', v_msg like '22023 PDM: un archivo que quieres conservar no es de este indicador y este año');
  perform pg_temp.chequear('nada de eso tocó el borrador (sigue en la versión 2)', (select b.version = 2 from public.pdm_borradores b where b.indicador_id = v_i and b.anio = 2026));

  v_res := pg_temp.guardar(v_r, v_i, 2, 'null', '', null, '{}', v_arch2);
  perform pg_temp.chequear('un borrador incompleto sí se guarda (sin valor ni texto, solo con archivos)', (v_res ->> 'version')::int = 3);
  perform pg_temp.chequear('…y quedó sin valor ni texto', (select b.valor is null and b.texto = '' from public.pdm_borradores b where b.indicador_id = v_i and b.anio = 2026));

  -- ══ Descartar ═════════════════════════════════════════════════════════════
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_borrador_descartar(%L::uuid, 2026, 1)', v_i));
  perform pg_temp.chequear('descartar con la versión vieja se niega', v_msg like '40001 PDM: el borrador cambió mientras lo editabas%');
  v_msg := pg_temp.fallo_de(v_x, format('select public.pdm_borrador_descartar(%L::uuid, 2026, 3)', v_i));
  perform pg_temp.chequear('alguien sin el indicador no puede descartar', v_msg like '42501%');
  v_res := pg_temp.como(v_r2, format('select public.pdm_borrador_descartar(%L::uuid, 2026, 3)', v_i));
  perform pg_temp.chequear('con la versión buena se borra y devuelve las rutas de sus 2 archivos', jsonb_array_length(v_res -> 'retirados') = 2);
  perform pg_temp.chequear('no queda nada del borrador ni de sus archivos',
    (select count(*) from public.pdm_borradores where indicador_id = v_i) = 0 and (select count(*) from public.pdm_borrador_archivos) = 0);
  v_res := pg_temp.como(v_r, format('select public.pdm_borrador_descartar(%L::uuid, 2026, 3)', v_i));
  perform pg_temp.chequear('descartar lo que no existe no falla y no devuelve nada', jsonb_array_length(v_res -> 'retirados') = 0);

  -- ══ Enviar el reporte borra el borrador ═══════════════════════════════════
  v_arch := pg_temp.archivos(v_plan, v_i, 3);
  v_res := pg_temp.guardar(v_r, v_i, 0, '5', v_texto, null, '{}', v_arch);
  perform pg_temp.chequear('se guarda un borrador de 3 archivos para enviarlo', (v_res ->> 'version')::int = 1 and (select count(*) from public.pdm_borrador_archivos) = 3);
  -- El reporte lleva 2 archivos del borrador y 1 nuevo (el otro archivo del borrador se quedó fuera).
  v_res2 := pg_temp.como(v_r2, format('select public.pdm_reportar(%L::uuid, 2026, 5::numeric, %L, %L::jsonb)', v_i, v_texto,
    (jsonb_build_array(v_arch -> 0, v_arch -> 1) || pg_temp.archivos(v_plan, v_i, 1))::text));
  v_rep := (v_res2 ->> 'reporte')::uuid;
  perform pg_temp.chequear('enviar el reporte funciona (lo envía la otra persona)', v_rep is not null and (select count(*) from public.pdm_evidencias where reporte_id = v_rep) = 3);
  perform pg_temp.chequear('el borrador y sus filas de archivos desaparecieron en el mismo paso',
    (select count(*) from public.pdm_borradores where indicador_id = v_i) = 0 and (select count(*) from public.pdm_borrador_archivos) = 0);
  perform pg_temp.chequear('los archivos del borrador son ahora evidencias del reporte, con su misma ruta',
    exists (select 1 from public.pdm_evidencias where reporte_id = v_rep and ruta = v_arch -> 0 ->> 'ruta')
    and exists (select 1 from public.pdm_evidencias where reporte_id = v_rep and ruta = v_arch -> 1 ->> 'ruta'));

  -- Una ruta que ya es evidencia de un reporte no entra a un borrador.
  v_msg := pg_temp.fallo_guardar(v_r, v_i, 0, '5', v_texto, null, '{}', jsonb_build_array(v_arch -> 0));
  perform pg_temp.chequear('un archivo que ya es evidencia de un reporte no se puede meter a un borrador', v_msg like '23505 PDM: uno de esos archivos ya está en un reporte%');

  -- ══ Corregir: un borrador que conserva archivos de la versión anterior ═══
  select e.id into v_ev from public.pdm_evidencias e where e.reporte_id = v_rep order by e.ruta limit 1;
  v_arch2 := pg_temp.archivos(v_plan, v_i, 1);
  v_res := pg_temp.guardar(v_r, v_i, 0, '7', v_texto, 'Se agrega el taller que faltaba al reporte', array[v_ev]::text, v_arch2);
  perform pg_temp.chequear('se guarda un borrador de corrección que conserva un archivo de la versión pendiente',
    (v_res ->> 'version')::int = 1 and (select cardinality(b.conservar) = 1 and b.motivo is not null from public.pdm_borradores b where b.indicador_id = v_i and b.anio = 2026));
  v_res2 := pg_temp.como(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 7::numeric, %L, %L::jsonb, %L, %L::uuid[])',
    v_i, v_texto, v_arch2::text, 'Se agrega el taller que faltaba al reporte', array[v_ev]::text));
  v_rep2 := (v_res2 ->> 'reporte')::uuid;
  perform pg_temp.chequear('enviar la corrección funciona y conserva el archivo', v_rep2 is not null and (v_res2 ->> 'correccion')::boolean and (v_res2 ->> 'conservadas')::int = 1);
  perform pg_temp.chequear('y también borra ese borrador', (select count(*) from public.pdm_borradores where indicador_id = v_i) = 0 and (select count(*) from public.pdm_borrador_archivos) = 0);

  -- Enviar sin borrador sigue funcionando (el camino de siempre).
  v_res2 := pg_temp.como(v_r, format('select public.pdm_reportar(%L::uuid, 2026, 8::numeric, %L, %L::jsonb, %L, %L::uuid[])',
    v_i, v_texto, pg_temp.archivos(v_plan, v_i, 1)::text, 'Se agrega más evidencia sin borrador', '{}'));
  perform pg_temp.chequear('enviar un reporte sin borrador funciona igual que antes', (v_res2 ->> 'reporte') is not null);

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-BORRADOR: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
