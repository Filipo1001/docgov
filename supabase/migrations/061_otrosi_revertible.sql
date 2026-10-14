-- ============================================================================
-- 061 · Otrosíes que se pueden deshacer
--
-- Aplicar un otrosí cambia el contrato: extiende su fecha de terminación y crea los periodos de los meses
-- nuevos. Hasta ahora nada recordaba qué había cambiado cada otrosí, y eliminarlo solo borraba su fila: el
-- contrato quedaba extendido y con los periodos creados (caso del contrato 045/2026, 8 de octubre de 2026).
--
--   1. Cada otrosí recuerda su aplicación: cuándo, quién, la fecha de terminación que había antes y la que dejó.
--   2. Cada periodo creado por un otrosí lo apunta (`periodos.otrosi_id`). La relación es NO ACTION: no se
--      puede borrar un otrosí dejando sus periodos huérfanos. Borrar el contrato entero sigue funcionando: la
--      cascada borra otrosíes y periodos en la misma sentencia y la relación se comprueba al final.
--   3. `aplicar_otrosi` y `eliminar_otrosi` hacen todo o nada, en una transacción. Eliminar un otrosí aplicado
--      lo DESHACE: borra sus periodos, devuelve la fecha anterior y lo elimina. No lo hace si:
--        · alguno de sus periodos ya avanzó o tiene información (actividades, aprobaciones, documentos…):
--          lo ya presentado no se borra (regla 3 de CLAUDE.md);
--        · hay un otrosí aplicado después (se deshacen en orden, del último al primero);
--        · alguien cambió la fecha de terminación después de aplicarlo (no se pisa ese cambio).
--   4. Un otrosí aplicado no cambia su fecha de inicio ni su plazo: para eso se elimina (se deshace) y se
--      registra de nuevo. El valor, CDP, CRP, tipo y nota sí se pueden corregir.
--   5. Se reconstruye el registro de los otrosíes que ya estaban aplicados.
--
-- Solo las llama el servidor (las acciones de otrosíes, con la clave de servicio, tras comprobar que quien
-- pide es administrador o contratación): ni `anon` ni `authenticated` pueden ejecutarlas.
--
-- Ninguna de las tablas tocadas tiene permisos por columna (regla 2 de CLAUDE.md: comprobado, 0 columnas).
-- ============================================================================

-- ── 1 y 2 · El registro de la aplicación ───────────────────────────────────

alter table public.otrosies
  add column if not exists aplicado_en timestamptz,
  add column if not exists aplicado_por uuid references public.usuarios(id) on delete set null,
  add column if not exists fecha_fin_anterior date,
  add column if not exists fecha_fin_aplicada date;

comment on column public.otrosies.aplicado_en is 'Cuándo se aplicó (se extendió el contrato y se crearon sus periodos). NULL: registrado, sin aplicar.';
comment on column public.otrosies.aplicado_por is 'Quién lo aplicó. NULL con aplicado_en lleno: aplicación anterior al 8-oct-2026, registro reconstruido.';
comment on column public.otrosies.fecha_fin_anterior is 'Fecha de terminación del contrato antes de aplicarlo: la que vuelve si se elimina.';
comment on column public.otrosies.fecha_fin_aplicada is 'Fecha de terminación que dejó al aplicarlo.';

alter table public.periodos
  add column if not exists otrosi_id uuid references public.otrosies(id);

comment on column public.periodos.otrosi_id is 'El otrosí que creó este periodo. NULL: periodo del contrato original.';

create index if not exists periodos_otrosi_id_idx on public.periodos (otrosi_id);
create index if not exists otrosies_aplicado_por_idx on public.otrosies (aplicado_por);

-- ── 3 · Aplicar ─────────────────────────────────────────────────────────────

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

-- ── 3 · Eliminar (y deshacer si se aplicó) ─────────────────────────────────

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

revoke all on function public.aplicar_otrosi(uuid, date, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.eliminar_otrosi(uuid) from public, anon, authenticated;
grant execute on function public.aplicar_otrosi(uuid, date, jsonb, uuid) to service_role;
grant execute on function public.eliminar_otrosi(uuid) to service_role;

-- ── 4 · Un otrosí aplicado no cambia su fecha ni su plazo ──────────────────

create or replace function public.otrosi_aplicado_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.aplicado_en is not null
     and (new.fecha_inicio is distinct from old.fecha_inicio or new.plazo_dias_adicion is distinct from old.plazo_dias_adicion) then
    raise exception 'OTROSI: este otrosí ya se aplicó: para cambiar su fecha de inicio o su plazo, elimínelo (se deshacen sus cambios) y regístrelo de nuevo'
      using errcode = '23514';
  end if;
  return new;
end
$$;

revoke all on function public.otrosi_aplicado_inmutable() from public, anon, authenticated;

drop trigger if exists otrosies_aplicado_inmutable on public.otrosies;
create trigger otrosies_aplicado_inmutable
  before update on public.otrosies
  for each row execute function public.otrosi_aplicado_inmutable();

-- ── 5 · Los otrosíes que ya estaban aplicados ──────────────────────────────
--
-- Antes de esta migración no quedaba registro, así que se reconstruye con lo que sí se sabe: los periodos que se
-- crearon DESPUÉS de registrar el otrosí y caen en sus meses son los que él creó; la fecha anterior es el fin del
-- último periodo original; la que dejó, la fecha actual del contrato. Solo en contratos con UN otrosí (con varios,
-- no se puede saber cuál creó qué). `aplicado_por` queda vacío: así se distingue un registro reconstruido.

with o as (
  select o.id, o.contrato_id, o.fecha_inicio, o.created_at, (o.fecha_inicio + (o.plazo_dias_adicion - 1)) as fin_otrosi
    from public.otrosies o
   where o.plazo_dias_adicion > 0
     and o.aplicado_en is null
     and (select count(*) from public.otrosies x where x.contrato_id = o.contrato_id) = 1
),
suyos as (
  select o.id as otrosi_id, p.id as periodo_id
    from o join public.periodos p
      on p.contrato_id = o.contrato_id
     and p.otrosi_id is null
     and p.created_at > o.created_at
     and date_trunc('month', p.fecha_inicio) between date_trunc('month', o.fecha_inicio) and date_trunc('month', o.fin_otrosi)
)
update public.periodos p set otrosi_id = s.otrosi_id from suyos s where p.id = s.periodo_id;

update public.otrosies o
   set aplicado_en = r.primero,
       fecha_fin_aplicada = c.fecha_fin,
       fecha_fin_anterior = (
         select max(p.fecha_fin) from public.periodos p
          where p.contrato_id = o.contrato_id and p.otrosi_id is null and p.fecha_inicio < o.fecha_inicio)
  from (select otrosi_id, min(created_at) as primero from public.periodos where otrosi_id is not null group by otrosi_id) r,
       public.contratos c
 where r.otrosi_id = o.id and c.id = o.contrato_id and o.aplicado_en is null;
