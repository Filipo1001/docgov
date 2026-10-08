-- ============================================================================
-- Pruebas de PERMISOS POR ROL del módulo Plan de Desarrollo.
--
-- Qué comprueba: que cada nivel ve exactamente lo que le corresponde, contra los datos que haya en la base:
--
--   administrador   todo el plan, sus reportes, archivos, asignaciones, accesos y la bitácora
--   consulta        (Control Interno) todo el plan, sin bitácora ni accesos ajenos
--   coordinador     (secretaría) su dependencia + lo que tenga asignado; asignaciones y accesos de su dependencia
--   responsable     solo los indicadores que tiene asignados y SUS filas de asignación
--   sin acceso      nada
--   anónimo         ni siquiera puede preguntar (permiso denegado)
--
-- y que dos escrituras prohibidas se rechazan (un responsable no se asigna indicadores; una secretaría no habilita a
-- alguien de otra dependencia como secretaría).
--
-- Cómo se corre: pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la sesión). NO DEJA NADA
-- ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito, y Postgres deshace la
-- transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-PERMISOS: N comprobaciones, 0 fallas» y la lista.
-- La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- No lleva identificadores de personas: elige del propio contenido de la base a un administrador, una secretaría, un
-- responsable y alguien sin acceso; si falta alguno de esos niveles, lo crea dentro de la transacción (y se deshace).
-- ============================================================================

create or replace function pg_temp.contar(p_uid uuid, p_rol text, p_tabla text) returns bigint
language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin
    execute format('select count(*) from public.%I', p_tabla) into n;
  exception when insufficient_privilege then
    n := -1;   -- «permiso denegado»: lo que se espera del anónimo
  end;
  execute 'reset role';
  return n;
end $f$;

create or replace function pg_temp.intentar(p_uid uuid, p_sql text) returns text
language plpgsql as $f$
declare r text := 'permitido';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    r := 'rechazado';
  end;
  execute 'reset role';
  return r;
end $f$;

do $$
declare
  v_admin uuid; v_coord uuid; v_resp uuid; v_cons uuid; v_nadie uuid; v_dep uuid; v_otra_dep_user uuid;
  v_ind uuid;
  lineas text[] := '{}';
  fallas int := 0;
  total int := 0;
  t text;
  visto bigint;
  q record;
  tablas text[] := array['pdm_indicadores', 'pdm_asignaciones', 'pdm_reportes', 'pdm_evidencias', 'pdm_permisos', 'pdm_historial'];
begin
  -- ── Quiénes ──────────────────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-PERMISOS: no hay un administrador activo para probar'; end if;

  select p.usuario_id into v_coord from public.pdm_permisos p join public.usuarios u on u.id = p.usuario_id
   where p.nivel = 'coordinador' and u.activo and u.dependencia_id is not null order by p.created_at limit 1;
  if v_coord is null then
    select id into v_coord from public.usuarios where rol = 'supervisor' and activo and dependencia_id is not null order by created_at limit 1;
    insert into public.pdm_permisos (usuario_id, nivel, habilitado_por_nombre) values (v_coord, 'coordinador', 'PRUEBA (se deshace)');
  end if;
  select dependencia_id into v_dep from public.usuarios where id = v_coord;

  select p.usuario_id into v_resp from public.pdm_permisos p join public.usuarios u on u.id = p.usuario_id
   where p.nivel = 'responsable' and u.activo and exists (select 1 from public.pdm_asignaciones a where a.usuario_id = p.usuario_id)
   order by p.created_at limit 1;
  if v_resp is null then
    select a.usuario_id into v_resp from public.pdm_asignaciones a join public.usuarios u on u.id = a.usuario_id
     where u.activo and u.rol = 'contratista' and not exists (select 1 from public.pdm_permisos p where p.usuario_id = a.usuario_id) limit 1;
    insert into public.pdm_permisos (usuario_id, nivel, habilitado_por_nombre) values (v_resp, 'responsable', 'PRUEBA (se deshace)');
  end if;

  select u.id into v_nadie from public.usuarios u
   where u.activo and u.rol = 'contratista'
     and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
     and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
   order by u.created_at limit 1;

  -- Control Interno no existe todavía como persona: se crea su acceso aquí (y se deshace).
  select u.id into v_cons from public.usuarios u
   where u.activo and u.rol <> 'admin' and u.id <> v_nadie
     and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
     and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
   order by u.created_at desc limit 1;
  insert into public.pdm_permisos (usuario_id, nivel, habilitado_por_nombre) values (v_cons, 'consulta', 'PRUEBA (se deshace)');

  -- ── Lo que cada uno DEBE ver, calculado sin políticas ──────────────────
  create temp table esperado (rol text, tabla text, n bigint) on commit drop;

  foreach t in array tablas loop
    execute format('select count(*) from public.%I', t) into visto;
    insert into esperado values ('admin', t, visto);
    insert into esperado values ('consulta', t, case when t = 'pdm_historial' then 0 when t = 'pdm_permisos' then 1 else visto end);
  end loop;

  -- Secretaría: su dependencia y lo que tenga asignado.
  create temp table vis_coord on commit drop as
    select i.id from public.pdm_indicadores i
     where i.dependencia_id = v_dep or exists (select 1 from public.pdm_asignaciones a where a.indicador_id = i.id and a.usuario_id = v_coord);
  insert into esperado values
    ('coordinador', 'pdm_indicadores', (select count(*) from vis_coord)),
    ('coordinador', 'pdm_asignaciones', (select count(*) from public.pdm_asignaciones a
        where a.usuario_id = v_coord or pdm_privado.dependencia_del_indicador(a.indicador_id) = v_dep)),
    ('coordinador', 'pdm_reportes', (select count(*) from public.pdm_reportes r where r.indicador_id in (select id from vis_coord))),
    ('coordinador', 'pdm_evidencias', (select count(*) from public.pdm_evidencias e join public.pdm_reportes r on r.id = e.reporte_id
        where r.indicador_id in (select id from vis_coord))),
    ('coordinador', 'pdm_permisos', (select count(*) from public.pdm_permisos p where p.usuario_id = v_coord or pdm_privado.dependencia_de(p.usuario_id) = v_dep)),
    ('coordinador', 'pdm_historial', 0);

  -- Responsable: solo lo suyo.
  create temp table vis_resp on commit drop as
    select distinct a.indicador_id id from public.pdm_asignaciones a where a.usuario_id = v_resp;
  insert into esperado values
    ('responsable', 'pdm_indicadores', (select count(*) from vis_resp)),
    ('responsable', 'pdm_asignaciones', (select count(*) from public.pdm_asignaciones a where a.usuario_id = v_resp)),
    ('responsable', 'pdm_reportes', (select count(*) from public.pdm_reportes r where r.indicador_id in (select id from vis_resp))),
    ('responsable', 'pdm_evidencias', (select count(*) from public.pdm_evidencias e join public.pdm_reportes r on r.id = e.reporte_id
        where r.indicador_id in (select id from vis_resp))),
    ('responsable', 'pdm_permisos', 1),
    ('responsable', 'pdm_historial', 0);

  insert into esperado select 'sin acceso', x, 0 from unnest(tablas) x;
  insert into esperado select 'anónimo', x, -1 from unnest(tablas) x;

  -- ── Lo que de verdad ve cada uno, con su sesión ────────────────────────
  for q in
    select e.rol, e.tabla, e.n,
      case e.rol when 'admin' then v_admin when 'consulta' then v_cons when 'coordinador' then v_coord
                 when 'responsable' then v_resp when 'sin acceso' then v_nadie else null end uid
    from esperado e order by e.rol, e.tabla
  loop
    if q.rol = 'sin acceso' and q.uid is null then continue; end if;
    visto := pg_temp.contar(q.uid, case when q.rol = 'anónimo' then 'anon' else 'authenticated' end, q.tabla);
    total := total + 1;
    if visto is distinct from q.n then
      fallas := fallas + 1;
      lineas := lineas || format('FALLA  %s · %s: ve %s, debería %s', q.rol, q.tabla, visto, q.n);
    else
      lineas := lineas || format('ok     %s · %s: %s', q.rol, q.tabla, case when visto = -1 then 'permiso denegado' else visto::text end);
    end if;
  end loop;

  -- ── Escrituras prohibidas ──────────────────────────────────────────────
  select id into v_ind from public.pdm_indicadores where id not in (select id from vis_resp) limit 1;
  t := pg_temp.intentar(v_resp, format(
    'insert into public.pdm_asignaciones (indicador_id, usuario_id, principal, asignado_por) values (%L, %L, true, %L)', v_ind, v_resp, v_resp));
  total := total + 1;
  if t <> 'rechazado' then fallas := fallas + 1; lineas := array_append(lineas, 'FALLA  un responsable pudo asignarse un indicador');
  else lineas := array_append(lineas, 'ok     un responsable no puede asignarse indicadores'); end if;

  select u.id into v_otra_dep_user from public.usuarios u
   where u.activo and u.dependencia_id is distinct from v_dep and u.dependencia_id is not null
     and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id) limit 1;
  t := pg_temp.intentar(v_coord, format(
    'insert into public.pdm_permisos (usuario_id, nivel, habilitado_por) values (%L, %L, %L)', v_otra_dep_user, 'coordinador', v_coord));
  total := total + 1;
  if t <> 'rechazado' then fallas := fallas + 1; lineas := array_append(lineas, 'FALLA  una secretaría habilitó a alguien de otra dependencia');
  else lineas := array_append(lineas, 'ok     una secretaría no habilita a alguien de otra dependencia'); end if;

  raise exception using message = format(E'PDM-PERMISOS: %s comprobaciones, %s fallas\n%s', total, fallas, array_to_string(lineas, E'\n'));
end $$;

select 1/0;  -- red de seguridad: si el bloque de arriba terminara sin error, esto aborta la transacción
