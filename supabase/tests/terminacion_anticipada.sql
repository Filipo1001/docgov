-- ============================================================================
-- Terminación anticipada de un contrato (migraciones 080 y 081).
--
-- QUÉ COMPRUEBA
--   A · Que lo existente no cambió: ningún contrato terminado, la fecha de fin efectiva es la pactada, ningún periodo anulado.
--   B · Lo que se rechaza: causal inválida, «otra» sin explicar, fechas fuera del contrato, periodos ya presentados o
--       históricos más allá del último día, el valor del periodo recortado que falta o se pasa.
--   C · El caso de siempre: termina el 15 de octubre; noviembre y diciembre quedan anulados, octubre recortado con su
--       valor nuevo, lo anterior intacto; el contrato queda terminado con su fecha pactada intacta y la efectiva nueva;
--       queda constancia en los tres historiales. No se termina dos veces.
--   D · Las protecciones de la base: nadie saca un periodo de «anulado» ni lo pone ahí por fuera de las funciones (ni el
--       servidor), un contrato terminado no admite otrosíes, y «terminado» no se separa de su fecha.
--   E · Deshacer: exige motivo, se niega si el periodo recortado ya se presentó, repone todo, y se puede volver a terminar.
--   F · Los bordes: un periodo devuelto se anula y vuelve devuelto; un acta de vencimiento ya aceptada queda sin efecto y
--       vuelve al deshacer; terminar el último día de un periodo no recorta nada; un contrato que nunca se ejecutó; uno
--       suspendido vuelve a suspendido; uno sin periodos; borrar un contrato terminado.
--   G · Permisos: solo el servidor ejecuta las funciones; anon no lee el registro.
--
-- CÓMO SE CORRE: pegar el archivo entero en el editor SQL de Supabase (o por la herramienta de la sesión), con las
-- migraciones 080 y 081 ya aplicadas. NO DEJA NADA ESCRITO, ni en producción: los datos de prueba se crean y se destruyen
-- dentro de un bloque que termina con un error a propósito, y Postgres deshace la transacción entera. EL MENSAJE DE ESE
-- ERROR ES EL RESULTADO: «TERMINACION: N comprobaciones, 0 fallas» y la lista. La última línea (1/0) es una red de
-- seguridad por si el bloque terminara sin error.
--
-- Para ensayar la 081 ANTES de aplicarla (con la 080 ya aplicada: su valor nuevo no se puede usar en la misma
-- transacción que lo crea): pegar primero la 081 sin su `begin;`/`commit;` y después este archivo, en una sola
-- ejecución; el error final también deshace la migración.
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
  v_c uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid;
  v_oct uuid; v_nov uuid; v_dic uuid; v_t uuid; v_acta uuid;
  r jsonb; msg text; n int; f date; t text;
  c record; p record; reg record;
begin
  select id into v_mun from public.municipios limit 1;
  select id into v_dep from public.dependencias limit 1;
  select id into v_ct  from public.usuarios where rol = 'contratista' and activo order by created_at limit 1;
  select id into v_sup from public.usuarios where rol = 'supervisor'  and activo order by created_at limit 1;
  select id into v_adm from public.usuarios where rol = 'admin'       and activo order by created_at limit 1;
  if v_mun is null or v_dep is null or v_ct is null or v_sup is null or v_adm is null then
    raise exception 'TERMINACION: faltan datos base para armar la prueba (municipio, dependencia o usuarios)';
  end if;

  -- ── A · Lo existente no cambió ─────────────────────────────────────────────────────────────────────────────
  select count(*) into n from public.contratos where fecha_terminacion is not null or estado = 'terminado';
  perform pg_temp.chequeo(n = 0, 'A1 · ningún contrato real está terminado', 'terminados: ' || n);
  select count(*) into n from public.contratos where fecha_fin_efectiva is distinct from fecha_fin;
  perform pg_temp.chequeo(n = 0, 'A2 · en todos los contratos la fecha de fin efectiva es la pactada', 'distintos: ' || n);
  select count(*) into n from public.periodos where estado = 'anulado';
  perform pg_temp.chequeo(n = 0, 'A3 · ningún periodo real está anulado', 'anulados: ' || n);
  select count(*) into n from public.contrato_terminaciones;
  perform pg_temp.chequeo(n = 0, 'A4 · el registro de terminaciones está vacío', 'filas: ' || n);

  -- ── Contrato de prueba: julio a diciembre, con el ciclo en marcha ──────────────────────────────────────────
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-TERM-1', 2026, 'Contrato de prueba (se deshace)', 18000000, 3000000, 6, '2026-07-01', '2026-12-31')
  returning id into v_c;
  insert into public.periodos (contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado) values
    (v_c, 1, 'Julio',      2026, '2026-07-01', '2026-07-31', 3000000, 'radicado'),
    (v_c, 2, 'Agosto',     2026, '2026-08-01', '2026-08-31', 3000000, 'aprobado'),
    (v_c, 3, 'Septiembre', 2026, '2026-09-01', '2026-09-30', 3000000, 'enviado'),
    (v_c, 4, 'Octubre',    2026, '2026-10-01', '2026-10-31', 3000000, 'borrador'),
    (v_c, 5, 'Noviembre',  2026, '2026-11-01', '2026-11-30', 3000000, 'borrador'),
    (v_c, 6, 'Diciembre',  2026, '2026-12-01', '2026-12-31', 3000000, 'borrador');
  select id into v_oct from public.periodos where contrato_id = v_c and numero_periodo = 4;
  select id into v_nov from public.periodos where contrato_id = v_c and numero_periodo = 5;
  select id into v_dic from public.periodos where contrato_id = v_c and numero_periodo = 6;

  -- ── B · Lo que se rechaza ──────────────────────────────────────────────────────────────────────────────────
  begin perform public.terminar_contrato(v_c, 'por_capricho', '2026-10-15', null, null, null, 1500000, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%causal no es válida%', 'B1 · una causal que no existe se rechaza', msg);

  begin perform public.terminar_contrato(v_c, 'otra', '2026-10-15', null, null, '   ', 1500000, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%explicar cuál%', 'B2 · «Otra causal» exige explicarla', msg);

  begin perform public.terminar_contrato(v_c, 'mutuo_acuerdo', '2026-12-31', null, null, null, null, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%anterior a la terminación pactada%', 'B3 · terminar el día pactado no es terminar antes', msg);

  begin perform public.terminar_contrato(v_c, 'mutuo_acuerdo', '2026-06-29', null, null, null, null, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%anterior al inicio%', 'B4 · el último día no puede caer antes del inicio (salvo el día anterior)', msg);

  begin perform public.terminar_contrato(v_c, 'caducidad', '2026-08-15', null, null, null, 1500000, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%ya se presentaron%' and msg like '%Agosto 2026 (aprobado)%' and msg like '%Septiembre 2026 (enviado)%',
    'B5 · no se termina antes de lo ya presentado, y dice qué lo impide', msg);

  begin perform public.terminar_contrato(v_c, 'mutuo_acuerdo', '2026-10-15', null, null, null, null, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%falta el valor del periodo de Octubre 2026%', 'B6 · el periodo recortado exige su valor', msg);

  begin perform public.terminar_contrato(v_c, 'mutuo_acuerdo', '2026-10-15', null, null, null, 3000001, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%entre 0 y 3.000.000%', 'B7 · el periodo recortado no vale más que completo', msg);

  select count(*) into n from public.periodos where contrato_id = v_c and estado = 'anulado';
  select estado into t from public.contratos where id = v_c;
  perform pg_temp.chequeo(n = 0 and t = 'vigente', 'B8 · un intento rechazado no deja nada a medias', format('anulados %s, estado %s', n, t));

  -- ── C · El caso de siempre: termina el 15 de octubre ──────────────────────────────────────────────────────
  r := public.terminar_contrato(v_c, 'mutuo_acuerdo', '2026-10-15', '2026-10-10', ' 012 ', 'Renuncia aceptada', 1500000.4, v_adm);
  v_t := (r->>'terminacion')::uuid;
  perform pg_temp.chequeo((r->>'anulados') = '2' and (r->'ajustado'->>'valor') = '1500000' and (r->'ajustado'->>'mes') = 'Octubre',
    'C1 · anula dos periodos y recorta octubre', r::text);

  select string_agg(mes || ':' || estado, ', ' order by numero_periodo) into t from public.periodos where contrato_id = v_c;
  perform pg_temp.chequeo(t = 'Julio:radicado, Agosto:aprobado, Septiembre:enviado, Octubre:borrador, Noviembre:anulado, Diciembre:anulado',
    'C2 · noviembre y diciembre anulados; lo anterior, intacto', t);

  select * into p from public.periodos where id = v_oct;
  perform pg_temp.chequeo(p.fecha_inicio = '2026-10-01' and p.fecha_fin = '2026-10-15' and p.valor_cobro = 1500000,
    'C3 · octubre va del 1 al 15 y vale lo indicado (redondeado)', format('%s a %s, %s', p.fecha_inicio, p.fecha_fin, p.valor_cobro));

  select * into c from public.contratos where id = v_c;
  perform pg_temp.chequeo(c.estado = 'terminado' and c.fecha_terminacion = '2026-10-15' and c.fecha_fin = '2026-12-31'
                          and c.fecha_fin_efectiva = '2026-10-15' and c.estado_fecha = '2026-10-15'
                          and c.estado_motivo = 'Mutuo acuerdo — Renuncia aceptada',
    'C4 · el contrato queda terminado; la fecha pactada no se toca y la efectiva es el último día',
    format('%s · %s · pactada %s · efectiva %s · «%s»', c.estado, c.fecha_terminacion, c.fecha_fin, c.fecha_fin_efectiva, c.estado_motivo));

  select * into reg from public.contrato_terminaciones where id = v_t;
  perform pg_temp.chequeo(reg.causal = 'mutuo_acuerdo' and reg.numero_acto = '012' and reg.fecha_acto = '2026-10-10'
                          and reg.contrato_estado_anterior = 'vigente' and jsonb_array_length(reg.periodos_anulados) = 2
                          and reg.periodo_ajustado_id = v_oct and reg.periodo_fecha_fin_anterior = '2026-10-31'
                          and reg.periodo_valor_anterior = 3000000 and reg.periodo_valor_nuevo = 1500000
                          and reg.registrada_por = v_adm and reg.revertida_en is null,
    'C5 · el registro guarda la causal, el acto y lo necesario para deshacerla', row_to_json(reg)::text);

  select count(*) into n from public.historial_periodos where periodo_id in (v_nov, v_dic) and estado_nuevo = 'anulado' and usuario_id = v_adm;
  select count(*) + n into n from public.historial_periodos where periodo_id = v_oct and comentario like 'Recortado por la terminación%';
  select count(*) + n into n from public.contratos_historial where contrato_id = v_c and campo = 'terminacion' and valor_nuevo like '%15/10/2026 · Mutuo acuerdo · acto 012 del 10/10/2026';
  perform pg_temp.chequeo(n = 4, 'C6 · queda constancia en el historial de cada periodo tocado y en el del contrato', 'filas: ' || n);

  begin perform public.terminar_contrato(v_c, 'mutuo_acuerdo', '2026-10-10', null, null, null, 1000000, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%está terminado%', 'C7 · un contrato no se termina dos veces', msg);

  -- ── D · Las protecciones de la base ───────────────────────────────────────────────────────────────────────
  begin update public.periodos set estado = 'borrador' where id = v_nov; msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%solo se recupera deshaciendo la terminación%', 'D1 · nadie saca un periodo de «anulado» por fuera (ni el servidor)', msg);

  begin update public.periodos set estado = 'anulado' where contrato_id = v_c and numero_periodo = 3; msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%solo se recupera deshaciendo la terminación%', 'D2 · nadie pone un periodo en «anulado» por fuera', msg);

  begin
    insert into public.periodos (contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado)
    values (v_c, 7, 'Enero', 2027, '2027-01-01', '2027-01-31', 1, 'anulado');
    msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%solo queda «anulado» al registrar%', 'D3 · no se crea un periodo ya anulado', msg);

  begin
    insert into public.otrosies (contrato_id, numero, tipo, fecha_inicio, plazo_dias_adicion, valor_adicion)
    values (v_c, 1, 'prorroga', '2027-01-01', 31, 3000000);
    msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%no admite otrosíes%', 'D4 · un contrato terminado no admite otrosíes', msg);

  begin update public.contratos set estado = 'vigente' where id = v_c; msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%contratos_terminacion_con_fecha%', 'D5 · «terminado» no se quita a mano dejando la fecha', msg);

  begin update public.contratos set fecha_terminacion = '2026-12-31' where id = v_c; msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%contratos_terminacion_dentro_del_plazo%', 'D6 · el último día no puede pasar de la fecha pactada', msg);

  -- ── E · Deshacer ──────────────────────────────────────────────────────────────────────────────────────────
  begin perform public.revertir_terminacion(v_c, '  ', v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%indica por qué%', 'E1 · deshacer exige motivo', msg);

  update public.periodos set estado = 'enviado' where id = v_oct;
  begin perform public.revertir_terminacion(v_c, 'Se registró en el contrato equivocado', v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%Octubre 2026 ya se presentó%', 'E2 · no se deshace si el periodo recortado ya se presentó', msg);
  update public.periodos set estado = 'borrador' where id = v_oct;

  r := public.revertir_terminacion(v_c, 'Se registró en el contrato equivocado', v_adm);
  perform pg_temp.chequeo((r->>'repuestos') = '2' and (r->>'ajuste_repuesto') = 'true', 'E3 · repone los dos periodos y el recortado', r::text);

  select string_agg(mes || ':' || estado || ':' || fecha_fin || ':' || valor_cobro, ', ' order by numero_periodo) into t
    from public.periodos where contrato_id = v_c and numero_periodo >= 4;
  perform pg_temp.chequeo(t = 'Octubre:borrador:2026-10-31:3000000, Noviembre:borrador:2026-11-30:3000000, Diciembre:borrador:2026-12-31:3000000',
    'E4 · cada periodo vuelve a su estado, su fecha y su valor', t);

  select * into c from public.contratos where id = v_c;
  perform pg_temp.chequeo(c.estado = 'vigente' and c.fecha_terminacion is null and c.fecha_fin_efectiva = '2026-12-31'
                          and c.estado_fecha is null and c.estado_motivo is null,
    'E5 · el contrato vuelve a como estaba', format('%s · %s · %s', c.estado, c.fecha_terminacion, c.fecha_fin_efectiva));

  select * into reg from public.contrato_terminaciones where id = v_t;
  perform pg_temp.chequeo(reg.revertida_por = v_adm and reg.revertida_en is not null and reg.motivo_reversion = 'Se registró en el contrato equivocado',
    'E6 · la terminación deshecha se conserva con quién, cuándo y por qué', row_to_json(reg)::text);

  begin perform public.revertir_terminacion(v_c, 'otra vez', v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%no tiene una terminación vigente%', 'E7 · no se deshace dos veces', msg);

  r := public.terminar_contrato(v_c, 'fuerza_mayor', '2026-10-31', null, null, null, 999, v_adm);
  select string_agg(mes || ':' || estado || ':' || fecha_fin || ':' || valor_cobro, ', ' order by numero_periodo) into t
    from public.periodos where contrato_id = v_c and numero_periodo >= 4;
  perform pg_temp.chequeo(r->'ajustado' = 'null'::jsonb and (r->>'anulados') = '2'
                          and t = 'Octubre:borrador:2026-10-31:3000000, Noviembre:anulado:2026-11-30:3000000, Diciembre:anulado:2026-12-31:3000000',
    'E8 · se puede volver a terminar; el último día de un periodo no recorta nada (y el valor se ignora)', r::text || ' · ' || t);
  select count(*) into n from public.contrato_terminaciones where contrato_id = v_c;
  perform pg_temp.chequeo(n = 2, 'E9 · el registro guarda las dos: la deshecha y la vigente', 'filas: ' || n);

  -- ── F · Los bordes ────────────────────────────────────────────────────────────────────────────────────────
  -- F1 · Un periodo devuelto más allá del último día se anula, y al deshacer vuelve devuelto.
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-TERM-2', 2026, 'Contrato de prueba 2 (se deshace)', 6000000, 2000000, 3, '2026-09-10', '2026-12-09')
  returning id into v_c2;
  insert into public.periodos (contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado) values
    (v_c2, 1, 'Septiembre', 2026, '2026-09-10', '2026-09-30', 2000000, 'borrador'),
    (v_c2, 2, 'Octubre',    2026, '2026-10-01', '2026-10-31', 2000000, 'rechazado'),
    (v_c2, 3, 'Noviembre',  2026, '2026-11-01', '2026-11-30', 2000000, 'borrador'),
    (v_c2, 4, 'Diciembre',  2026, '2026-12-01', '2026-12-09', 0,       'borrador');
  -- El contratista ya aceptó el acta de vencimiento del plazo (se acepta antes de enviar el último informe).
  insert into public.actas_terminacion (contrato_id, contratista_id, periodo_id, fecha_terminacion, fecha_aceptacion, aceptado_por, texto_version)
  select v_c2, v_ct, id, '2026-12-09', now(), v_ct, 'prueba' from public.periodos where contrato_id = v_c2 and numero_periodo = 4
  returning id into v_acta;
  r := public.terminar_contrato(v_c2, 'caducidad', '2026-09-20', '2026-10-25', 'Res. 345', null, 733333, v_sup);
  select string_agg(mes || ':' || estado, ', ' order by numero_periodo) into t from public.periodos where contrato_id = v_c2;
  perform pg_temp.chequeo(t = 'Septiembre:borrador, Octubre:anulado, Noviembre:anulado, Diciembre:anulado' and (r->'ajustado'->>'valor') = '733333',
    'F1 · un periodo devuelto más allá del último día también se anula; el primero se recorta', t);
  select vigencia into t from public.actas_terminacion where id = v_acta;
  perform pg_temp.chequeo(t = 'sin_efecto' and (r->>'actas_sin_efecto') = '1',
    'F1 · el acta de vencimiento ya aceptada queda sin efecto (diría que llegó a su fecha)', t || ' · ' || r::text);
  r := public.revertir_terminacion(v_c2, 'prueba', v_adm);
  select string_agg(mes || ':' || estado || ':' || fecha_fin, ', ' order by numero_periodo) into t from public.periodos where contrato_id = v_c2;
  perform pg_temp.chequeo(t = 'Septiembre:borrador:2026-09-30, Octubre:rechazado:2026-10-31, Noviembre:borrador:2026-11-30, Diciembre:borrador:2026-12-09',
    'F2 · al deshacer, el devuelto vuelve devuelto', t);
  select vigencia into t from public.actas_terminacion where id = v_acta;
  perform pg_temp.chequeo(t = 'vigente' and (r->>'actas_repuestas') = '1', 'F2 · y el acta vuelve a estar vigente', t || ' · ' || r::text);

  -- F3 · Un contrato que nunca se ejecutó: el último día es el anterior al inicio; todo queda anulado.
  r := public.terminar_contrato(v_c2, 'mutuo_acuerdo', '2026-09-09', null, null, 'No firmó el acta de inicio', null, v_adm);
  select count(*) into n from public.periodos where contrato_id = v_c2 and estado <> 'anulado';
  select fecha_fin_efectiva into f from public.contratos where id = v_c2;
  perform pg_temp.chequeo(n = 0 and f = '2026-09-09' and (r->>'anulados') = '4' and r->'ajustado' = 'null'::jsonb,
    'F3 · un contrato que nunca se ejecutó: todos sus periodos quedan anulados', r::text || ' · efectiva ' || f);

  -- F4 · Un periodo histórico más allá del último día lo impide.
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-TERM-3', 2026, 'Contrato de prueba 3 (se deshace)', 6000000, 2000000, 3, '2026-01-01', '2026-03-31')
  returning id into v_c3;
  insert into public.periodos (contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado, es_historico) values
    (v_c3, 1, 'Enero',   2026, '2026-01-01', '2026-01-31', 2000000, 'borrador', true),
    (v_c3, 2, 'Febrero', 2026, '2026-02-01', '2026-02-28', 2000000, 'borrador', true),
    (v_c3, 3, 'Marzo',   2026, '2026-03-01', '2026-03-31', 2000000, 'borrador', false);
  begin perform public.terminar_contrato(v_c3, 'mutuo_acuerdo', '2026-01-31', null, null, null, null, v_adm); msg := '(sin error)';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.chequeo(msg like '%Febrero 2026 (histórico)%', 'F4 · un periodo histórico más allá del último día lo impide', msg);

  -- F5 · Uno suspendido se termina, y al deshacer vuelve a suspendido con su fecha y su motivo.
  update public.contratos set estado = 'suspendido', estado_fecha = '2026-02-15', estado_motivo = 'Acta de suspensión 1' where id = v_c3;
  r := public.terminar_contrato(v_c3, 'unilateral', '2026-03-10', null, null, null, 666667, v_adm);
  perform public.revertir_terminacion(v_c3, 'prueba', v_adm);
  select * into c from public.contratos where id = v_c3;
  perform pg_temp.chequeo(c.estado = 'suspendido' and c.estado_fecha = '2026-02-15' and c.estado_motivo = 'Acta de suspensión 1',
    'F5 · un contrato suspendido vuelve a suspendido al deshacer', format('%s · %s · %s', c.estado, c.estado_fecha, c.estado_motivo));

  -- F6 · Un contrato sin periodos también se termina.
  insert into public.contratos (municipio_id, dependencia_id, contratista_id, supervisor_id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses, fecha_inicio, fecha_fin)
  values (v_mun, v_dep, v_ct, v_sup, 'PRUEBA-TERM-4', 2026, 'Contrato de prueba 4 (se deshace)', 3000000, 1000000, 3, '2026-10-01', '2026-12-31')
  returning id into v_c4;
  r := public.terminar_contrato(v_c4, 'muerte_incapacidad', '2026-10-20', null, null, null, null, v_adm);
  perform pg_temp.chequeo((r->>'anulados') = '0' and r->'ajustado' = 'null'::jsonb, 'F6 · un contrato sin periodos también se termina', r::text);

  -- F7 · Borrar un contrato terminado se lleva su registro.
  begin
    delete from public.contratos where id = v_c4;
    msg := 'borrado';
  exception when others then msg := sqlerrm; end;
  select count(*) into n from public.contrato_terminaciones where contrato_id = v_c4;
  perform pg_temp.chequeo(msg = 'borrado' and n = 0, 'F7 · borrar un contrato terminado se lleva su registro', msg);

  -- ── G · Permisos ──────────────────────────────────────────────────────────────────────────────────────────
  perform pg_temp.chequeo(
    not has_function_privilege('authenticated', 'public.terminar_contrato(uuid, text, date, date, text, text, numeric, uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.terminar_contrato(uuid, text, date, date, text, text, numeric, uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.revertir_terminacion(uuid, text, uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.revertir_terminacion(uuid, text, uuid)', 'EXECUTE'),
    'G1 · solo el servidor registra o deshace una terminación');
  perform pg_temp.chequeo(not has_table_privilege('anon', 'public.contrato_terminaciones', 'SELECT')
                          and not has_table_privilege('authenticated', 'public.contrato_terminaciones', 'INSERT'),
    'G2 · anon no lee el registro y ninguna sesión lo escribe');

  raise exception using message = format(E'TERMINACION: %s comprobaciones, %s fallas\n%s',
    (select count(*) from resultados),
    (select count(*) from resultados where not ok),
    (select string_agg(case when ok then 'ok     ' else 'FALLA  ' end || nombre || coalesce('  [' || detalle || ']', ''), E'\n') from resultados));
end
$prueba$;

select 1/0;  -- red de seguridad: si el bloque de arriba terminara sin error, esto aborta la transacción
