-- ============================================================================
-- Acta de terminación con vigencia + aplicar/eliminar otrosíes (migraciones 061, 063 y 064).
--
-- QUÉ COMPRUEBA
--   A · Que lo existente no cambió: ninguna acta previa está «sin efecto».
--   B · El caso que motivó la 063: el acta se firma y DESPUÉS se decide el otrosí.
--         · el acta queda «sin efecto» (se haya emitido o no) y el documento NO se toca (pdf, código, huella, fecha);
--         · una adición sin prórroga (la terminación no pasa de la fecha del acta) la deja vigente;
--         · el contrato puede firmar un acta NUEVA, pero no dos vigentes a la vez;
--         · eliminar el otrosí repone el acta anterior, salvo que ya haya otra vigente;
--         · borrar un contrato con un acta «sin efecto» no choca con la clave hacia el otrosí.
--   C · La prueba de la 061 que se perdió (mayo–octubre de 2026): no se aplica dos veces, no se retrocede la
--       terminación, ningún periodo pasa de la nueva fecha, se deshacen en orden, lo presentado no se borra y no se
--       pisa un cambio hecho a mano.
--
-- CÓMO SE CORRE: pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la sesión), con las
-- migraciones 063 y 064 ya aplicadas. NO DEJA NADA ESCRITO, ni en producción: los datos de prueba (un contrato con sus
-- periodos, actas y otrosíes) se crean y se destruyen dentro de un bloque que termina con un error a propósito, y
-- Postgres deshace la transacción entera. EL MENSAJE DE ESE ERROR ES EL RESULTADO: «ACTA-OTROSI: N comprobaciones,
-- 0 fallas» y la lista. La última línea (1/0) es una red de seguridad por si el bloque terminara sin error.
--
-- Para ensayar las migraciones ANTES de aplicarlas: pegar primero 063 y 064 y después este archivo, todo en una sola
-- ejecución; el error final también deshace las migraciones.
--
-- No suplanta a ningún usuario ni lleva identificadores de personas: toma de la propia base un municipio, una
-- dependencia, un contratista, un supervisor y un administrador como destinos de las claves foráneas.
-- ============================================================================

create temp table resultados (ok boolean, nombre text, detalle text) on commit drop;

create or replace function pg_temp.chequeo(p_ok boolean, p_nombre text, p_detalle text default null) returns void
language sql as $f$ insert into resultados values (coalesce(p_ok, false), p_nombre, p_detalle) $f$;

do $prueba$
declare
  v_mun uuid; v_dep uuid; v_ct uuid; v_sup uuid; v_adm uuid;
  v_c uuid; v_c2 uuid; v_c3 uuid;
  v_p_sep uuid; v_p_oct uuid;
  v_o1 uuid; v_o2 uuid; v_o3 uuid; v_o4 uuid; v_o5 uuid; v_o6 uuid;
  v_a uuid; v_b uuid; v_a2 uuid;
  r jsonb; msg text; n int; f date;
  ant record; des record;
  previas int;
  per_oct jsonb; per_oct_nov jsonb;
begin
  select id into v_mun from public.municipios limit 1;
  select id into v_dep from public.dependencias limit 1;
  select id into v_ct  from public.usuarios where rol = 'contratista' and activo order by created_at limit 1;
  select id into v_sup from public.usuarios where rol = 'supervisor'  and activo order by created_at limit 1;
  select id into v_adm from public.usuarios where rol = 'admin'       and activo order by created_at limit 1;
  if v_mun is null or v_dep is null or v_ct is null or v_sup is null or v_adm is null then
    raise exception 'ACTA-OTROSI: faltan datos base para armar la prueba (municipio, dependencia o usuarios)';
  end if;

  per_oct := jsonb_build_array(jsonb_build_object('numero_periodo',5,'mes','Octubre','anio',2026,'fecha_inicio','2026-10-01','fecha_fin','2026-10-31','valor_cobro',250000));
  per_oct_nov := per_oct || jsonb_build_array(jsonb_build_object('numero_periodo',6,'mes','Noviembre','anio',2026,'fecha_inicio','2026-11-01','fecha_fin','2026-11-30','valor_cobro',250000));

  -- ── A · Lo existente no cambió ─────────────────────────────────────────────────────────────────────────────
  select count(*) into n from public.actas_terminacion
   where vigencia <> 'vigente' or sin_efecto_en is not null or sin_efecto_otrosi_id is not null;
  perform pg_temp.chequeo(n = 0, 'A1 · ninguna acta que ya existía está «sin efecto»', 'sin efecto: ' || n);
  select count(*) into previas from public.actas_terminacion;
  select count(*) into n from (select contrato_id from public.actas_terminacion where vigencia = 'vigente' group by 1 having count(*) > 1) x;
  perform pg_temp.chequeo(n = 0, 'A2 · ningún contrato tiene dos actas vigentes', 'contratos con 2: ' || n);

  -- ── Contrato de prueba: 4 meses, con su acta firmada al final ─────────────────────────────────────────────
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-ACTA-1', 2026, 'Contrato de prueba (se deshace)', 1000000, 250000, 4, '2026-06-01', '2026-09-30')
  returning id into v_c;
  insert into public.periodos (contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado) values
    (v_c, 1, 'Junio',      2026, '2026-06-01', '2026-06-30', 250000, 'radicado'),
    (v_c, 2, 'Julio',      2026, '2026-07-01', '2026-07-31', 250000, 'radicado'),
    (v_c, 3, 'Agosto',     2026, '2026-08-01', '2026-08-31', 250000, 'radicado'),
    (v_c, 4, 'Septiembre', 2026, '2026-09-01', '2026-09-30', 250000, 'enviado');
  select id into v_p_sep from public.periodos where contrato_id = v_c and numero_periodo = 4;
  insert into public.actas_terminacion (contrato_id, contratista_id, periodo_id, fecha_terminacion, fecha_aceptacion, aceptado_por, texto_version)
  values (v_c, v_ct, v_p_sep, '2026-09-30', now(), v_ct, 'prueba') returning id into v_a;

  -- ── B1 · Acta aceptada pero NO emitida; al día siguiente se decide el otrosí ──────────────────────────────
  insert into public.otrosies (contrato_id, numero, tipo, fecha_inicio, plazo_dias_adicion, valor_adicion)
  values (v_c, 1, 'prorroga', '2026-10-01', 61, 500000) returning id into v_o1;
  r := public.aplicar_otrosi(v_o1, '2026-11-30', per_oct_nov, v_adm);
  select vigencia, sin_efecto_en, sin_efecto_otrosi_id into des from public.actas_terminacion where id = v_a;
  perform pg_temp.chequeo((r->>'actas_sin_efecto') = '1' and (r->>'creados') = '2',
    'B1 · aplicar el otrosí deja el acta sin efecto y crea sus 2 periodos', r::text);
  perform pg_temp.chequeo(des.vigencia = 'sin_efecto' and des.sin_efecto_en is not null and des.sin_efecto_otrosi_id = v_o1,
    'B1 · el acta registra cuándo y por cuál otrosí quedó sin efecto');
  select fecha_fin into f from public.contratos where id = v_c;
  perform pg_temp.chequeo(f = '2026-11-30', 'B1 · el contrato terminará el 30-nov', f::text);

  -- ── B2 · Un acta NUEVA sí; dos vigentes a la vez no ───────────────────────────────────────────────────────
  begin
    insert into public.actas_terminacion (contrato_id, contratista_id, periodo_id, fecha_terminacion, fecha_aceptacion, aceptado_por, texto_version)
    values (v_c, v_ct, v_p_sep, '2026-11-30', now(), v_ct, 'prueba') returning id into v_b;
    msg := 'permitido';
  exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform pg_temp.chequeo(msg = 'permitido', 'B2 · con el acta anterior sin efecto, el contrato puede firmar una nueva', msg);
  begin
    insert into public.actas_terminacion (contrato_id, contratista_id, periodo_id, fecha_terminacion, fecha_aceptacion, aceptado_por, texto_version)
    values (v_c, v_ct, v_p_sep, '2026-11-30', now(), v_ct, 'prueba');
    msg := 'permitido';
  exception when unique_violation then msg := 'rechazado'; end;
  perform pg_temp.chequeo(msg = 'rechazado', 'B2 · pero no puede haber dos actas vigentes a la vez', msg);

  -- ── B3 · Eliminar el otrosí con otra acta vigente firmada después: se niega ──────────────────────────────
  begin
    perform public.eliminar_otrosi(v_o1);
    msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%acta de terminación vigente%',
    'B3 · no se elimina el otrosí si ya hay un acta vigente posterior', msg);

  -- ── B4 · Sin esa acta nueva, eliminar el otrosí repone la anterior ───────────────────────────────────────
  delete from public.actas_terminacion where id = v_b;
  r := public.eliminar_otrosi(v_o1);
  select vigencia, sin_efecto_en, sin_efecto_otrosi_id into des from public.actas_terminacion where id = v_a;
  select fecha_fin into f from public.contratos where id = v_c;
  perform pg_temp.chequeo((r->>'revertido') = 'true' and (r->>'periodos') = '2' and (r->>'actas_repuestas') = '1',
    'B4 · eliminar el otrosí lo deshace y repone el acta', r::text);
  perform pg_temp.chequeo(des.vigencia = 'vigente' and des.sin_efecto_en is null and des.sin_efecto_otrosi_id is null,
    'B4 · el acta vuelve a ser vigente, sin rastro de haber estado sin efecto');
  perform pg_temp.chequeo(f = '2026-09-30', 'B4 · la terminación vuelve al 30-sep', f::text);

  -- ── B5 · Acta YA EMITIDA: queda sin efecto pero el documento no se toca (regla 3) ────────────────────────
  update public.actas_terminacion
     set pdf_path = 'prueba/acta.pdf', codigo = 'PRUEBA-0001', hash_sha256 = 'abc123', emitida_en = '2026-09-30 17:00+00'
   where id = v_a;
  select pdf_path, codigo, hash_sha256, emitida_en, fecha_terminacion into ant from public.actas_terminacion where id = v_a;
  insert into public.otrosies (contrato_id, numero, tipo, fecha_inicio, plazo_dias_adicion, valor_adicion)
  values (v_c, 2, 'prorroga', '2026-10-01', 31, 250000) returning id into v_o2;
  r := public.aplicar_otrosi(v_o2, '2026-10-31', per_oct, v_adm);
  select vigencia, pdf_path, codigo, hash_sha256, emitida_en, fecha_terminacion into des from public.actas_terminacion where id = v_a;
  perform pg_temp.chequeo(des.vigencia = 'sin_efecto', 'B5 · un acta ya emitida también queda sin efecto', r::text);
  perform pg_temp.chequeo(
    des.pdf_path is not distinct from ant.pdf_path and des.codigo is not distinct from ant.codigo
    and des.hash_sha256 is not distinct from ant.hash_sha256 and des.emitida_en is not distinct from ant.emitida_en
    and des.fecha_terminacion is not distinct from ant.fecha_terminacion,
    'B5 · el documento emitido no se tocó: mismo PDF, código, huella, fecha de emisión y fecha de terminación');

  -- ── B6 · Una adición sin prórroga no deja sin efecto un acta que sigue siendo cierta ─────────────────────
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-ACTA-2', 2026, 'Contrato de prueba 2 (se deshace)', 1000000, 250000, 4, '2026-06-01', '2026-09-30')
  returning id into v_c2;
  insert into public.actas_terminacion (contrato_id, contratista_id, fecha_terminacion, fecha_aceptacion, aceptado_por, texto_version)
  values (v_c2, v_ct, '2026-09-30', now(), v_ct, 'prueba') returning id into v_a2;
  insert into public.otrosies (contrato_id, numero, tipo, fecha_inicio, plazo_dias_adicion, valor_adicion)
  values (v_c2, 1, 'adicion', '2026-09-30', 0, 300000) returning id into v_o3;
  r := public.aplicar_otrosi(v_o3, '2026-09-30', '[]'::jsonb, v_adm);
  select vigencia into des from public.actas_terminacion where id = v_a2;
  perform pg_temp.chequeo((r->>'actas_sin_efecto') = '0' and des.vigencia = 'vigente',
    'B6 · una adición que no mueve la terminación deja vigente el acta', r::text);

  -- ── B7 · Borrar el contrato con un acta «sin efecto» no choca con la clave hacia el otrosí ───────────────
  begin
    delete from public.contratos where id = v_c;
    msg := 'borrado';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg = 'borrado', 'B7 · se puede borrar un contrato cuya acta quedó sin efecto por un otrosí', msg);

  -- ── C · La prueba de la 061 que se perdió ────────────────────────────────────────────────────────────────
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-ACTA-3', 2026, 'Contrato de prueba 3 (se deshace)', 1000000, 250000, 4, '2026-06-01', '2026-09-30')
  returning id into v_c3;
  insert into public.periodos (contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado) values
    (v_c3, 1, 'Junio',      2026, '2026-06-01', '2026-06-30', 250000, 'radicado'),
    (v_c3, 4, 'Septiembre', 2026, '2026-09-01', '2026-09-30', 250000, 'radicado');

  insert into public.otrosies (contrato_id, numero, tipo, fecha_inicio, plazo_dias_adicion, valor_adicion)
  values (v_c3, 1, 'prorroga', '2026-10-01', 31, 250000) returning id into v_o4;
  r := public.aplicar_otrosi(v_o4, '2026-10-31', per_oct, v_adm);
  begin perform public.aplicar_otrosi(v_o4, '2026-10-31', per_oct, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%ya se aplicó%', 'C1 · un otrosí no se aplica dos veces', msg);

  insert into public.otrosies (contrato_id, numero, tipo, fecha_inicio, plazo_dias_adicion, valor_adicion)
  values (v_c3, 2, 'prorroga', '2026-11-01', 30, 250000) returning id into v_o5;
  begin perform public.aplicar_otrosi(v_o5, '2026-08-01', '[]'::jsonb, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%no puede ser anterior%', 'C2 · la terminación no puede retroceder', msg);

  begin perform public.aplicar_otrosi(v_o5, '2026-11-15', jsonb_build_array(jsonb_build_object('numero_periodo',6,'mes','Noviembre','anio',2026,'fecha_inicio','2026-11-01','fecha_fin','2026-11-30','valor_cobro',250000)), v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%después de la nueva fecha de terminación%', 'C3 · ningún periodo puede pasar de la nueva terminación', msg);

  r := public.aplicar_otrosi(v_o5, '2026-11-30', jsonb_build_array(jsonb_build_object('numero_periodo',6,'mes','Noviembre','anio',2026,'fecha_inicio','2026-11-01','fecha_fin','2026-11-30','valor_cobro',250000)), v_adm);
  begin perform public.eliminar_otrosi(v_o4); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%primero hay que eliminar el otrosí N.º 2%', 'C4 · los otrosíes se deshacen en orden: primero el último', msg);

  update public.periodos set estado = 'enviado' where contrato_id = v_c3 and numero_periodo = 6;
  begin perform public.eliminar_otrosi(v_o5); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%ya avanzaron%', 'C5 · lo ya presentado no se borra', msg);
  update public.periodos set estado = 'borrador' where contrato_id = v_c3 and numero_periodo = 6;

  update public.contratos set fecha_fin = '2026-12-05' where id = v_c3;
  begin perform public.eliminar_otrosi(v_o5); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%cambió después de aplicar%', 'C6 · no se pisa una fecha cambiada a mano después de aplicar', msg);
  update public.contratos set fecha_fin = '2026-11-30' where id = v_c3;

  r := public.eliminar_otrosi(v_o5);
  perform pg_temp.chequeo((r->>'revertido') = 'true' and (r->>'periodos') = '1', 'C7 · el último otrosí se deshace limpiamente', r::text);
  r := public.eliminar_otrosi(v_o4);
  select fecha_fin into f from public.contratos where id = v_c3;
  perform pg_temp.chequeo((r->>'revertido') = 'true' and f = '2026-09-30', 'C7 · y luego el primero, devolviendo la terminación original', f::text);

  -- Un otrosí registrado y nunca aplicado se borra sin tocar nada.
  insert into public.otrosies (contrato_id, numero, tipo, fecha_inicio, plazo_dias_adicion, valor_adicion)
  values (v_c3, 3, 'modificatorio', '2026-10-01', 0, 0) returning id into v_o6;
  r := public.eliminar_otrosi(v_o6);
  perform pg_temp.chequeo((r->>'revertido') = 'false', 'C8 · un otrosí nunca aplicado se borra sin deshacer nada', r::text);

  raise exception using message = format(E'ACTA-OTROSI: %s comprobaciones, %s fallas\n%s',
    (select count(*) from resultados),
    (select count(*) from resultados where not ok),
    (select string_agg(case when ok then 'ok     ' else 'FALLA  ' end || nombre || coalesce('  [' || detalle || ']', ''), E'\n') from resultados));
end
$prueba$;

select 1/0;  -- red de seguridad: si el bloque de arriba terminara sin error, esto aborta la transacción
