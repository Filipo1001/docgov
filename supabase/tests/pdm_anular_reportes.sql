-- ============================================================================
-- Pruebas de ANULAR REPORTES del módulo Plan de Desarrollo (migración 068).
--
-- Qué comprueba, con las MISMAS funciones que usa la pantalla (reportar, validar, anular, restaurar):
--
--   · Que anular un reporte lo saca de lo vigente y de lo validado, y que el reporte anterior vuelve a ser el vigente
--     (el siguiente avance parte del valor anterior, no del anulado).
--   · Que lo anulado solo lo ven el administrador y Control Interno: ni quien lo reportó, ni la secretaría, ni sus
--     archivos, ni sus validaciones. Y que la tabla de anulaciones solo la leen ellos.
--   · Que se anula lo MÁS RECIENTE (con otro vigente más nuevo, no), que un reporte y sus versiones se anulan y se
--     restauran JUNTOS (de la más nueva a la primera / de la primera a la más nueva) y que una cadena nunca queda a medias.
--   · Que no se valida lo anulado, que no se anula dos veces, que restaurar exige que el reporte anterior siga aprobado
--     y que se puede anular, restaurar y volver a anular.
--   · Que reabrir un reporte aprobado (devolverlo) lo quita de lo validado y deja corregirlo.
--   · Que solo el administrador anula y restaura, que el motivo es obligatorio (10 a 500 caracteres), y que la tabla solo
--     crece (nadie la actualiza ni la borra, ni escribe a nombre de otro).
--   · Que ninguna función ni vista de reportes se quedó sin saltar lo anulado.
--
-- Cómo se corre: DESPUÉS de aplicar la 068, pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de
-- la sesión). NO DEJA NADA ESCRITO, ni en producción: todo pasa dentro de un bloque que termina con un error a propósito,
-- y Postgres deshace la transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «PDM-ANULAR: N comprobaciones,
-- 0 fallas» y la lista. La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar la migración ANTES de aplicarla: pegar primero la migración sin su `begin` ni su `commit`, y a
-- continuación este archivo. Todo queda en la misma transacción y se deshace.
--
-- No lleva identificadores de personas: elige del propio contenido de la base a un administrador, una persona de una
-- secretaría con indicadores (será su coordinadora) y dos personas activas más sin acceso (la que reporta y la de consulta).
-- Todas reciben su acceso dentro de la transacción, que se deshace.
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

-- Quien tiene el indicador a su cargo reporta (con una evidencia de verdad: la ruta, el tipo y el tamaño que la base exige).
create or replace function pg_temp.reportar(p_uid uuid, p_ind uuid, p_plan uuid, p_anio int, p_valor numeric, p_motivo text default null)
returns uuid
language sql as $f$
  select (pg_temp.como(p_uid, format('select public.pdm_reportar(%L::uuid, %s, %s::numeric, %L, %L::jsonb, %L)',
    p_ind, p_anio, p_valor, 'Se hizo una actividad de prueba para este indicador.',
    jsonb_build_array(jsonb_build_object(
      'ruta', p_plan::text || '/' || p_ind::text || '/' || p_anio::text || '/' || gen_random_uuid()::text || '.pdf',
      'nombre', 'soporte.pdf', 'tipo', 'application/pdf', 'bytes', 1000))::text,
    p_motivo)) ->> 'reporte')::uuid
$f$;

create or replace function pg_temp.validar(p_uid uuid, p_rep uuid, p_estado text, p_com text default null) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_validar(%L::uuid, %L, %L)', p_rep, p_estado, p_com)) $f$;

create or replace function pg_temp.anular(p_uid uuid, p_rep uuid, p_mot text) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_anular_reporte(%L::uuid, %L)', p_rep, p_mot)) $f$;

create or replace function pg_temp.restaurar(p_uid uuid, p_rep uuid, p_mot text) returns jsonb
language sql as $f$ select pg_temp.como(p_uid, format('select public.pdm_restaurar_reporte(%L::uuid, %L)', p_rep, p_mot)) $f$;

do $$
declare
  v_admin uuid; v_c uuid; v_r uuid; v_q uuid; v_dep uuid; v_i uuid; v_plan uuid; v_p uuid[];
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r6 uuid; a1 uuid; a2 uuid;
  v_msg text; v_x jsonb; v_otro uuid; v_mot constant text := 'Prueba automática de anular';
  v_resultado text; v_fallas int; v_total int;
begin
  -- ── Quiénes y sobre qué ─────────────────────────────────────────────────
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by created_at limit 1;
  if v_admin is null then raise exception 'PDM-ANULAR: no hay un administrador activo para probar'; end if;

  -- La coordinadora: una persona de una secretaría que tiene indicadores, sin ningún acceso todavía.
  select u.id, u.dependencia_id into v_c, v_dep
  from public.usuarios u
  where u.activo and u.rol::text <> 'admin' and u.dependencia_id is not null
    and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
    and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
    and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    and exists (select 1 from public.pdm_indicadores i where i.dependencia_id = u.dependencia_id and i.activo)
  order by u.id limit 1;
  if v_c is null then raise exception 'PDM-ANULAR: falta una persona de una secretaría con indicadores y sin acceso'; end if;

  -- El indicador: de esa secretaría, de preferencia sin nadie asignado.
  select i.id, i.plan_id into v_i, v_plan
  from public.pdm_indicadores i
  where i.dependencia_id = v_dep and i.activo
  order by exists (select 1 from public.pdm_asignaciones a where a.indicador_id = i.id), i.id
  limit 1;

  -- Quien reporta y quien consulta: dos personas activas más, sin acceso.
  select array_agg(id) into v_p from (
    select u.id from public.usuarios u
    where u.activo and u.rol::text <> 'admin' and u.id <> v_c
      and not exists (select 1 from public.pdm_permisos p where p.usuario_id = u.id)
      and not exists (select 1 from public.pdm_asignaciones a where a.usuario_id = u.id)
      and not exists (select 1 from public.pdm_grupo_miembros m where m.usuario_id = u.id)
    order by u.id limit 2) q;
  if v_p is null or cardinality(v_p) < 2 then raise exception 'PDM-ANULAR: faltan dos personas activas sin acceso'; end if;
  v_r := v_p[1]; v_q := v_p[2];

  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''coordinador'', %L)', v_c, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''responsable'', %L)', v_r, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_habilitar(%L::uuid, ''consulta'', %L)', v_q, v_mot));
  perform pg_temp.como(v_admin, format('select public.pdm_asignar(array[%L]::uuid[], %L::uuid, true, ''apoyo'', %L)', v_i, v_r, v_mot));

  perform pg_temp.chequear('no hay reportes de este indicador al empezar', (select count(*) from public.pdm_reportes where indicador_id = v_i) = 0);

  -- ══ 2026: un avance equivocado se anula ══════════════════════════════════
  r1 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 10);
  perform pg_temp.chequear('quien tiene el indicador reporta', r1 is not null);
  v_x := pg_temp.validar(v_c, r1, 'aprobado');
  perform pg_temp.chequear('la secretaría aprueba', v_x->>'cambio' = 'aprobado');
  perform pg_temp.chequear('lo aprobado cuenta como validado', pg_temp.una(v_admin, format('select to_jsonb(valor) from public.pdm_avance_validado where indicador_id = %L and anio = 2026', v_i)) = '10');

  r2 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 25);   -- un avance nuevo, equivocado
  perform pg_temp.chequear('el avance nuevo parte del valor anterior (10 → 25)', pg_temp.una(v_admin, format('select to_jsonb(valor_anterior) from public.pdm_reportes where id = %L', r2)) = '10');
  perform pg_temp.chequear('el último reporte es lo vigente', pg_temp.una(v_admin, format('select to_jsonb(reporte_id) from public.pdm_reportes_vigentes where indicador_id = %L and anio = 2026', v_i)) = to_jsonb(r2)#>>'{}');

  -- Anularlo
  v_x := pg_temp.anular(v_admin, r2, v_mot);
  perform pg_temp.chequear('anular devuelve la cuenta de versiones (1)', (v_x->>'versiones')::int = 1);
  perform pg_temp.chequear('el reporte anulado figura como anulado', (select pdm_privado.anulado(r2)) and not (select pdm_privado.anulado(r1)));
  perform pg_temp.chequear('el reporte anterior vuelve a ser el vigente', pg_temp.una(v_admin, format('select to_jsonb(reporte_id) from public.pdm_reportes_vigentes where indicador_id = %L and anio = 2026', v_i)) = to_jsonb(r1)#>>'{}');
  perform pg_temp.chequear('también para quien lo reportó', pg_temp.una(v_r, format('select to_jsonb(reporte_id) from public.pdm_reportes_vigentes where indicador_id = %L and anio = 2026', v_i)) = to_jsonb(r1)#>>'{}');
  perform pg_temp.chequear('lo validado sigue siendo el aprobado anterior (10)', pg_temp.una(v_admin, format('select to_jsonb(valor) from public.pdm_avance_validado where indicador_id = %L and anio = 2026', v_i)) = '10');

  -- Quién ve lo anulado
  perform pg_temp.chequear('el administrador ve el reporte anulado', pg_temp.n(v_admin, format('from public.pdm_reportes where id = %L', r2)) = 1);
  perform pg_temp.chequear('Control Interno ve el reporte anulado', pg_temp.n(v_q, format('from public.pdm_reportes where id = %L', r2)) = 1);
  perform pg_temp.chequear('quien lo reportó ya no lo ve', pg_temp.n(v_r, format('from public.pdm_reportes where id = %L', r2)) = 0);
  perform pg_temp.chequear('la secretaría tampoco', pg_temp.n(v_c, format('from public.pdm_reportes where id = %L', r2)) = 0);
  perform pg_temp.chequear('quien lo reportó no ve sus archivos', pg_temp.n(v_r, format('from public.pdm_evidencias where reporte_id = %L', r2)) = 0);
  perform pg_temp.chequear('el administrador sí ve sus archivos', pg_temp.n(v_admin, format('from public.pdm_evidencias where reporte_id = %L', r2)) = 1);
  perform pg_temp.chequear('el reporte anterior sigue a la vista de quien lo reportó', pg_temp.n(v_r, format('from public.pdm_reportes where id = %L', r1)) = 1);
  perform pg_temp.chequear('la vista de evidencias marca los archivos del reporte anulado (administrador)',
    pg_temp.n(v_admin, format('from public.pdm_evidencias_vista where reporte_id = %L and anulada', r2)) = 1
    and pg_temp.n(v_admin, format('from public.pdm_evidencias_vista where reporte_id = %L and not anulada', r1)) = 1);
  perform pg_temp.chequear('…y quien lo reportó no los ve en la vista', pg_temp.n(v_r, format('from public.pdm_evidencias_vista where reporte_id = %L', r2)) = 0);

  perform pg_temp.chequear('el administrador lee las anulaciones', pg_temp.n(v_admin, format('from public.pdm_anulaciones where reporte_id = %L', r2)) = 1);
  perform pg_temp.chequear('Control Interno lee las anulaciones', pg_temp.n(v_q, format('from public.pdm_anulaciones where reporte_id = %L', r2)) = 1);
  perform pg_temp.chequear('quien lo reportó no lee las anulaciones', pg_temp.n(v_r, 'from public.pdm_anulaciones') = 0);
  perform pg_temp.chequear('la secretaría tampoco', pg_temp.n(v_c, 'from public.pdm_anulaciones') = 0);

  -- El siguiente avance parte de lo que cuenta
  r3 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 12);
  perform pg_temp.chequear('el siguiente avance parte del valor aprobado, no del anulado (10 → 12)', pg_temp.una(v_admin, format('select to_jsonb(valor_anterior) from public.pdm_reportes where id = %L', r3)) = '10');

  -- Reglas
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_validar(%L::uuid, ''aprobado'')', r2));
  perform pg_temp.chequear('no se valida lo anulado', v_msg like '23514%anulado%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_anular_reporte(%L::uuid, %L)', r1, v_mot));
  perform pg_temp.chequear('solo se anula lo más reciente: con otro vigente más nuevo no se anula', v_msg like '23514%más reciente%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_anular_reporte(%L::uuid, %L)', r2, v_mot));
  perform pg_temp.chequear('no se anula dos veces', v_msg like '23514%ya está anulado%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_restaurar_reporte(%L::uuid, %L)', r1, v_mot));
  perform pg_temp.chequear('no se restaura lo que no está anulado', v_msg like '23514%no está anulado%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_restaurar_reporte(%L::uuid, %L)', r2, v_mot));
  perform pg_temp.chequear('no se restaura con otro reporte vigente más nuevo', v_msg like '23514%más reciente%');

  -- Anular, restaurar, volver a anular
  perform pg_temp.anular(v_admin, r3, v_mot);
  perform pg_temp.chequear('anulado el reporte nuevo, el vigente vuelve a ser el aprobado', pg_temp.una(v_admin, format('select to_jsonb(reporte_id) from public.pdm_reportes_vigentes where indicador_id = %L and anio = 2026', v_i)) = to_jsonb(r1)#>>'{}');
  v_x := pg_temp.restaurar(v_admin, r2, 'Se anuló por error, el valor era correcto');
  perform pg_temp.chequear('restaurar devuelve la cuenta de versiones (1)', (v_x->>'versiones')::int = 1);
  perform pg_temp.chequear('restaurado, vuelve a ser el vigente', pg_temp.una(v_admin, format('select to_jsonb(reporte_id) from public.pdm_reportes_vigentes where indicador_id = %L and anio = 2026', v_i)) = to_jsonb(r2)#>>'{}');
  perform pg_temp.chequear('y quien lo reportó lo vuelve a ver', pg_temp.n(v_r, format('from public.pdm_reportes where id = %L', r2)) = 1);
  perform pg_temp.chequear('la tabla guarda toda la historia (anular, restaurar, y el otro reporte)', pg_temp.n(v_admin, 'from public.pdm_anulaciones') = 3);

  -- ══ Reabrir un aprobado ══════════════════════════════════════════════════
  perform pg_temp.validar(v_c, r2, 'aprobado');
  perform pg_temp.chequear('aprobado el segundo avance, lo validado es 25', pg_temp.una(v_admin, format('select to_jsonb(valor) from public.pdm_avance_validado where indicador_id = %L and anio = 2026', v_i)) = '25');
  v_x := pg_temp.validar(v_c, r2, 'devuelto', 'Reabierto: el valor no coincide con el soporte.');
  perform pg_temp.chequear('reabrir (devolver un aprobado) lo deja devuelto', v_x->>'cambio' = 'devuelto'
    and pg_temp.una(v_admin, format('select to_jsonb(estado) from public.pdm_reportes_vigentes where indicador_id = %L and anio = 2026', v_i)) = 'devuelto');
  perform pg_temp.chequear('y deja de contar como validado: vuelve el aprobado anterior (10)', pg_temp.una(v_admin, format('select to_jsonb(valor) from public.pdm_avance_validado where indicador_id = %L and anio = 2026', v_i)) = '10');

  r4 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 22, 'Corrijo el valor según el soporte');
  perform pg_temp.chequear('quien lo reportó lo corrige', pg_temp.una(v_admin, format('select to_jsonb(corrige_a) from public.pdm_reportes where id = %L', r4)) = to_jsonb(r2)#>>'{}');

  -- ══ Una cadena de versiones se anula junta ═══════════════════════════════
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_anular_reporte(%L::uuid, %L)', r2, v_mot));
  perform pg_temp.chequear('no se anula una versión que ya fue corregida: se anula la más reciente', v_msg like '23514%ya fue corregido%');
  v_x := pg_temp.anular(v_admin, r4, v_mot);
  perform pg_temp.chequear('anular la corrección anula también la versión que corrigió (2 versiones)', (v_x->>'versiones')::int = 2
    and (select pdm_privado.anulado(r4)) and (select pdm_privado.anulado(r2)));
  perform pg_temp.chequear('el vigente vuelve a ser el primer aprobado', pg_temp.una(v_admin, format('select to_jsonb(reporte_id) from public.pdm_reportes_vigentes where indicador_id = %L and anio = 2026', v_i)) = to_jsonb(r1)#>>'{}');
  perform pg_temp.chequear('la secretaría ya no ve las validaciones del reporte anulado', pg_temp.n(v_c, format('from public.pdm_validaciones where reporte_id = %L', r2)) = 0);
  perform pg_temp.chequear('el administrador sí las ve (aprobó y devolvió)', pg_temp.n(v_admin, format('from public.pdm_validaciones where reporte_id = %L', r2)) = 2);

  r5 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 30);
  perform pg_temp.chequear('tras anular la cadena, un avance nuevo parte del aprobado (10 → 30)', pg_temp.una(v_admin, format('select to_jsonb(valor_anterior) from public.pdm_reportes where id = %L', r5)) = '10');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_restaurar_reporte(%L::uuid, %L)', r4, v_mot));
  perform pg_temp.chequear('con un reporte vigente más nuevo no se restaura la cadena', v_msg like '23514%más reciente%');
  perform pg_temp.anular(v_admin, r5, v_mot);
  v_x := pg_temp.restaurar(v_admin, r4, v_mot);
  perform pg_temp.chequear('restaurar la cadena restaura sus 2 versiones', (v_x->>'versiones')::int = 2
    and not (select pdm_privado.anulado(r4)) and not (select pdm_privado.anulado(r2)));
  perform pg_temp.chequear('restaurada, la última versión vuelve a ser el vigente', pg_temp.una(v_admin, format('select to_jsonb(reporte_id) from public.pdm_reportes_vigentes where indicador_id = %L and anio = 2026', v_i)) = to_jsonb(r4)#>>'{}');

  -- Se puede seguir corrigiendo (la versión anterior sigue corregida una sola vez)
  r6 := pg_temp.reportar(v_r, v_i, v_plan, 2026, 21, 'Segunda corrección del mismo reporte');
  perform pg_temp.chequear('se puede corregir otra vez la versión restaurada', pg_temp.una(v_admin, format('select to_jsonb(corrige_a) from public.pdm_reportes where id = %L', r6)) = to_jsonb(r4)#>>'{}');
  v_x := pg_temp.anular(v_admin, r6, v_mot);
  perform pg_temp.chequear('una cadena de tres versiones se anula entera', (v_x->>'versiones')::int = 3
    and (select pdm_privado.anulado(r6) and pdm_privado.anulado(r4) and pdm_privado.anulado(r2)));
  v_x := pg_temp.restaurar(v_admin, r6, v_mot);
  perform pg_temp.chequear('y se restaura entera', (v_x->>'versiones')::int = 3
    and not (select pdm_privado.anulado(r6) or pdm_privado.anulado(r4) or pdm_privado.anulado(r2)));

  -- Una cadena nunca queda a medias, aunque alguien escriba la fila a mano
  v_msg := pg_temp.fallo_de_correr(v_admin, format(
    'insert into public.pdm_anulaciones (lote, reporte_id, accion, motivo, actor_id, actor_nombre) values (gen_random_uuid(), %L::uuid, ''anular'', %L, %L::uuid, ''x''); set constraints public.pdm_anulaciones_cadena immediate',
    r6, v_mot, v_admin));
  perform pg_temp.chequear('anular solo la última versión de una cadena se rechaza', v_msg like '23514%juntos%');
  perform pg_temp.chequear('y el intento fallido no dejó nada', not (select pdm_privado.anulado(r6)));

  -- ══ 2025: restaurar un avance exige que el anterior siga aprobado ════════
  a1 := pg_temp.reportar(v_r, v_i, v_plan, 2025, 5);
  perform pg_temp.validar(v_c, a1, 'aprobado');
  a2 := pg_temp.reportar(v_r, v_i, v_plan, 2025, 9);
  perform pg_temp.anular(v_admin, a2, v_mot);
  perform pg_temp.validar(v_c, a1, 'devuelto', 'Reabierto: la cifra se reportó mal.');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_restaurar_reporte(%L::uuid, %L)', a2, v_mot));
  perform pg_temp.chequear('no se restaura un avance si el reporte anterior dejó de estar aprobado', v_msg like '23514%ya no está aprobado%');
  perform pg_temp.chequear('el intento fallido no restauró nada', (select pdm_privado.anulado(a2)));

  -- ══ Quién puede y con qué motivo ═════════════════════════════════════════
  -- Quien no es administrador (aquí, una sesión de alguien que ni existe en el sistema: no es admin de ninguna manera).
  v_msg := pg_temp.fallo_de(gen_random_uuid(), format('select public.pdm_anular_reporte(%L::uuid, %L)', r6, v_mot));
  perform pg_temp.chequear('quien no es administrador no anula', v_msg like '42501%administrador%');
  v_msg := pg_temp.fallo_de(gen_random_uuid(), format('select public.pdm_restaurar_reporte(%L::uuid, %L)', a2, v_mot));
  perform pg_temp.chequear('quien no es administrador no restaura', v_msg like '42501%administrador%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_anular_reporte(%L::uuid, %L)', r6, 'corto'));
  perform pg_temp.chequear('sin motivo de al menos 10 caracteres no se anula', v_msg like '22023%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_anular_reporte(%L::uuid, null)', r6));
  perform pg_temp.chequear('sin motivo no se anula', v_msg like '22023%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_anular_reporte(%L::uuid, %L)', r6, repeat('x', 501)));
  perform pg_temp.chequear('un motivo de más de 500 caracteres se rechaza', v_msg like '22001%');
  v_msg := pg_temp.fallo_de(v_admin, format('select public.pdm_anular_reporte(%L::uuid, %L)', gen_random_uuid(), v_mot));
  perform pg_temp.chequear('un reporte que no existe se rechaza con una frase clara', v_msg like '42501%no existe%');

  -- La tabla solo crece
  v_msg := pg_temp.fallo_de_correr(v_admin, format(
    'insert into public.pdm_anulaciones (lote, reporte_id, accion, motivo, actor_id, actor_nombre) values (gen_random_uuid(), %L::uuid, ''anular'', %L, %L::uuid, ''x'')',
    r6, v_mot, gen_random_uuid()));
  perform pg_temp.chequear('nadie escribe una anulación a nombre de otro', v_msg like '42501%');
  v_msg := pg_temp.fallo_de_correr(v_admin, 'update public.pdm_anulaciones set motivo = ''Otro motivo cualquiera''');
  perform pg_temp.chequear('nadie actualiza una anulación', v_msg like '42501%');
  v_msg := pg_temp.fallo_de_correr(v_admin, 'delete from public.pdm_anulaciones');
  perform pg_temp.chequear('nadie borra una anulación', v_msg like '42501%');
  -- Quien no es administrador tampoco escribe directo en la tabla (otra vez, una sesión que no existe en el sistema).
  v_otro := gen_random_uuid();
  v_msg := pg_temp.fallo_de_correr(v_otro, format(
    'insert into public.pdm_anulaciones (lote, reporte_id, accion, motivo, actor_id, actor_nombre) values (gen_random_uuid(), %L::uuid, ''anular'', %L, %L::uuid, ''x'')',
    r6, v_mot, v_otro));
  perform pg_temp.chequear('quien no es administrador no escribe en la tabla', v_msg like '42501%');
  perform pg_temp.chequear('y nada quedó escrito', not (select pdm_privado.anulado(r6)));

  -- ══ Ninguna función ni vista de reportes se quedó sin saltar lo anulado ═══
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_msg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'pdm_privado') and p.prokind = 'f'
    and p.prosrc ilike '%pdm_reportes%' and p.prosrc not ilike '%anulado%'
    and p.proname not in ('preparar_evidencia');   -- solo comprueba que el reporte sea de quien sube el archivo
  perform pg_temp.chequear('ninguna función que lee reportes se olvidó de lo anulado' || coalesce(' (' || v_msg || ')', ''), v_msg is null);
  select string_agg(v.viewname, ', ') into v_msg
  from pg_views v where v.schemaname = 'public' and v.definition ilike '%pdm_reportes%' and v.definition not ilike '%anulado%';
  perform pg_temp.chequear('ninguna vista que lee reportes se olvidó de lo anulado' || coalesce(' (' || v_msg || ')', ''), v_msg is null);

  -- ── Resultado ───────────────────────────────────────────────────────────
  select count(*) filter (where not ok), count(*) into v_fallas, v_total from res;
  select format('PDM-ANULAR: %s comprobaciones, %s fallas', v_total, v_fallas)
         || coalesce(E'\n' || (select string_agg(case when ok then '  ok     ' else '  FALLA  ' end || descr, E'\n') from res), '')
    into v_resultado;
  raise exception '%', v_resultado;
end $$;

select 1/0;   -- red de seguridad: si el bloque terminara sin error, esto lo hace fallar y deshace todo
