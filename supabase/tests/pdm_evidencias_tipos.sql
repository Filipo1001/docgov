-- ============================================================================
-- Pruebas de los TIPOS Y TOPES de evidencia del módulo Plan de Desarrollo (migración 073): presentaciones y video.
--
-- Qué comprueba, con la MISMA función que usa la pantalla (`pdm_reportar`) y con la sesión de quien reporta:
--
--   · Que cada tipo admitido se acepta justo en su tope (25 MB lo que no es video; 100 MB los videos MP4 y MOV, desde la 074) y se rechaza con
--     un byte más, con el mensaje y el código que la pantalla traduce.
--   · Que lo que NO se admite sigue sin admitirse: otros formatos de video (webm, avi), comprimidos, páginas web, un tipo vacío
--     o ausente, un tamaño que no es número, cero, o con más de 12 cifras.
--   · Que la evidencia queda guardada con el tipo que se reportó.
--   · Que la función de límites y el espacio de archivos `pdm-evidencias` dicen exactamente lo mismo (los mismos tipos, ni uno más
--     ni uno menos) y que el espacio quedó privado y de 100 MB.
--   · Que la tabla de evidencias dejó de limitar a 10 MB (tiene su propia restricción), que `anon` no alcanza la función de límites
--     y que `pdm_reportar` conserva sus permisos.
--
-- Cómo se corre: DESPUÉS de aplicar la 073, pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la
-- sesión). NO DEJA NADA ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito, y Postgres
-- deshace la transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-EVIDENCIAS: N comprobaciones, 0 fallas» y la lista.
-- La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la 073 sin su `begin` ni su `commit`, y a continuación este archivo.
-- Todo queda en la misma transacción y se deshace.
--
-- No lleva identificadores de personas: elige del propio contenido de la base a un administrador, una persona de una secretaría con
-- indicadores (será su coordinadora) y a otra persona activa sin acceso (la que reporta). Todas reciben su acceso dentro de la
-- transacción, que se deshace.
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


-- Reporta (como quien tiene el indicador a su cargo) un archivo del tipo y el tamaño que se pidan. `p_bytes` va como TEXTO para poder
-- probar también lo que no es un número. Devuelve el id del reporte, o null si el tipo es 'sin_tipo' y se omite la clave.
create or replace function pg_temp.reportar_archivo(p_uid uuid, p_ind uuid, p_plan uuid, p_valor numeric, p_tipo text, p_bytes text, p_ext text default 'pdf')
returns text
language sql as $f$
  select pg_temp.como(p_uid, format('select public.pdm_reportar(%L::uuid, 2026, %s::numeric, %L, %L::jsonb)',
    p_ind, p_valor, 'Se hizo una actividad de prueba para este indicador.',
    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'ruta', p_plan::text || '/' || p_ind::text || '/2026/' || gen_random_uuid()::text || '.' || p_ext,
      'nombre', 'soporte.' || p_ext, 'tipo', p_tipo, 'bytes', p_bytes)))::text)) ->> 'reporte'
$f$;

do $$
declare
  v_admin uuid; v_c uuid; v_r uuid; v_dep uuid; v_i uuid; v_plan uuid;
  v_msg text; v_rep text; v_valor numeric := 0;
  v_mb constant bigint := 1048576;
  v_mot constant text := 'Prueba automática de tipos de evidencia';
  v_resultado text; v_fallas int; v_total int;
  v_pptx constant text := 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  t record;
begin
  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-EVIDENCIAS: no hay un administrador activo para probar'; end if;

  select u.id, u.dependencia_id into v_c, v_dep
  from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id is not null
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    and exists (select 1 from public.pdm_indicadores i where i.dependencia_id = u.dependencia_id and i.activo)
  order by u.id limit 1;
  if v_c is null then raise exception 'PDM-EVIDENCIAS: falta una persona de una secretaría con indicadores y sin acceso'; end if;

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
  if v_r is null then raise exception 'PDM-EVIDENCIAS: falta una persona activa sin acceso'; end if;

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i, v_r, v_mot));

  -- ══ La función de límites ═════════════════════════════════════════════════
  perform pg_temp.chequear('PDF, fotos, Word, Excel y PowerPoint: 25 MB',
    (select bool_and(pdm_privado.limite_de_evidencia(m) = 25 * v_mb) from unnest(array[
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', v_pptx]) m));
  perform pg_temp.chequear('video MP4 y MOV: 100 MB', pdm_privado.limite_de_evidencia('video/mp4') = 100 * v_mb and pdm_privado.limite_de_evidencia('video/quicktime') = 100 * v_mb);
  perform pg_temp.chequear('lo desconocido no tiene tope (no se admite)',
    (select bool_and(pdm_privado.limite_de_evidencia(m) is null) from unnest(array['video/webm', 'video/x-msvideo', 'video/mpeg', 'audio/mpeg', 'application/zip', 'text/html', 'application/octet-stream', 'image/gif', 'image/svg+xml', 'application/x-msdownload', '', 'PDF', 'application/PDF', ' application/pdf']) m));
  perform pg_temp.chequear('un tipo nulo tampoco', pdm_privado.limite_de_evidencia(null) is null);
  perform pg_temp.chequear('anon no alcanza la función de límites', not has_function_privilege('anon', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE'));
  perform pg_temp.chequear('quien tiene sesión y el servidor sí', has_function_privilege('authenticated', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE') and has_function_privilege('service_role', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE'));

  -- ══ El espacio de archivos ════════════════════════════════════════════════
  perform pg_temp.chequear('el espacio es privado y de 100 MB', exists (select 1 from storage.buckets where id = 'pdm-evidencias' and not public and file_size_limit = 100 * v_mb));
  perform pg_temp.chequear('el espacio admite exactamente los tipos de la función (ni uno más)',
    not exists (select 1 from storage.buckets b, unnest(b.allowed_mime_types) mt where b.id = 'pdm-evidencias' and pdm_privado.limite_de_evidencia(mt) is null));
  perform pg_temp.chequear('…ni uno menos',
    (select count(*) from storage.buckets b, unnest(b.allowed_mime_types) mt where b.id = 'pdm-evidencias' and pdm_privado.limite_de_evidencia(mt) is not null) = 14);

  perform pg_temp.chequear('la tabla de evidencias admite hasta 100 MB (el máximo de cualquier tipo), no los 10 MB de antes ni los 200 de la 073',
    exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_evidencias'::regclass and c.conname = 'pdm_evidencias_bytes_check'
              and pg_get_constraintdef(c.oid) ~ 'bytes <= 104857600\)'));

  -- ══ pdm_reportar: justo en el tope pasa, un byte más no ═══════════════════
  -- (cada reporte que pasa se aprueba, para que el siguiente sea un avance nuevo y no una corrección)
  for t in
    select * from (values
      ('PowerPoint .pptx', v_pptx, 'pptx', 25 * v_mb),
      ('PowerPoint .ppt', 'application/vnd.ms-powerpoint', 'ppt', 25 * v_mb),
      ('video MP4', 'video/mp4', 'mp4', 100 * v_mb),
      ('video MOV', 'video/quicktime', 'mov', 100 * v_mb),
      ('PDF', 'application/pdf', 'pdf', 25 * v_mb),
      ('foto HEIC', 'image/heic', 'heic', 25 * v_mb)) x(nombre, tipo, ext, tope)
  loop
    v_valor := v_valor + 1;
    v_rep := pg_temp.reportar_archivo(v_r, v_i, v_plan, v_valor, t.tipo, t.tope::text, t.ext);
    perform pg_temp.chequear(t.nombre || ': justo en el tope pasa', v_rep is not null);
    perform pg_temp.chequear(t.nombre || ': queda guardado con su tipo y su tamaño',
      (select count(*) from public.pdm_evidencias e where e.reporte_id = v_rep::uuid and e.tipo = t.tipo and e.bytes = t.tope) = 1);
    perform pg_temp.validar(v_c, v_rep::uuid, 'aprobado');

    v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, %s::numeric, %L, %L::jsonb)',
      v_i, v_valor + 1, 'Se hizo una actividad de prueba para este indicador.',
      jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || v_i::text || '/2026/' || gen_random_uuid()::text || '.' || t.ext,
        'nombre', 'soporte.' || t.ext, 'tipo', t.tipo, 'bytes', (t.tope + 1)::text))::text));
    perform pg_temp.chequear(t.nombre || ': un byte más NO pasa, con el mensaje de peso', v_msg like '22022 PDM: este archivo pesa más de lo que admite su tipo (hasta 25 MB; los videos, hasta 100 MB)');
  end loop;

  -- ══ Lo que sigue sin admitirse ═══════════════════════════════════════════
  for t in
    select * from (values
      ('video WebM', 'video/webm'), ('video AVI', 'video/x-msvideo'), ('audio MP3', 'audio/mpeg'), ('un comprimido', 'application/zip'),
      ('una página web', 'text/html'), ('un ejecutable', 'application/x-msdownload'), ('un tipo genérico', 'application/octet-stream'),
      ('un GIF', 'image/gif'), ('un SVG', 'image/svg+xml'), ('un tipo vacío', ''), ('un tipo en mayúsculas', 'APPLICATION/PDF')) x(nombre, tipo)
  loop
    v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, %s::numeric, %L, %L::jsonb)',
      v_i, v_valor + 1, 'Se hizo una actividad de prueba para este indicador.',
      jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || v_i::text || '/2026/' || gen_random_uuid()::text || '.pdf',
        'nombre', 'soporte.pdf', 'tipo', t.tipo, 'bytes', '1000'))::text));
    perform pg_temp.chequear(t.nombre || ' no se admite', v_msg like '22023 PDM: tipo de archivo no permitido (PDF, imagen, Word, Excel, presentación o video MP4 o MOV)');
  end loop;
  -- Sin la clave `tipo`
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, %s::numeric, %L, %L::jsonb)',
    v_i, v_valor + 1, 'Se hizo una actividad de prueba para este indicador.',
    jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || v_i::text || '/2026/' || gen_random_uuid()::text || '.pdf', 'nombre', 'soporte.pdf', 'bytes', '1000'))::text));
  perform pg_temp.chequear('sin tipo no se admite', v_msg like '22023%');

  -- ══ Tamaños que no son un tamaño ═════════════════════════════════════════
  for t in
    select * from (values ('cero', '0'), ('negativo', '-5'), ('texto', 'abc'), ('decimal', '10.5'), ('vacío', ''), ('con espacios', ' 100 '), ('de 13 cifras', '1000000000000'), ('notación científica', '1e6')) x(nombre, bytes)
  loop
    v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, %s::numeric, %L, %L::jsonb)',
      v_i, v_valor + 1, 'Se hizo una actividad de prueba para este indicador.',
      jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || v_i::text || '/2026/' || gen_random_uuid()::text || '.pdf',
        'nombre', 'soporte.pdf', 'tipo', 'application/pdf', 'bytes', t.bytes))::text));
    perform pg_temp.chequear('un tamaño ' || t.nombre || ' no se admite', v_msg like '22022%');
  end loop;
  -- Sin la clave `bytes`
  v_msg := pg_temp.fallo_de(v_r, format('select public.pdm_reportar(%L::uuid, 2026, %s::numeric, %L, %L::jsonb)',
    v_i, v_valor + 1, 'Se hizo una actividad de prueba para este indicador.',
    jsonb_build_array(jsonb_build_object('ruta', v_plan::text || '/' || v_i::text || '/2026/' || gen_random_uuid()::text || '.pdf', 'nombre', 'soporte.pdf', 'tipo', 'application/pdf'))::text));
  perform pg_temp.chequear('sin tamaño no se admite', v_msg like '22022%');

  -- ══ pdm_reportar conserva lo suyo ════════════════════════════════════════
  perform pg_temp.chequear('pdm_reportar sigue sin ser de definidor, con ruta de búsqueda fija y sin acceso para anon',
    exists (select 1 from pg_proc p where p.oid = 'public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure
            and not p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
            and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')));
  perform pg_temp.chequear('pdm_reportar ya no lleva el tope de 10 MB escrito',
    (select prosrc not like '%10485760%' and prosrc like '%limite_de_evidencia%' from pg_proc where oid = 'public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure));

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-EVIDENCIAS: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
