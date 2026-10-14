-- REVERSIÓN de 063_acta_terminacion_vigencia.sql
--
-- ⚠ Solo es seguro mientras NINGUNA acta esté «sin efecto». Comprobar antes:
--     select count(*) from public.actas_terminacion where vigencia = 'sin_efecto';
-- Si devuelve más de 0, borrar la columna `vigencia` volvería a hacer pasar por vigente un acta que un otrosí dejó sin
-- efecto, y se perdería el dato de cuál otrosí fue. En ese caso NO revertir: resolver primero esas actas.
--
-- Si se aplicó también la 064 (varias actas por contrato), revertir ANTES esa (ver 064_…): la restricción única por
-- contrato no se puede recrear si hay actas anteriores conservadas.
--
-- Restaura las dos funciones tal como las dejó la 061 y quita lo que añadió la 063. Los permisos no cambian.

-- Funciones de la 061:
create or replace function public.aplicar_otrosi(p_otrosi uuid, p_fecha_fin date, p_periodos jsonb, p_usuario uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_o public.otrosies%rowtype;
  v_fin_actual date;
  v_creados int := 0;
  v_p jsonb;
  v_ini date; v_fin date; v_valor numeric; v_mes text; v_anio int; v_num int;
begin
  if p_fecha_fin is null then
    raise exception 'OTROSI: la nueva fecha de terminación es obligatoria' using errcode = '22023';
  end if;

  select * into v_o from public.otrosies where id = p_otrosi for update;
  if not found then raise exception 'OTROSI: el otrosí no existe' using errcode = 'P0002'; end if;
  if v_o.aplicado_en is not null then
    raise exception 'OTROSI: este otrosí ya se aplicó' using errcode = '22023';
  end if;

  select fecha_fin into v_fin_actual from public.contratos where id = v_o.contrato_id for update;
  if p_fecha_fin < v_fin_actual then
    raise exception 'OTROSI: la nueva fecha de terminación no puede ser anterior a la actual (%)', to_char(v_fin_actual, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  if p_periodos is not null and jsonb_typeof(p_periodos) <> 'array' then
    raise exception 'OTROSI: los periodos no vienen en el formato esperado' using errcode = '22023';
  end if;

  for v_p in select value from jsonb_array_elements(coalesce(p_periodos, '[]'::jsonb)) loop
    v_ini := (v_p->>'fecha_inicio')::date;
    v_fin := (v_p->>'fecha_fin')::date;
    v_valor := (v_p->>'valor_cobro')::numeric;
    v_mes := nullif(trim(v_p->>'mes'), '');
    v_anio := (v_p->>'anio')::int;
    v_num := (v_p->>'numero_periodo')::int;
    if v_ini is null or v_fin is null or v_mes is null or v_anio is null or v_num is null then
      raise exception 'OTROSI: un periodo viene incompleto' using errcode = '22023';
    end if;
    if v_fin < v_ini then
      raise exception 'OTROSI: el periodo de % % termina antes de empezar', v_mes, v_anio using errcode = '22023';
    end if;
    if v_fin > p_fecha_fin then
      raise exception 'OTROSI: el periodo de % % termina el %, después de la nueva fecha de terminación (%)',
        v_mes, v_anio, to_char(v_fin, 'DD/MM/YYYY'), to_char(p_fecha_fin, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    if v_valor is null or v_valor < 0 then
      raise exception 'OTROSI: el valor de % % debe ser 0 o mayor', v_mes, v_anio using errcode = '22023';
    end if;
    -- Un mes que ya tiene periodo no se vuelve a crear (y no queda ligado a este otrosí: no es suyo).
    if exists (select 1 from public.periodos where contrato_id = v_o.contrato_id and lower(mes) = lower(v_mes) and anio = v_anio) then
      continue;
    end if;
    insert into public.periodos (contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado, es_historico, otrosi_id)
    values (v_o.contrato_id, v_num, v_mes, v_anio, v_ini, v_fin, round(v_valor), 'borrador', false, p_otrosi);
    v_creados := v_creados + 1;
  end loop;

  -- `clock_timestamp()` y no `now()`: dos otrosíes aplicados en la misma transacción tendrían la misma hora, y el
  -- orden en que se deshacen depende de ella.
  update public.otrosies
     set aplicado_en = clock_timestamp(), aplicado_por = p_usuario, fecha_fin_anterior = v_fin_actual, fecha_fin_aplicada = p_fecha_fin
   where id = p_otrosi;
  update public.contratos set fecha_fin = p_fecha_fin where id = v_o.contrato_id;

  return jsonb_build_object('creados', v_creados);
end
$$;

create or replace function public.eliminar_otrosi(p_otrosi uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_o public.otrosies%rowtype;
  v_fin_actual date;
  v_posterior int;
  v_bloqueo text;
  v_borrados int := 0;
begin
  select * into v_o from public.otrosies where id = p_otrosi for update;
  if not found then raise exception 'OTROSI: el otrosí no existe' using errcode = 'P0002'; end if;
  select fecha_fin into v_fin_actual from public.contratos where id = v_o.contrato_id for update;

  -- Registrado y nunca aplicado: no cambió nada del contrato, se borra y ya.
  if v_o.aplicado_en is null and not exists (select 1 from public.periodos where otrosi_id = p_otrosi) then
    delete from public.otrosies where id = p_otrosi;
    return jsonb_build_object('revertido', false, 'periodos', 0, 'fecha_fin', v_fin_actual);
  end if;

  -- Se deshacen en orden: primero el último que se aplicó.
  select numero into v_posterior from public.otrosies
   where contrato_id = v_o.contrato_id and id <> p_otrosi and aplicado_en is not null
     and aplicado_en > coalesce(v_o.aplicado_en, '-infinity'::timestamptz)
   order by aplicado_en desc limit 1;
  if v_posterior is not null then
    raise exception 'OTROSI: primero hay que eliminar el otrosí N.º %, que se aplicó después de este', v_posterior
      using errcode = '23503';
  end if;

  -- Lo ya presentado no se borra: ningún periodo del otrosí puede haber avanzado ni tener información.
  select string_agg(format('%s %s', p.mes, p.anio), ', ' order by p.fecha_inicio) into v_bloqueo
    from public.periodos p
   where p.otrosi_id = p_otrosi
     and (p.estado <> 'borrador' or p.es_historico
          or exists (select 1 from public.actividades x where x.periodo_id = p.id)
          or exists (select 1 from public.aprobaciones x where x.periodo_id = p.id)
          or exists (select 1 from public.preaprobaciones x where x.periodo_id = p.id)
          or exists (select 1 from public.documentos x where x.periodo_id = p.id)
          or exists (select 1 from public.documentos_emitidos x where x.periodo_id = p.id)
          or exists (select 1 from public.obligacion_revisiones x where x.periodo_id = p.id)
          or exists (select 1 from public.actas_terminacion x where x.periodo_id = p.id)
          or exists (select 1 from public.historial_periodos x where x.periodo_id = p.id));
  if v_bloqueo is not null then
    raise exception 'OTROSI: no se puede eliminar: estos periodos del otrosí ya avanzaron o tienen información registrada: %. Lo que ya se presentó no se borra.', v_bloqueo
      using errcode = '23503';
  end if;

  -- No se pisa un cambio hecho a mano después de aplicarlo.
  if v_o.fecha_fin_aplicada is not null and v_fin_actual is distinct from v_o.fecha_fin_aplicada then
    raise exception 'OTROSI: la fecha de terminación del contrato cambió después de aplicar este otrosí (hoy es %; el otrosí la dejó en %). Revísela antes de eliminarlo.',
      to_char(v_fin_actual, 'DD/MM/YYYY'), to_char(v_o.fecha_fin_aplicada, 'DD/MM/YYYY') using errcode = '23503';
  end if;

  delete from public.periodos where otrosi_id = p_otrosi;
  get diagnostics v_borrados = row_count;
  if v_o.fecha_fin_anterior is not null then
    update public.contratos set fecha_fin = v_o.fecha_fin_anterior where id = v_o.contrato_id;
  end if;
  delete from public.otrosies where id = p_otrosi;

  return jsonb_build_object('revertido', true, 'periodos', v_borrados, 'fecha_fin', coalesce(v_o.fecha_fin_anterior, v_fin_actual));
end
$$;

-- Lo que añadió la 063:
drop index if exists public.actas_terminacion_sin_efecto_otrosi_idx;
alter table public.actas_terminacion drop constraint if exists actas_terminacion_sin_efecto_coherente;
alter table public.actas_terminacion drop constraint if exists actas_terminacion_vigencia_check;
alter table public.actas_terminacion
  drop column if exists sin_efecto_otrosi_id,
  drop column if exists sin_efecto_en,
  drop column if exists vigencia;
