-- ============================================================================
-- Pruebas de las CONSTANCIAS de reportes y su verificación pública (migración 072).
--
-- Qué comprueba, con las MISMAS funciones que usa la pantalla (reportar, validar, anular, restaurar) y llamando las de la
-- migración como las llamaría la aplicación (con la clave de servicio):
--
--   · Que cada versión de un reporte recibe un código `PDM-XXXX-XXXX` estable (pedirlo dos veces da el mismo), que no se
--     repite entre versiones, que su forma está vigilada por la base y que no se puede emitir para una versión que no existe.
--   · Que lo público dice la verdad VIVA: pendiente, aprobado, devuelto, anulado y restaurado; si la versión es la vigente
--     o hay una más reciente (con su código y su estado); que una versión aprobada y luego reemplazada sigue diciendo
--     «aprobado» de sí misma; que anular la más reciente devuelve la vigencia a la anterior.
--   · Que lo público NO dice nada de lo que se acordó callar: ni el texto del reporte, ni el comentario de una devolución,
--     ni el motivo de una anulación, ni nombres de archivo ni rutas, ni identificadores de personas. Se mira el resultado
--     real, llave por llave.
--   · Que la huella de cada archivo sale tal cual está (y «nula» si no se calculó, nunca inventada).
--   · Que ni el público (`anon`) ni quien tiene sesión (`authenticated`) alcanzan la tabla ni las dos funciones, y que
--     la tabla solo crece (nadie cambia ni borra un código impreso).
--
-- Cómo se corre: DESPUÉS de aplicar la 072 (y teniendo aplicada la 068), pegar el archivo entero en el editor SQL de Supabase (o
-- por la herramienta de la sesión). NO DEJA NADA ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un
-- error a propósito, y Postgres deshace la transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-CONSTANCIAS: N
-- comprobaciones, 0 fallas» y la lista. La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la migración sin su `begin` ni su `commit`, y a continuación
-- este archivo. Todo queda en la misma transacción y se deshace.
--
-- No lleva identificadores de personas: elige del propio contenido de la base a un administrador, una persona de una
-- secretaría con indicadores (su coordinadora) y una persona activa más sin acceso (la que reporta). Todas reciben su acceso
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

-- Lo mismo, con la CLAVE DE SERVICIO (lo que usa el servidor de la aplicación).
create or replace function pg_temp.servicio(p_sql text) returns jsonb
language plpgsql as $f$
declare r jsonb;
begin
  execute 'set local role service_role';
  begin
    execute p_sql into r;
  exception when others then
    execute 'reset role';
    raise;
  end;
  execute 'reset role';
  return r;
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

create or replace function pg_temp.fallo_servicio(p_sql text) returns text
language plpgsql as $f$
begin
  perform pg_temp.servicio(p_sql);
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;

create or replace function pg_temp.fallo_anon(p_sql text) returns text
language plpgsql as $f$
begin
  execute 'set local role anon';
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    return sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  return null;
end $f$;

-- Quien tiene el indicador a su cargo reporta (con una evidencia de verdad: la ruta, el tipo y el tamaño que la base exige).
create or replace function pg_temp.reportar(p_uid uuid, p_ind uuid, p_plan uuid, p_anio int, p_valor numeric, p_texto text, p_motivo text default null) returns uuid
language sql as $f$
  select (pg_temp.como(p_uid, format('select public.pdm_reportar(%L::uuid, %s, %s::numeric, %L, %L::jsonb, %L)',
    p_ind, p_anio, p_valor, p_texto,
    jsonb_build_array(jsonb_build_object(
      'ruta', p_plan::text || '/' || p_ind::text || '/' || p_anio::text || '/' || gen_random_uuid()::text || '/secreto-del-contratista.pdf',
      'nombre', 'cedula-de-juan-perez.pdf', 'tipo', 'application/pdf', 'bytes', 1000))::text,
    p_motivo)) ->> 'reporte')::uuid
$f$;

create or replace function pg_temp.validar(p_uid uuid, p_rep uuid, p_estado text, p_com text default null) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_validar(%L::uuid, %L, %L)', p_rep, p_estado, p_com)) $f$;

create or replace function pg_temp.anular(p_uid uuid, p_rep uuid, p_mot text) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_anular_reporte(%L::uuid, %L)', p_rep, p_mot)) $f$;

create or replace function pg_temp.restaurar(p_uid uuid, p_rep uuid, p_mot text) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_restaurar_reporte(%L::uuid, %L)', p_rep, p_mot)) $f$;

-- Pide el código de una versión (lo que hace la aplicación la primera vez que alguien pide la constancia).
create or replace function pg_temp.emitir(p_rep uuid, p_codigo text) returns text
language sql as $f$ select pg_temp.servicio(format('select to_jsonb(public.pdm_constancia_emitir(%L::uuid, %L))', p_rep, p_codigo)) #>> '{}' $f$;

-- Lo que la página pública sabe de un código.
create or replace function pg_temp.publica(p_codigo text) returns jsonb
language sql as $f$ select pg_temp.servicio(format('select public.pdm_constancia_publica(%L)', p_codigo)) $f$;

do $$
declare
  v_admin uuid; v_c uuid; v_r uuid; v_dep uuid; v_depn text; v_i uuid; v_plan uuid;
  r1 uuid; r2 uuid; r3 uuid; k1 text; k2 text; k3 text; j1 jsonb; j2 jsonb; v_t text;
  v_msg text; v_n int; v_hash constant text := repeat('ab', 32);
  v_mot constant text := 'Prueba automática de constancias';
  v_texto constant text := 'Se capacitó a doce madres cabeza de familia del barrio Los Almendros.';
  v_com constant text := 'Falta la lista de asistencia del taller de abril';
  v_anul constant text := 'Se reportó el valor en el indicador equivocado';
  v_resultado text; v_fallas int; v_total int;
begin
  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-CONSTANCIAS: no hay un administrador activo para probar'; end if;

  select u.id, u.dependencia_id into v_c, v_dep
  from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id is not null
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    and exists (select 1 from public.pdm_indicadores i where i.dependencia_id = u.dependencia_id and i.activo)
  order by u.id limit 1;
  if v_c is null then raise exception 'PDM-CONSTANCIAS: falta una persona de una secretaría con indicadores y sin acceso'; end if;
  select nombre into v_depn from public.dependencias where id = v_dep;

  -- Un indicador de esa secretaría con meta en 2026 y sin reportes ese año.
  select i.id, i.plan_id into v_i, v_plan
  from public.pdm_indicadores i join public.pdm_metas m on m.indicador_id = i.id and m.anio = 2026 and m.meta > 0
  where i.dependencia_id = v_dep and i.activo
    and not exists (select 1 from public.pdm_reportes r where r.indicador_id = i.id and r.anio = 2026)
  order by i.id limit 1;
  if v_i is null then raise exception 'PDM-CONSTANCIAS: la secretaría de prueba no tiene un indicador con meta en 2026 y sin reportes'; end if;

  select u.id into v_r from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.id <> v_c
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
  order by u.id limit 1;
  if v_r is null then raise exception 'PDM-CONSTANCIAS: falta una persona activa sin acceso que reporte'; end if;

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i, v_r, v_mot));

  -- ══ El código de una versión ═════════════════════════════════════════════
  r1 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 10, v_texto);
  perform pg_temp.chequear('quien tiene el indicador reporta', r1 is not null);
  -- La huella de su archivo (el servidor la anota al subirlo; aquí se escribe donde faltaba, como permite la 070).
  update public.pdm_evidencias set sha256 = v_hash, huella_calculada_en = clock_timestamp() where reporte_id = r1;

  k1 := pg_temp.emitir(r1, 'PDM-AAAA-BBBB');
  perform pg_temp.chequear('se emite el código pedido para una versión que no lo tenía', k1 = 'PDM-AAAA-BBBB');
  perform pg_temp.chequear('pedirlo otra vez, aun con otro candidato, da el MISMO código (el impreso no cambia)', pg_temp.emitir(r1, 'PDM-CCCC-DDDD') = k1);
  perform pg_temp.chequear('y no quedó un segundo código para la versión',
    (select count(*) from public.pdm_constancias where reporte_id = r1) = 1);

  -- ══ Lo que dice lo público: pendiente ════════════════════════════════════
  j1 := pg_temp.publica(k1);
  perform pg_temp.chequear('una versión sin validar dice «pendiente»', j1->>'estado' = 'pendiente');
  perform pg_temp.chequear('y es la vigente, sin versión más reciente', (j1->>'vigente')::boolean and j1->'mas_reciente' = 'null'::jsonb);
  perform pg_temp.chequear('sin validación ni anulación', j1->'validacion' = 'null'::jsonb and j1->'anulacion' = 'null'::jsonb);
  perform pg_temp.chequear('dice el indicador, la secretaría, el año y la meta',
    (j1#>>'{indicador,anio}')::int = 2026 and j1#>>'{indicador,dependencia}' = v_depn
    and (j1#>>'{indicador,meta}')::numeric = (select meta from public.pdm_metas where indicador_id = v_i and anio = 2026)
    and j1#>>'{indicador,nombre}' = (select indicador from public.pdm_indicadores where id = v_i));
  perform pg_temp.chequear('dice el valor reportado y quién lo reportó',
    (j1#>>'{reporte,valor}')::numeric = 10 and coalesce(j1#>>'{reporte,autor}', '') <> '' and (j1#>>'{reporte,es_correccion}')::boolean = false);
  perform pg_temp.chequear('dice sus archivos por tipo, tamaño y huella, tal cual están',
    jsonb_array_length(j1->'archivos') = 1 and j1#>>'{archivos,0,tipo}' = 'application/pdf'
    and (j1#>>'{archivos,0,bytes}')::int = 1000 and j1#>>'{archivos,0,sha256}' = v_hash);

  -- ══ Lo que NO dice ═══════════════════════════════════════════════════════
  v_t := j1::text;
  perform pg_temp.chequear('no dice el texto del reporte', position('madres cabeza' in v_t) = 0);
  perform pg_temp.chequear('no dice nombres de archivo ni rutas', position('cedula-de-juan-perez' in v_t) = 0 and position('secreto-del-contratista' in v_t) = 0 and position('"ruta"' in v_t) = 0);
  perform pg_temp.chequear('no trae identificadores de personas ni la llave del reporte',
    position('autor_id' in v_t) = 0 and position('validador_id' in v_t) = 0 and position('reporte_id' in v_t) = 0 and position(v_r::text in v_t) = 0 and position(r1::text in v_t) = 0);
  perform pg_temp.chequear('la forma de lo público es exactamente la acordada (llaves de primer nivel)',
    (select array_agg(k order by k) from jsonb_object_keys(j1) k)
      = array['anulacion', 'archivos', 'codigo', 'creada_en', 'estado', 'indicador', 'mas_reciente', 'reporte', 'validacion', 'vigente']);
  perform pg_temp.chequear('y la de cada archivo',
    (select array_agg(k order by k) from jsonb_object_keys(j1#>'{archivos,0}') k) = array['bytes', 'huella_calculada_en', 'sha256', 'tipo']);

  -- ══ Aprobado, y luego reemplazado por una versión más reciente ═══════════
  perform pg_temp.validar(v_c, r1, 'aprobado');
  j1 := pg_temp.publica(k1);
  perform pg_temp.chequear('aprobado: lo dice, con quién y cuándo', j1->>'estado' = 'aprobado' and j1#>>'{validacion,estado}' = 'aprobado'
    and coalesce(j1#>>'{validacion,validador}', '') <> '' and j1#>>'{validacion,fecha}' is not null);

  r2 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 25, v_texto || ' (segundo avance)');
  k2 := pg_temp.emitir(r2, 'PDM-EEEE-FFFF');
  perform pg_temp.chequear('cada versión tiene su propio código', k2 <> k1 and k2 = 'PDM-EEEE-FFFF');
  j2 := pg_temp.publica(k2);
  j1 := pg_temp.publica(k1);
  perform pg_temp.chequear('la versión nueva está pendiente y es la vigente', j2->>'estado' = 'pendiente' and (j2->>'vigente')::boolean);
  perform pg_temp.chequear('la anterior sigue diciendo «aprobado» de sí misma, pero ya no es la vigente',
    j1->>'estado' = 'aprobado' and not (j1->>'vigente')::boolean);
  perform pg_temp.chequear('y dice cuál es la más reciente: su código, su estado y cuándo',
    j1#>>'{mas_reciente,codigo}' = k2 and j1#>>'{mas_reciente,estado}' = 'pendiente' and j1#>>'{mas_reciente,reportado_en}' is not null);
  perform pg_temp.chequear('un archivo sin huella calculada sale con huella nula, nunca inventada', j2#>'{archivos,0,sha256}' = 'null'::jsonb);

  -- ══ Devuelto (con comentario que NO se publica) ══════════════════════════
  perform pg_temp.validar(v_c, r2, 'devuelto', v_com);
  j2 := pg_temp.publica(k2);
  j1 := pg_temp.publica(k1);
  perform pg_temp.chequear('devuelto: lo dice', j2->>'estado' = 'devuelto' and j2#>>'{validacion,estado}' = 'devuelto');
  perform pg_temp.chequear('el comentario de la devolución no se publica', position('lista de asistencia' in j2::text) = 0 and position('lista de asistencia' in j1::text) = 0);
  perform pg_temp.chequear('la versión anterior ve el estado de la más reciente (devuelto)', j1#>>'{mas_reciente,estado}' = 'devuelto');

  -- ══ Anulado y restaurado (con motivo que NO se publica) ══════════════════
  perform pg_temp.anular(v_admin, r2, v_anul);
  j2 := pg_temp.publica(k2);
  j1 := pg_temp.publica(k1);
  perform pg_temp.chequear('anulado: lo dice, y que ya no es la vigente', j2->>'estado' = 'anulado' and not (j2->>'vigente')::boolean);
  perform pg_temp.chequear('dice QUE se anuló y cuándo, no por qué ni quién',
    j2#>>'{anulacion,accion}' = 'anular' and j2#>>'{anulacion,fecha}' is not null
    and (select array_agg(k order by k) from jsonb_object_keys(j2->'anulacion') k) = array['accion', 'fecha']
    and position('equivocado' in j2::text) = 0 and position('equivocado' in j1::text) = 0);
  perform pg_temp.chequear('anulada la más reciente, la anterior vuelve a ser la vigente y no tiene versión más reciente',
    (j1->>'vigente')::boolean and j1->'mas_reciente' = 'null'::jsonb);

  perform pg_temp.restaurar(v_admin, r2, 'Se anuló por error, el valor era correcto');
  j2 := pg_temp.publica(k2);
  j1 := pg_temp.publica(k1);
  perform pg_temp.chequear('restaurado: vuelve a su estado (devuelto), lo dice y es otra vez la vigente',
    j2->>'estado' = 'devuelto' and j2#>>'{anulacion,accion}' = 'restaurar' and (j2->>'vigente')::boolean);
  perform pg_temp.chequear('y la anterior deja de ser la vigente', not (j1->>'vigente')::boolean and j1#>>'{mas_reciente,codigo}' = k2);

  -- ══ Cómo se busca un código ══════════════════════════════════════════════
  perform pg_temp.chequear('el código se encuentra escrito en minúsculas y con espacios alrededor', pg_temp.publica('  ' || lower(k1) || ' ') = pg_temp.publica(k1));
  perform pg_temp.chequear('un código que no existe no devuelve nada', pg_temp.servicio('select public.pdm_constancia_publica(''PDM-ZZZZ-ZZZZ'')') is null);
  perform pg_temp.chequear('ni uno vacío, ni nulo, ni de otro tipo de documento',
    pg_temp.servicio('select public.pdm_constancia_publica('''')') is null and pg_temp.servicio('select public.pdm_constancia_publica(null)') is null
    and pg_temp.servicio('select public.pdm_constancia_publica(''CD-AAAA-BBBB'')') is null);

  -- ══ Lo que la base vigila al emitir ══════════════════════════════════════
  -- Un reporte después de uno devuelto es una corrección de él: dice qué corrige.
  r3 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 30, v_texto || ' (tercer avance)', 'Corrijo el valor según el soporte');
  v_msg := pg_temp.fallo_servicio(format('select public.pdm_constancia_emitir(%L::uuid, %L)', r3, k1));
  perform pg_temp.chequear('un código que ya es de otra versión se rechaza (la llave primaria)', v_msg like '23505%');
  foreach v_t in array array['CD-AAAA-BBBB', 'pdm-aaaa-bbbb', 'PDM-AAAA-BBB', 'PDM-AAAAA-BBBB', 'PDM-IIII-OOOO', 'PDM-AAAA_BBBB', ' PDM-AAAA-BBBB'] loop
    v_msg := pg_temp.fallo_servicio(format('select public.pdm_constancia_emitir(%L::uuid, %L)', r3, v_t));
    perform pg_temp.chequear('el código «' || v_t || '» no tiene la forma exigida y se rechaza', v_msg like '23514%');
  end loop;
  v_msg := pg_temp.fallo_servicio(format('select public.pdm_constancia_emitir(%L::uuid, %L)', gen_random_uuid(), 'PDM-GGGG-HHHH'));
  perform pg_temp.chequear('no se emite para una versión que no existe', v_msg like '23503%');
  k3 := pg_temp.emitir(r3, 'PDM-JJJJ-KKKK');
  perform pg_temp.chequear('con un código bueno y libre sí se emite', k3 = 'PDM-JJJJ-KKKK');
  perform pg_temp.chequear('y no se perdió nada: hay tres constancias', (select count(*) from public.pdm_constancias where reporte_id in (r1, r2, r3)) = 3);

  -- ══ La tabla solo crece ══════════════════════════════════════════════════
  v_msg := pg_temp.fallo_servicio(format('update public.pdm_constancias set codigo = %L where codigo = %L', 'PDM-MMMM-NNNN', k1));
  perform pg_temp.chequear('ni siquiera la clave de servicio cambia un código', v_msg like '42501%');
  v_msg := pg_temp.fallo_servicio(format('delete from public.pdm_constancias where codigo = %L', k1));
  perform pg_temp.chequear('ni lo borra', v_msg like '42501%');
  begin
    update public.pdm_constancias set creada_en = clock_timestamp() where codigo = k1;
    v_msg := null;
  exception when others then v_msg := sqlstate || ' ' || sqlerrm; end;
  perform pg_temp.chequear('el disparador lo impide también al dueño de la tabla, con su frase', v_msg like '42501%no se cambia ni se borra%');
  begin
    delete from public.pdm_constancias where codigo = k1;
    v_msg := null;
  exception when others then v_msg := sqlstate || ' ' || sqlerrm; end;
  perform pg_temp.chequear('y el borrado', v_msg like '42501%no se cambia ni se borra%');
  begin
    truncate public.pdm_constancias;
    v_msg := null;
  exception when others then v_msg := sqlstate || ' ' || sqlerrm; end;
  perform pg_temp.chequear('y vaciar la tabla', v_msg like '42501%no se cambia ni se borra%');

  -- ══ Quién alcanza qué ════════════════════════════════════════════════════
  v_msg := pg_temp.fallo_anon('select * from public.pdm_constancias');
  perform pg_temp.chequear('el público no lee la tabla', v_msg like '42501%');
  v_msg := pg_temp.fallo_de(v_c, 'select * from public.pdm_constancias');
  perform pg_temp.chequear('ni la secretaría', v_msg like '42501%');
  v_msg := pg_temp.fallo_de(v_admin, 'select * from public.pdm_constancias');
  perform pg_temp.chequear('ni el administrador con su sesión (solo el servidor)', v_msg like '42501%');
  v_msg := pg_temp.fallo_de(v_admin, format('insert into public.pdm_constancias (codigo, reporte_id) values (%L, %L::uuid)', 'PDM-PPPP-QQQQ', r1));
  perform pg_temp.chequear('nadie con sesión escribe un código a mano', v_msg like '42501%');
  v_msg := pg_temp.fallo_anon(format('select public.pdm_constancia_publica(%L)', k1));
  perform pg_temp.chequear('el público no llama la función pública directamente (solo el servidor la llama)', v_msg like '42501%');
  v_msg := pg_temp.fallo_de(v_c, format('select public.pdm_constancia_publica(%L)', k1));
  perform pg_temp.chequear('ni la secretaría', v_msg like '42501%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_constancia_publica(%L)', k1));
  perform pg_temp.chequear('ni el administrador', v_msg like '42501%');
  v_msg := pg_temp.fallo_anon(format('select public.pdm_constancia_emitir(%L::uuid, %L)', r1, 'PDM-RRRR-SSSS'));
  perform pg_temp.chequear('el público no emite códigos', v_msg like '42501%');
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_constancia_emitir(%L::uuid, %L)', r1, 'PDM-RRRR-SSSS'));
  perform pg_temp.chequear('ni quien reportó (la emisión la hace el servidor, tras comprobar quién la pide)', v_msg like '42501%');

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-CONSTANCIAS: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
