-- ============================================================================
-- Suspensión y reinicio de un contrato (migración 082).
--
-- QUÉ COMPRUEBA
--   S · Suspender: deja el contrato suspendido; no se suspende dos veces; no se suspende fuera del plazo
--       (sobre un contrato VIGENTE, para que la razón sea la fecha y no el estado).
--   T · Terminar un contrato suspendido cierra la suspensión con la fecha de terminación; si la suspensión empezó
--       después del último día de ejecución, la terminación se niega; deshacer la terminación reabre la suspensión.
--   R · Reiniciar: vuelve a vigente y cuenta los días suspendido; no se reinicia uno vigente.
--
-- CÓMO SE CORRE: pegar el archivo entero en el editor SQL (o por la herramienta de la sesión), con las migraciones 080,
-- 081 y 082 aplicadas. NO DEJA NADA ESCRITO: los datos de prueba se crean y se destruyen dentro de un bloque que termina
-- con un error a propósito. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «SUSPENSION: N comprobaciones, 0 fallas».
-- ============================================================================

create temp table resultados (ok boolean, nombre text, detalle text) on commit drop;

create or replace function pg_temp.chequeo(p_ok boolean, p_nombre text, p_detalle text default null) returns void
language sql as $f$ insert into resultados values (coalesce(p_ok, false), p_nombre, p_detalle) $f$;

do $prueba$
declare
  v_mun uuid; v_dep uuid; v_ct uuid; v_sup uuid; v_adm uuid; v_c uuid; v_c2 uuid; v_c3 uuid;
  r jsonb; msg text; s record; n int;
begin
  select id into v_mun from public.municipios limit 1;
  select id into v_dep from public.dependencias limit 1;
  select id into v_ct  from public.usuarios where rol = 'contratista' and activo order by created_at limit 1;
  select id into v_sup from public.usuarios where rol = 'supervisor'  and activo order by created_at limit 1;
  select id into v_adm from public.usuarios where rol = 'admin'       and activo order by created_at limit 1;
  if v_mun is null or v_dep is null or v_ct is null or v_sup is null or v_adm is null then
    raise exception 'SUSPENSION: faltan datos base para la prueba';
  end if;

  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-SUSP-1', 2026, 'Prueba suspensión (se deshace)', 18000000, 3000000, 6, '2026-07-01', '2026-12-31') returning id into v_c;
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-SUSP-2', 2026, 'Prueba suspensión 2 (se deshace)', 18000000, 3000000, 6, '2026-07-01', '2026-12-31') returning id into v_c2;
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-SUSP-3', 2026, 'Prueba suspensión 3 (se deshace)', 18000000, 3000000, 6, '2026-07-01', '2026-12-31') returning id into v_c3;

  -- S1 · suspender deja el contrato suspendido
  r := public.suspender_contrato(v_c, '2026-09-01', 'Licencia de maternidad', 'S-1', '2026-08-30', v_adm);
  select estado into msg from public.contratos where id = v_c;
  perform pg_temp.chequeo(msg = 'suspendido', 'S1 · suspender deja el contrato suspendido', msg);

  -- S2 · no se suspende dos veces (el contrato ya está suspendido)
  begin perform public.suspender_contrato(v_c, '2026-09-05', 'otra', null, null, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%solo se suspende uno vigente%', 'S2 · no se suspende dos veces', msg);

  -- S3 · no se suspende fuera del plazo, sobre un contrato VIGENTE
  begin perform public.suspender_contrato(v_c3, '2027-01-05', 'fuera de plazo', null, null, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%dentro del plazo del contrato%' and (select estado from public.contratos where id = v_c3) = 'vigente',
    'S3 · no se suspende fuera del plazo (contrato vigente, la fecha es la razón)', msg);

  -- T1 · terminar un contrato suspendido cierra la suspensión con la fecha de terminación
  r := public.terminar_contrato(v_c, 'mutuo_acuerdo', '2026-10-15', null, null, 'Renuncia', null, v_adm);
  select * into s from public.contrato_suspensiones where contrato_id = v_c;
  perform pg_temp.chequeo(s.fecha_reinicio = '2026-10-15' and s.cerrada_por_terminacion and s.reiniciada_por is null,
    'T1 · terminar un contrato suspendido cierra la suspensión con la fecha de terminación', row_to_json(s)::text);

  -- T2 · deshacer la terminación reabre la suspensión
  r := public.revertir_terminacion(v_c, 'se registró mal', v_adm);
  select * into s from public.contrato_suspensiones where contrato_id = v_c;
  select estado into msg from public.contratos where id = v_c;
  perform pg_temp.chequeo(msg = 'suspendido' and s.fecha_reinicio is null and not s.cerrada_por_terminacion,
    'T2 · deshacer la terminación reabre la suspensión', msg || ' · ' || row_to_json(s)::text);

  -- R1 · reiniciar vuelve a vigente y cuenta los días suspendido
  r := public.reiniciar_contrato(v_c, '2026-10-01', 'R-1', '2026-09-30', v_adm);
  select estado into msg from public.contratos where id = v_c;
  perform pg_temp.chequeo(msg = 'vigente' and (r->>'dias_suspendido') = '30',
    'R1 · el reinicio vuelve el contrato a vigente y cuenta los días', r::text);

  -- R2 · no se reinicia un contrato que no está suspendido
  begin perform public.reiniciar_contrato(v_c, '2026-10-05', null, null, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%solo se reinicia uno suspendido%', 'R2 · no se reinicia un contrato vigente', msg);

  -- T3 · no se termina antes de una suspensión que ya empezó (la suspensión queda igual)
  r := public.suspender_contrato(v_c2, '2026-10-20', 'Acta de suspensión 2', null, null, v_adm);
  begin perform public.terminar_contrato(v_c2, 'mutuo_acuerdo', '2026-10-15', null, null, 'x', null, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%reinícielo antes de terminarlo%', 'T3 · no se termina antes de una suspensión que ya empezó', msg);
  select estado into msg from public.contratos where id = v_c2;
  perform pg_temp.chequeo(msg = 'suspendido', 'T3 · y el contrato queda suspendido, sin cambios', msg);

  raise exception using message = format(E'SUSPENSION: %s comprobaciones, %s fallas\n%s',
    (select count(*) from resultados), (select count(*) from resultados where not ok),
    (select string_agg(case when ok then 'ok     ' else 'FALLA  ' end || nombre || coalesce('  [' || detalle || ']', ''), E'\n') from resultados));
end
$prueba$;

select 1/0;  -- red de seguridad: si el bloque de arriba terminara sin error, esto aborta la transacción
