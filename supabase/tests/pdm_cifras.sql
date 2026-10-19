-- ============================================================================
-- Pruebas de las CIFRAS POR SECRETARÍA y del RITMO SEMANAL del módulo Plan de Desarrollo (migración 071).
--
-- Qué comprueba, con las MISMAS funciones que usa la pantalla (reportar, validar, anular, asignar, quitar) y con la sesión
-- de cada persona:
--
--   · Que cada cambio en un indicador mueve las cifras exactamente lo que las reglas del tablero dicen: reportar (sin
--     validar, deja de faltar), aprobar (aprobado, alcanzó la meta), un avance nuevo sobre uno aprobado (sin validar, pero
--     lo validado sigue contando), devolverlo, un avance a medias (en avance), anular (vuelve a faltar) y dejarlo sin nadie
--     a cargo (sin responsable). Se mide por DIFERENCIA contra lo que había, así que no depende de los datos.
--   · Que en todas las secretarías y años los cinco estados reparten SIN sobrar ni faltar a los indicadores con meta de
--     los años que ya empezaron, que un año que no ha empezado solo cuenta sus metas, y que el total de indicadores con
--     meta coincide con un conteo hecho por otro camino.
--   · Quién recibe las cifras: administrador, secretaría y Control Interno sí; quien solo responde por indicadores no; el
--     público (`anon`) tampoco, ni la función con permisos del dueño ni su envoltura. Y que una secretaría recibe las cifras
--     de TODAS (esa es la comparación) pero no más que números.
--   · Que el ritmo semanal cuenta reportes enviados y aprobados por semana, salta lo anulado, y respeta la seguridad por
--     filas: una secretaría cuenta lo de su dependencia y no lo de otra.
--
-- Cómo se corre: DESPUÉS de aplicar la 071, pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de
-- la sesión). NO DEJA NADA ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito,
-- y Postgres deshace la transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-CIFRAS: N comprobaciones,
-- 0 fallas» y la lista; debajo, una línea «PARIDAD: {…}» con las filas de la secretaría de prueba y los datos de los que
-- salen, para compararlos con el cálculo en TypeScript (`cuentaDeAnio`) fuera de la base. La última línea (1/0) es una
-- red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la migración sin su `begin` ni su `commit`, y a
-- continuación este archivo. Todo queda en la misma transacción y se deshace.
--
-- No lleva identificadores de personas: elige del propio contenido de la base la secretaría con menos indicadores que
-- tenga al menos dos con meta de 2 o más este año, y a las personas necesarias (sin acceso todavía). Todas reciben su
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

-- Lo que dice una instrucción que debe FALLAR: el código de error y el mensaje, o null si no falló.
create or replace function pg_temp.fallo_de(p_uid uuid, p_sql text) returns text
language plpgsql as $f$
begin
  perform pg_temp.como(p_uid, p_sql);
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;

-- Lo mismo, como el público sin sesión (`anon`).
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

create or replace function pg_temp.ruta(p_plan uuid, p_ind uuid, p_anio int) returns text
language sql as $f$ select p_plan::text || '/' || p_ind::text || '/' || p_anio::text || '/' || gen_random_uuid()::text || '.pdf' $f$;

-- Reportar COMO esa persona con una evidencia válida. Devuelve el id del reporte.
create or replace function pg_temp.rep(p_uid uuid, p_ind uuid, p_plan uuid, p_anio int, p_valor numeric) returns uuid
language sql as $f$
  select (pg_temp.como(p_uid, format('select public.pdm_reportar(%L::uuid, %s, %s::numeric, %L, %L::jsonb)',
    p_ind, p_anio, p_valor, 'Se hizo una actividad de prueba para este indicador.',
    jsonb_build_array(jsonb_build_object('ruta', pg_temp.ruta(p_plan, p_ind, p_anio), 'nombre', 'soporte.pdf', 'tipo', 'application/pdf', 'bytes', 1000))::text)) ->> 'reporte')::uuid
$f$;

create or replace function pg_temp.validar(p_uid uuid, p_rep uuid, p_estado text, p_com text default null) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_validar(%L::uuid, %L, %L)', p_rep, p_estado, p_com)) $f$;

-- La fila de cifras de una secretaría y un año, como la ve esa persona.
create or replace function pg_temp.fila(p_uid uuid, p_dep text, p_anio int) returns jsonb
language sql as $f$
  select pg_temp.como(p_uid, format('select to_jsonb(c) from public.pdm_cifras_por_secretaria() c where c.dependencia = %L and c.anio = %s', p_dep, p_anio))
$f$;

create or replace function pg_temp.sg(n int) returns text language sql as $f$ select case when n > 0 then '+' || n::text else n::text end $f$;

-- Cuánto cambió cada cifra entre dos fotos de la misma fila.
create or replace function pg_temp.dif(a jsonb, b jsonb) returns text
language sql as $f$
  select format('ap%s pv%s dv%s fa%s sr%s al%s pa%s cm%s',
    pg_temp.sg(((b->>'aprobados')::int) - ((a->>'aprobados')::int)), pg_temp.sg(((b->>'por_validar')::int) - ((a->>'por_validar')::int)),
    pg_temp.sg(((b->>'devueltos')::int) - ((a->>'devueltos')::int)), pg_temp.sg(((b->>'faltan')::int) - ((a->>'faltan')::int)),
    pg_temp.sg(((b->>'sin_responsable')::int) - ((a->>'sin_responsable')::int)), pg_temp.sg(((b->>'alcanzaron')::int) - ((a->>'alcanzaron')::int)),
    pg_temp.sg(((b->>'parciales')::int) - ((a->>'parciales')::int)), pg_temp.sg(((b->>'con_meta')::int) - ((a->>'con_meta')::int)))
$f$;

-- El ritmo (suma de enviados y de aprobados) que ve esa persona desde el 1 de enero del año.
create or replace function pg_temp.ritmo(p_uid uuid, p_desde date) returns jsonb
language sql as $f$
  select pg_temp.como(p_uid, format('select jsonb_build_object(''e'', coalesce(sum(enviados), 0), ''a'', coalesce(sum(aprobados), 0), ''n'', count(*)) from public.pdm_ritmo_semanal(%L::date)', p_desde))
$f$;

do $$
declare
  v_admin uuid; v_c uuid; v_c2 uuid; v_r uuid; v_q uuid; v_dep uuid; v_dep2 uuid; v_depn text;
  v_plan uuid; v_a uuid; v_b uuid; v_ma numeric; v_mb numeric; v_anio int; v_p uuid[];
  ra uuid; ra2 uuid; rb uuid;
  s0 jsonb; s1 jsonb; s2 jsonb; s3 jsonb; s4 jsonb; s5 jsonb; s6 jsonb; s7 jsonb; o0 jsonb; o7 jsonb;
  rt0 jsonb; rt1 jsonb; v_exp_e int; v_exp_a int; v_msg text; v_n int; v_mot constant text := 'Prueba automática de las cifras';
  v_paridad text; v_resultado text; v_fallas int; v_total int;
begin
  v_anio := extract(year from (now() at time zone 'America/Bogota'))::int;

  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-CIFRAS: no hay un administrador activo para probar'; end if;

  -- La secretaría de prueba: la de menos indicadores que tenga al menos dos con meta de 2 o más este año.
  select d.id, d.nombre into v_dep, v_depn
  from public.dependencias d
  where (select count(*) from public.pdm_indicadores i join public.pdm_metas m on m.indicador_id = i.id and m.anio = v_anio and m.meta >= 2
         where i.dependencia_id = d.id and i.activo) >= 2
  order by (select count(*) from public.pdm_indicadores i where i.dependencia_id = d.id and i.activo), d.id limit 1;
  if v_dep is null then raise exception 'PDM-CIFRAS: no hay una secretaría con dos indicadores de meta 2 o más en %', v_anio; end if;

  select i.id, i.plan_id, m.meta into v_a, v_plan, v_ma
  from public.pdm_indicadores i join public.pdm_metas m on m.indicador_id = i.id and m.anio = v_anio and m.meta >= 2
  where i.dependencia_id = v_dep and i.activo and not exists (select 1 from public.pdm_reportes r where r.indicador_id = i.id and r.anio = v_anio)
  order by i.id limit 1;
  select i.id, m.meta into v_b, v_mb
  from public.pdm_indicadores i join public.pdm_metas m on m.indicador_id = i.id and m.anio = v_anio and m.meta >= 2
  where i.dependencia_id = v_dep and i.activo and i.id <> v_a and not exists (select 1 from public.pdm_reportes r where r.indicador_id = i.id and r.anio = v_anio)
  order by i.id limit 1;
  if v_a is null or v_b is null then raise exception 'PDM-CIFRAS: la secretaría de prueba ya tiene reportes en sus indicadores este año; la prueba necesita dos sin reportes'; end if;

  -- Personas libres: la secretaría de prueba, otra secretaría con indicadores (para el aislamiento) y dos más.
  select u.id into v_c from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id = v_dep
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
  order by u.id limit 1;
  if v_c is null then raise exception 'PDM-CIFRAS: falta una persona sin acceso en la secretaría de prueba'; end if;

  select u.id, u.dependencia_id into v_c2, v_dep2 from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id is not null and u.dependencia_id <> v_dep and u.id <> v_c
    and exists (select 1 from public.pdm_indicadores i where i.dependencia_id = u.dependencia_id and i.activo)
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
  order by u.id limit 1;
  if v_c2 is null then raise exception 'PDM-CIFRAS: falta una persona sin acceso en otra secretaría con indicadores'; end if;

  select array_agg(id) into v_p from (
    select u.id from public.usuarios u
    where u.activo and u.rol::text <> 'admin' and u.id not in (v_c, v_c2)
      and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
      and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
      and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    order by u.id limit 2) q;
  if v_p is null or cardinality(v_p) < 2 then raise exception 'PDM-CIFRAS: faltan dos personas activas sin acceso'; end if;
  v_r := v_p[1]; v_q := v_p[2];

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c2, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''consulta'', %L)', v_q, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L, %L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_a, v_b, v_r, v_mot));

  -- ══ Quién recibe las cifras ═══════════════════════════════════════════════
  perform pg_temp.chequear('el administrador recibe las cifras', pg_temp.fila(v_admin, v_depn, v_anio) is not null);
  perform pg_temp.chequear('la secretaría las recibe', pg_temp.fila(v_c, v_depn, v_anio) is not null);
  perform pg_temp.chequear('Control Interno también', pg_temp.fila(v_q, v_depn, v_anio) is not null);
  v_msg := pg_temp.fallo_de(v_r, 'select to_jsonb(c) from public.pdm_cifras_por_secretaria() c limit 1');
  perform pg_temp.chequear('quien solo responde por indicadores no las recibe', v_msg like '42501%');
  v_msg := pg_temp.fallo_anon('select * from public.pdm_cifras_por_secretaria()');
  perform pg_temp.chequear('el público sin sesión tampoco: la envoltura', v_msg like '42501%');
  v_msg := pg_temp.fallo_anon('select * from pdm_privado.cifras_por_secretaria()');
  perform pg_temp.chequear('ni el cálculo con permisos del dueño', v_msg like '42501%');
  v_msg := pg_temp.fallo_anon(format('select * from public.pdm_ritmo_semanal(%L::date)', make_date(v_anio, 1, 1)));
  perform pg_temp.chequear('ni el ritmo semanal', v_msg like '42501%');
  perform pg_temp.chequear('una secretaría recibe las cifras de TODAS las secretarías con indicadores (esa es la comparación)',
    (select (pg_temp.como(v_c, 'select to_jsonb(count(distinct dependencia)) from public.pdm_cifras_por_secretaria()'))::text::int)
      = (select count(distinct i.dependencia_id) from public.pdm_indicadores i join public.pdm_metas m on m.indicador_id = i.id and m.meta > 0 where i.activo));
  perform pg_temp.chequear('y lo que ve de las otras es lo mismo que ve el administrador (solo números, sin filtrar)',
    pg_temp.fila(v_c, (select nombre from public.dependencias where id = v_dep2), v_anio) = pg_temp.fila(v_admin, (select nombre from public.dependencias where id = v_dep2), v_anio));

  -- ══ Las reglas, en todas las secretarías y años ═══════════════════════════
  select count(*) into v_n from pdm_privado.cifras_por_secretaria() c;
  perform pg_temp.chequear('hay cifras', v_n > 0);
  perform pg_temp.chequear('los cinco estados reparten sin sobrar ni faltar a los indicadores con meta de los años que ya empezaron',
    not exists (select 1 from pdm_privado.cifras_por_secretaria() c where c.anio <= v_anio
      and c.aprobados + c.por_validar + c.devueltos + c.faltan + c.sin_responsable <> c.con_meta));
  perform pg_temp.chequear('un año que no ha empezado cuenta sus metas y nada más',
    not exists (select 1 from pdm_privado.cifras_por_secretaria() c where c.anio > v_anio
      and (c.aprobados <> 0 or c.por_validar <> 0 or c.devueltos <> 0 or c.faltan <> 0 or c.sin_responsable <> 0 or c.alcanzaron <> 0 or c.parciales <> 0)));
  perform pg_temp.chequear('alcanzar la meta o ir en avance nunca suma más que los indicadores con meta',
    not exists (select 1 from pdm_privado.cifras_por_secretaria() c where c.alcanzaron + c.parciales > c.con_meta));
  perform pg_temp.chequear('con avance incluye a quien alcanzó la meta y a quien va en avance, y nunca pasa del total con meta',
    not exists (select 1 from pdm_privado.cifras_por_secretaria() c where c.con_avance < c.alcanzaron + c.parciales or c.con_avance > c.con_meta));
  perform pg_temp.chequear('el total con meta coincide con un conteo hecho por otro camino',
    not exists (
      select 1 from pdm_privado.cifras_por_secretaria() c
      where c.con_meta <> (select count(*) from public.pdm_indicadores i join public.dependencias d on d.id = i.dependencia_id
                           join public.pdm_metas m on m.indicador_id = i.id and m.meta > 0 and m.anio = c.anio
                           where i.activo and d.nombre = c.dependencia)));
  perform pg_temp.chequear('el cálculo no devuelve filas repetidas por secretaría y año',
    (select count(*) from pdm_privado.cifras_por_secretaria()) = (select count(distinct (c.dependencia, c.anio)) from pdm_privado.cifras_por_secretaria() c));

  -- ══ Cada cambio mueve las cifras lo que dicen las reglas ═════════════════
  s0 := pg_temp.fila(v_admin, v_depn, v_anio);
  o0 := pg_temp.fila(v_admin, v_depn, v_anio - 1);
  rt0 := pg_temp.ritmo(v_admin, make_date(v_anio, 1, 1));
  perform pg_temp.chequear('al empezar, los dos indicadores tienen quien los lleve y nada reportado en el año',
    (s0->>'faltan')::int >= 2);

  ra := pg_temp.rep(v_r, v_a, v_plan, v_anio, v_ma);                        -- reporta A con su meta completa
  s1 := pg_temp.fila(v_admin, v_depn, v_anio);
  perform pg_temp.chequear('reportar: queda sin validar y deja de faltar (aún no alcanzó la meta: no está validado)', pg_temp.dif(s0, s1) = 'ap0 pv+1 dv0 fa-1 sr0 al0 pa0 cm0');

  perform pg_temp.validar(v_admin, ra, 'aprobado');
  s2 := pg_temp.fila(v_admin, v_depn, v_anio);
  perform pg_temp.chequear('aprobar: aprobado, y alcanzó la meta', pg_temp.dif(s0, s2) = 'ap+1 pv0 dv0 fa-1 sr0 al+1 pa0 cm0');

  ra2 := pg_temp.rep(v_r, v_a, v_plan, v_anio, v_ma + 1);                   -- avance nuevo sobre uno aprobado
  s3 := pg_temp.fila(v_admin, v_depn, v_anio);
  perform pg_temp.chequear('un avance nuevo sobre uno aprobado: sin validar, pero lo validado sigue contando (sigue alcanzada)', pg_temp.dif(s0, s3) = 'ap0 pv+1 dv0 fa-1 sr0 al+1 pa0 cm0');

  perform pg_temp.validar(v_admin, ra2, 'devuelto', 'Falta la lista de asistencia del taller');
  s4 := pg_temp.fila(v_admin, v_depn, v_anio);
  perform pg_temp.chequear('devolverlo: devuelto, y lo validado sigue contando', pg_temp.dif(s0, s4) = 'ap0 pv0 dv+1 fa-1 sr0 al+1 pa0 cm0');

  rb := pg_temp.rep(v_r, v_b, v_plan, v_anio, v_mb / 2);                    -- B a medias
  perform pg_temp.validar(v_admin, rb, 'aprobado');
  s5 := pg_temp.fila(v_admin, v_depn, v_anio);
  perform pg_temp.chequear('un avance aprobado a medias: aprobado y en avance (no alcanzó)', pg_temp.dif(s0, s5) = 'ap+1 pv0 dv+1 fa-2 sr0 al+1 pa+1 cm0');

  perform pg_temp.como(v_admin, format('select public.pdm_anular_reporte(%L::uuid, %L)', rb, v_mot));
  s6 := pg_temp.fila(v_admin, v_depn, v_anio);
  perform pg_temp.chequear('anular: lo anulado no cuenta, el indicador vuelve a faltar', pg_temp.dif(s0, s6) = 'ap0 pv0 dv+1 fa-1 sr0 al+1 pa0 cm0');

  -- Sin nadie a cargo: `pdm_quitar` no suelta al responsable principal mientras haya apoyos, así que se vacían las asignaciones
  -- del indicador directamente (esto corre con permisos del dueño y se deshace al final).
  delete from public.pdm_asignaciones where indicador_id = v_b;
  s7 := pg_temp.fila(v_admin, v_depn, v_anio);
  perform pg_temp.chequear('sin nadie a cargo: sin responsable', pg_temp.dif(s0, s7) = 'ap0 pv0 dv+1 fa-2 sr+1 al+1 pa0 cm0');

  o7 := pg_temp.fila(v_admin, v_depn, v_anio - 1);
  -- El año anterior no recibe reportes nuevos. Solo se mueve por B (que ahora no tiene a nadie a cargo) si B tenía meta ese año:
  -- deja de «faltar» y pasa a «sin responsable».
  perform pg_temp.chequear('el año anterior no se mueve por los reportes de este año (solo por B, ahora sin responsable, si tenía meta)',
    pg_temp.dif(o0, o7) = case when exists (select 1 from public.pdm_metas where indicador_id = v_b and anio = v_anio - 1 and meta > 0)
                               then 'ap0 pv0 dv0 fa-1 sr+1 al0 pa0 cm0' else 'ap0 pv0 dv0 fa0 sr0 al0 pa0 cm0' end);
  perform pg_temp.chequear('la secretaría ve lo mismo que el administrador', pg_temp.fila(v_c, v_depn, v_anio) = s7);
  perform pg_temp.chequear('y Control Interno', pg_temp.fila(v_q, v_depn, v_anio) = s7);

  -- ══ El ritmo semanal ═════════════════════════════════════════════════════
  rt1 := pg_temp.ritmo(v_admin, make_date(v_anio, 1, 1));
  perform pg_temp.chequear('el ritmo cuenta los reportes enviados que no están anulados (2: el de B se anuló)', ((rt1->>'e')::int) - ((rt0->>'e')::int) = 2);
  perform pg_temp.chequear('y las aprobaciones de reportes que no están anulados (1: la de B se anuló)', ((rt1->>'a')::int) - ((rt0->>'a')::int) = 1);
  perform pg_temp.chequear('cuenta las semanas con movimiento, empezando el lunes (hora de Colombia)',
    (pg_temp.como(v_admin, format('select to_jsonb(count(*)) from public.pdm_ritmo_semanal(%L::date) where semana = date_trunc(''week'', now() at time zone ''America/Bogota'')::date and extract(isodow from semana) = 1', make_date(v_anio, 1, 1))))::text::int = 1);
  v_exp_e := (select count(*) from public.pdm_reportes r join public.pdm_indicadores i on i.id = r.indicador_id
              where i.dependencia_id = v_dep and not pdm_privado.anulado(r.id) and (r.created_at at time zone 'America/Bogota')::date >= make_date(v_anio, 1, 1));
  v_exp_a := (select count(*) from public.pdm_validaciones x join public.pdm_reportes r on r.id = x.reporte_id join public.pdm_indicadores i on i.id = r.indicador_id
              where i.dependencia_id = v_dep and x.estado = 'aprobado' and not pdm_privado.anulado(r.id) and (x.created_at at time zone 'America/Bogota')::date >= make_date(v_anio, 1, 1));
  perform pg_temp.chequear('la secretaría de prueba cuenta lo de su dependencia', (pg_temp.ritmo(v_c, make_date(v_anio, 1, 1))->>'e')::int = v_exp_e and (pg_temp.ritmo(v_c, make_date(v_anio, 1, 1))->>'a')::int = v_exp_a);
  v_exp_e := (select count(*) from public.pdm_reportes r join public.pdm_indicadores i on i.id = r.indicador_id
              where i.dependencia_id = v_dep2 and not pdm_privado.anulado(r.id) and (r.created_at at time zone 'America/Bogota')::date >= make_date(v_anio, 1, 1));
  perform pg_temp.chequear('otra secretaría cuenta lo suyo y no lo de la de prueba (la seguridad por filas manda)', (pg_temp.ritmo(v_c2, make_date(v_anio, 1, 1))->>'e')::int = v_exp_e);
  perform pg_temp.chequear('quien reportó cuenta lo suyo', (pg_temp.ritmo(v_r, make_date(v_anio, 1, 1))->>'e')::int = 2);
  perform pg_temp.chequear('sin fecha de inicio cuenta desde el principio (no falla)', pg_temp.fallo_de(v_admin, 'select to_jsonb(count(*)) from public.pdm_ritmo_semanal(null)') is null);

  -- ══ Paridad con el cálculo en TypeScript (se compara fuera de la base) ══
  select 'PARIDAD: ' || jsonb_build_object(
    'dependencia', v_depn, 'anioActual', v_anio,
    'cifras', (select coalesce(jsonb_agg(to_jsonb(c) order by c.anio), '[]'::jsonb) from pdm_privado.cifras_por_secretaria() c where c.dependencia = v_depn),
    'indicadores', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'fila_origen', i.fila_origen, 'codigo', i.codigo, 'linea', i.linea, 'sector', i.sector,
        'programa', i.programa, 'producto', i.producto, 'indicador', i.indicador, 'unidad', i.unidad, 'linea_base', i.linea_base, 'meta_cuatrienio', i.meta_cuatrienio,
        'responsable_origen', i.responsable_origen, 'dependencia', jsonb_build_object('nombre', v_depn)) order by i.fila_origen), '[]'::jsonb)
      from public.pdm_indicadores i where i.dependencia_id = v_dep and i.activo),
    'metas', (select coalesce(jsonb_agg(jsonb_build_object('indicador_id', m.indicador_id, 'anio', m.anio, 'meta', m.meta)), '[]'::jsonb)
      from public.pdm_metas m join public.pdm_indicadores i on i.id = m.indicador_id where i.dependencia_id = v_dep and i.activo),
    'asignaciones', (select coalesce(jsonb_agg(jsonb_build_object('indicador_id', a.indicador_id, 'usuario_id', a.usuario_id, 'principal', a.principal, 'grupo_id', a.grupo_id)), '[]'::jsonb)
      from public.pdm_asignaciones a join public.pdm_indicadores i on i.id = a.indicador_id where i.dependencia_id = v_dep and i.activo),
    'avances', (select coalesce(jsonb_agg(to_jsonb(av)), '[]'::jsonb) from public.pdm_avance_validado av join public.pdm_indicadores i on i.id = av.indicador_id where i.dependencia_id = v_dep),
    'vigentes', (select coalesce(jsonb_agg(to_jsonb(vg)), '[]'::jsonb) from public.pdm_reportes_vigentes vg join public.pdm_indicadores i on i.id = vg.indicador_id where i.dependencia_id = v_dep)
  )::text into v_paridad;

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-CIFRAS: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
         || E'\n' || v_paridad
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
