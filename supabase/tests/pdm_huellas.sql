-- ============================================================================
-- Pruebas de la HUELLA (SHA-256) de las evidencias del módulo Plan de Desarrollo (migración 070).
--
-- Qué comprueba, con las MISMAS funciones que usa la pantalla (reportar, validar) y con la sesión de cada persona:
--
--   · Que una evidencia recibe la huella que el SERVIDOR anotó en el libro (`pdm_huellas`) para ese archivo, con la fecha
--     en que la calculó, y que la vista de evidencias la muestra a quien ve el reporte.
--   · Que NUNCA se cree lo que diga quien sube: ni una huella dentro de lo que manda a `pdm_reportar`, ni una huella en un
--     INSERT directo sobre `pdm_evidencias`. Sin nada anotado, la evidencia queda sin huella (no con una inventada).
--   · Que la huella anotada solo vale para ESE archivo (misma ruta), ESE tamaño y ESA persona.
--   · Que una evidencia conservada en una corrección hereda la huella y la fecha de la original.
--   · Que una huella escrita no se cambia ni se borra, pero sí se puede escribir donde faltaba (una vez), y que el formato
--     (64 hex en minúscula) y la pareja huella-fecha las impone la base.
--   · Que quien tiene sesión no lee ni escribe el libro, ni actualiza evidencias.
--
-- Cómo se corre: DESPUÉS de aplicar la 070, pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de
-- la sesión). NO DEJA NADA ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito,
-- y Postgres deshace la transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-HUELLAS: N comprobaciones,
-- 0 fallas» y la lista. La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la migración sin su `begin` ni su `commit`, y a
-- continuación este archivo. Todo queda en la misma transacción y se deshace.
--
-- No lleva identificadores de personas: elige del propio contenido de la base a un administrador, una persona de una
-- secretaría con indicadores (será su coordinadora) y dos personas activas más sin acceso (quien reporta y otra). Todas
-- reciben su acceso dentro de la transacción, que se deshace. Las huellas anotadas las escribe este bloque como lo
-- haría el servidor con la clave de servicio.
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

-- Lo que dice una instrucción que corre con los permisos de quien ejecuta el bloque (como la clave de servicio) y debe fallar.
create or replace function pg_temp.fallo_directo(p_sql text) returns text
language plpgsql as $f$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;

-- Un escalar (como texto) que lee esa persona.
create or replace function pg_temp.una(p_uid uuid, p_sql text) returns text
language sql as $f$
  select case when jsonb_typeof(x) = 'number' then trim_scale((x #>> '{}')::numeric)::text else x #>> '{}' end
  from (select pg_temp.como(p_uid, p_sql) as x) s
$f$;

create or replace function pg_temp.n(p_uid uuid, p_desde text) returns int
language sql as $f$ select (pg_temp.como(p_uid, 'select to_jsonb(count(*)) ' || p_desde))::text::int $f$;

-- Una ruta nueva, con la forma que la base exige ({plan}/{indicador}/{año}/{uuid}.pdf).
create or replace function pg_temp.ruta(p_plan uuid, p_ind uuid, p_anio int) returns text
language sql as $f$ select p_plan::text || '/' || p_ind::text || '/' || p_anio::text || '/' || gen_random_uuid()::text || '.pdf' $f$;

-- Una evidencia en el formato que manda la pantalla.
create or replace function pg_temp.evid(p_ruta text, p_bytes bigint default 1000, p_extra jsonb default '{}') returns jsonb
language sql as $f$
  select jsonb_build_object('ruta', p_ruta, 'nombre', 'soporte.pdf', 'tipo', 'application/pdf', 'bytes', p_bytes) || p_extra
$f$;

-- Reportar COMO esa persona. Devuelve el id del reporte.
create or replace function pg_temp.rep(p_uid uuid, p_ind uuid, p_anio int, p_valor numeric, p_evid jsonb,
                                       p_conservar uuid[] default '{}', p_motivo text default null) returns uuid
language sql as $f$
  select (pg_temp.como(p_uid, format('select public.pdm_reportar(%L::uuid, %s, %s::numeric, %L, %L::jsonb, %L, %L::uuid[])',
    p_ind, p_anio, p_valor, 'Se hizo una actividad de prueba para este indicador.', p_evid::text, p_motivo, p_conservar::text)) ->> 'reporte')::uuid
$f$;

create or replace function pg_temp.validar(p_uid uuid, p_rep uuid, p_estado text, p_com text default null) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_validar(%L::uuid, %L, %L)', p_rep, p_estado, p_com)) $f$;

-- Lo que el servidor anota en el libro tras calcular la huella de un archivo.
create or replace function pg_temp.anotar(p_ruta text, p_hex text, p_bytes bigint, p_uid uuid) returns void
language sql as $f$ insert into public.pdm_huellas (ruta, sha256, bytes, usuario_id) values (p_ruta, p_hex, p_bytes, p_uid) $f$;

do $$
declare
  v_admin uuid; v_c uuid; v_r uuid; v_o uuid; v_dep uuid; v_i uuid; v_plan uuid; v_p uuid[];
  h1 constant text := encode(sha256('contenido uno'::bytea), 'hex');
  h2 constant text := encode(sha256('contenido dos'::bytea), 'hex');
  h6 constant text := encode(sha256('contenido seis'::bytea), 'hex');
  forjada constant text := repeat('f', 64);
  ru1 text; ru3 text; ru4 text; ru5 text; ru6 text; ru7 text;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r6 uuid; r7 uuid; e1 uuid; e2 uuid; e6 uuid; e7 uuid;
  v_fecha timestamptz; v_msg text; v_mot constant text := 'Prueba automática de la huella';
  v_resultado text; v_fallas int; v_total int;
begin
  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-HUELLAS: no hay un administrador activo para probar'; end if;

  select u.id, u.dependencia_id into v_c, v_dep
  from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id is not null
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    and exists (select 1 from public.pdm_indicadores i where i.dependencia_id = u.dependencia_id and i.activo)
  order by u.id limit 1;
  if v_c is null then raise exception 'PDM-HUELLAS: falta una persona de una secretaría con indicadores y sin acceso'; end if;

  select i.id, i.plan_id into v_i, v_plan
  from public.pdm_indicadores i
  where i.dependencia_id = v_dep and i.activo
  order by exists (select 1 from public.pdm_asignaciones a where a.indicador_id = i.id), i.id
  limit 1;

  select array_agg(id) into v_p from (
    select u.id from public.usuarios u
    where u.activo and u.rol::text <> 'admin' and u.id <> v_c
      and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
      and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
      and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    order by u.id limit 2) q;
  if v_p is null or cardinality(v_p) < 2 then raise exception 'PDM-HUELLAS: faltan dos personas activas sin acceso'; end if;
  v_r := v_p[1]; v_o := v_p[2];

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_o, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i, v_r, v_mot));

  perform pg_temp.chequear('no hay reportes de este indicador al empezar', (select count(*) from public.pdm_reportes where indicador_id = v_i) = 0);

  -- ══ El libro: solo la clave de servicio ══════════════════════════════════
  perform pg_temp.chequear('el libro de huellas empieza vacío', (select count(*) from public.pdm_huellas) = 0);
  v_msg := pg_temp.fallo_de(v_r, 'select to_jsonb(count(*)) from public.pdm_huellas');
  perform pg_temp.chequear('quien tiene sesión no lee el libro', v_msg like '42501%');
  v_msg := pg_temp.fallo_de(v_admin, 'select to_jsonb(count(*)) from public.pdm_huellas');
  perform pg_temp.chequear('ni siquiera el administrador con sesión', v_msg like '42501%');
  v_msg := pg_temp.fallo_de_correr(v_r, format('insert into public.pdm_huellas (ruta, sha256, bytes, usuario_id) values (%L, %L, 1000, %L)', 'x/y/z.pdf', h1, v_r));
  perform pg_temp.chequear('quien tiene sesión no escribe en el libro', v_msg like '42501%');
  v_msg := pg_temp.fallo_directo(format('insert into public.pdm_huellas (ruta, sha256, bytes, usuario_id) values (%L, %L, 1000, %L)', 'x/y/z.pdf', 'no-es-una-huella', v_r));
  perform pg_temp.chequear('el libro rechaza una huella mal formada', v_msg like '23514%');
  v_msg := pg_temp.fallo_directo(format('insert into public.pdm_huellas (ruta, sha256, bytes, usuario_id) values (%L, %L, 1000, %L)', 'x/y/z.pdf', upper(h1), v_r));
  perform pg_temp.chequear('y una en mayúscula (el formato es uno solo)', v_msg like '23514%');
  v_msg := pg_temp.fallo_directo(format('insert into public.pdm_huellas (ruta, sha256, bytes, usuario_id) values (%L, %L, 0, %L)', 'x/y/z.pdf', h1, v_r));
  perform pg_temp.chequear('y un archivo de cero bytes', v_msg like '23514%');

  -- ══ Con la huella anotada por el servidor ═══════════════════════════════
  ru1 := pg_temp.ruta(v_plan, v_i, 2026);
  perform pg_temp.anotar(ru1, h1, 1000, v_r);
  r1 := pg_temp.rep(v_r, v_i, 2026, 10, jsonb_build_array(pg_temp.evid(ru1)));
  select id, huella_calculada_en into e1, v_fecha from public.pdm_evidencias where reporte_id = r1;
  perform pg_temp.chequear('la evidencia recibe la huella que anotó el servidor', (select sha256 from public.pdm_evidencias where id = e1) = h1);
  perform pg_temp.chequear('y la fecha en que la calculó', v_fecha is not null and v_fecha = (select calculada_en from public.pdm_huellas where ruta = ru1));
  perform pg_temp.chequear('quien reportó la ve en la vista', pg_temp.una(v_r, format('select to_jsonb(sha256) from public.pdm_evidencias_vista where id = %L', e1)) = h1);
  perform pg_temp.chequear('la secretaría también', pg_temp.una(v_c, format('select to_jsonb(sha256) from public.pdm_evidencias_vista where id = %L', e1)) = h1);
  perform pg_temp.chequear('la vista trae la fecha del cálculo', pg_temp.n(v_c, format('from public.pdm_evidencias_vista where id = %L and huella_calculada_en is not null', e1)) = 1);

  -- Lo que diga quien sube NO se cree: un INSERT directo con otra huella se queda con la anotada (o sin ninguna)
  v_msg := pg_temp.fallo_de_correr(v_r, format(
    'insert into public.pdm_evidencias (reporte_id, ruta, nombre, tipo, bytes, subido_por, sha256, huella_calculada_en) values (%L, %L, ''otro.pdf'', ''application/pdf'', 500, %L, %L, now())',
    r1, pg_temp.ruta(v_plan, v_i, 2026), v_r, forjada));
  perform pg_temp.chequear('quien reporta puede agregar un archivo a su reporte sin validar…', v_msg is null);
  perform pg_temp.chequear('…pero la huella que traiga la fila se ignora (queda sin huella)',
    (select sha256 is null and huella_calculada_en is null from public.pdm_evidencias where reporte_id = r1 and nombre = 'otro.pdf'));
  v_msg := pg_temp.fallo_de_correr(v_r, format('update public.pdm_evidencias set sha256 = %L, huella_calculada_en = now() where id = %L', forjada, e1));
  perform pg_temp.chequear('quien tiene sesión no actualiza evidencias', v_msg like '42501%');
  perform pg_temp.chequear('la huella de la evidencia sigue siendo la del servidor', (select sha256 from public.pdm_evidencias where id = e1) = h1);

  perform pg_temp.validar(v_c, r1, 'aprobado');

  -- ══ Sin nada anotado: sin huella, y el reporte se registra igual ═════════
  r2 := pg_temp.rep(v_r, v_i, 2026, 20, jsonb_build_array(pg_temp.evid(pg_temp.ruta(v_plan, v_i, 2026))));
  perform pg_temp.chequear('sin huella anotada el reporte se registra', r2 is not null);
  select id into e2 from public.pdm_evidencias where reporte_id = r2;
  perform pg_temp.chequear('y la evidencia queda sin huella ni fecha', (select sha256 is null and huella_calculada_en is null from public.pdm_evidencias where id = e2));
  perform pg_temp.chequear('la vista lo dice (sin huella)', pg_temp.n(v_r, format('from public.pdm_evidencias_vista where id = %L and sha256 is null', e2)) = 1);
  perform pg_temp.validar(v_c, r2, 'aprobado');

  -- ══ Una huella que viaja en lo que manda quien reporta no cuenta ═════════
  ru3 := pg_temp.ruta(v_plan, v_i, 2026);
  r3 := pg_temp.rep(v_r, v_i, 2026, 30, jsonb_build_array(pg_temp.evid(ru3, 1000, jsonb_build_object('sha256', forjada, 'huella_calculada_en', now()))));
  perform pg_temp.chequear('una huella forjada dentro de lo que se manda a pdm_reportar se ignora',
    (select sha256 is null and huella_calculada_en is null from public.pdm_evidencias where reporte_id = r3));
  perform pg_temp.validar(v_c, r3, 'aprobado');

  -- ══ La huella anotada solo vale para ese archivo, ese tamaño y esa persona ═
  ru4 := pg_temp.ruta(v_plan, v_i, 2026);
  perform pg_temp.anotar(ru4, h2, 999, v_r);   -- el servidor midió 999 bytes
  r4 := pg_temp.rep(v_r, v_i, 2026, 40, jsonb_build_array(pg_temp.evid(ru4, 1000)));   -- el reporte dice 1000
  perform pg_temp.chequear('con otro tamaño, sin huella (no se arriesga una huella de otro contenido)',
    (select sha256 is null from public.pdm_evidencias where reporte_id = r4));
  perform pg_temp.validar(v_c, r4, 'aprobado');

  ru5 := pg_temp.ruta(v_plan, v_i, 2026);
  perform pg_temp.anotar(ru5, h2, 1000, v_o);   -- anotada para OTRA persona
  r5 := pg_temp.rep(v_r, v_i, 2026, 50, jsonb_build_array(pg_temp.evid(ru5, 1000)));
  perform pg_temp.chequear('anotada para otra persona, sin huella', (select sha256 is null from public.pdm_evidencias where reporte_id = r5));
  perform pg_temp.validar(v_c, r5, 'aprobado');

  -- ══ Una evidencia conservada hereda la huella y la fecha ═════════════════
  ru6 := pg_temp.ruta(v_plan, v_i, 2026);
  perform pg_temp.anotar(ru6, h6, 1000, v_r);
  r6 := pg_temp.rep(v_r, v_i, 2026, 60, jsonb_build_array(pg_temp.evid(ru6, 1000)));
  select id into e6 from public.pdm_evidencias where reporte_id = r6;
  perform pg_temp.chequear('el reporte a corregir tiene su huella', (select sha256 from public.pdm_evidencias where id = e6) = h6);
  perform pg_temp.validar(v_c, r6, 'devuelto', 'Falta la lista de asistencia del taller');
  ru7 := pg_temp.ruta(v_plan, v_i, 2026);
  perform pg_temp.anotar(ru7, h2, 1000, v_r);
  r7 := pg_temp.rep(v_r, v_i, 2026, 61, jsonb_build_array(pg_temp.evid(ru7, 1000)), array[e6], 'Se corrige y se agrega la lista');
  select id into e7 from public.pdm_evidencias where reporte_id = r7 and copia_de = e6;
  perform pg_temp.chequear('la corrección conserva el archivo anterior', e7 is not null);
  perform pg_temp.chequear('el archivo conservado hereda la huella de la original', (select sha256 from public.pdm_evidencias where id = e7) = h6);
  perform pg_temp.chequear('y la fecha del cálculo', (select huella_calculada_en from public.pdm_evidencias where id = e7) = (select huella_calculada_en from public.pdm_evidencias where id = e6));
  perform pg_temp.chequear('el archivo nuevo de la corrección trae su propia huella',
    (select sha256 from public.pdm_evidencias where reporte_id = r7 and copia_de is null) = h2);
  perform pg_temp.chequear('en la vista, el conservado muestra la huella de la original', pg_temp.una(v_r, format('select to_jsonb(sha256) from public.pdm_evidencias_vista where id = %L', e7)) = h6);

  -- ══ Una huella escrita no se cambia ══════════════════════════════════════
  v_msg := pg_temp.fallo_directo(format('update public.pdm_evidencias set sha256 = %L where id = %L', h2, e1));
  perform pg_temp.chequear('cambiar una huella escrita falla', v_msg like '23514%no se cambia%');
  v_msg := pg_temp.fallo_directo(format('update public.pdm_evidencias set huella_calculada_en = now() where id = %L', e1));
  perform pg_temp.chequear('cambiar solo su fecha también', v_msg like '23514%no se cambia%');
  v_msg := pg_temp.fallo_directo(format('update public.pdm_evidencias set sha256 = null, huella_calculada_en = null where id = %L', e1));
  perform pg_temp.chequear('y borrarla', v_msg like '23514%no se cambia%');
  v_msg := pg_temp.fallo_directo(format('update public.pdm_evidencias set nombre = ''renombrado.pdf'' where id = %L', e1));
  perform pg_temp.chequear('tocar otra columna de la evidencia no se lo impide esta migración (y no cambia la huella)',
    v_msg is null and (select sha256 from public.pdm_evidencias where id = e1) = h1);

  -- Escribirla donde faltaba: una vez, con su fecha, y en el formato de siempre
  v_msg := pg_temp.fallo_directo(format('update public.pdm_evidencias set sha256 = %L where id = %L', h2, e2));
  perform pg_temp.chequear('una huella sin fecha no se escribe (van juntas)', v_msg like '23514%');
  v_msg := pg_temp.fallo_directo(format('update public.pdm_evidencias set sha256 = %L, huella_calculada_en = now() where id = %L', 'XYZ', e2));
  perform pg_temp.chequear('ni una mal formada', v_msg like '23514%');
  v_msg := pg_temp.fallo_directo(format('update public.pdm_evidencias set sha256 = %L, huella_calculada_en = now() where id = %L', h2, e2));
  perform pg_temp.chequear('donde faltaba se puede escribir', v_msg is null and (select sha256 from public.pdm_evidencias where id = e2) = h2);
  v_msg := pg_temp.fallo_directo(format('update public.pdm_evidencias set sha256 = %L, huella_calculada_en = now() where id = %L', h1, e2));
  perform pg_temp.chequear('y una vez escrita ya no se cambia', v_msg like '23514%no se cambia%');

  -- ══ Reglas de la tabla y permisos que no se movieron ═════════════════════
  perform pg_temp.chequear('pdm_evidencias sigue sin permisos de UPDATE ni DELETE para quien tiene sesión',
    not has_table_privilege('authenticated', 'public.pdm_evidencias', 'UPDATE') and not has_table_privilege('authenticated', 'public.pdm_evidencias', 'DELETE'));
  perform pg_temp.chequear('y sin permisos para anon', not has_table_privilege('anon', 'public.pdm_evidencias', 'SELECT') and not has_table_privilege('anon', 'public.pdm_huellas', 'SELECT'));
  perform pg_temp.chequear('pdm_evidencias no tiene columnas con permiso propio (las nuevas heredan el de la tabla)',
    (select count(*) filter (where attacl is not null) from pg_attribute where attrelid = 'public.pdm_evidencias'::regclass and attnum > 0 and not attisdropped) = 0);

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-HUELLAS: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
