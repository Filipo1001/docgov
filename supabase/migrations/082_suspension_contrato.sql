-- Migration 082: Contratista Digital — suspensión y reinicio de un contrato (fase 2, primera parte)
--
-- QUÉ HACE. Registrar una suspensión es un acto con efectos, en una sola transacción (`suspender_contrato`):
--   · El contrato pasa a `suspendido` con la fecha y el motivo del acta. Sigue vigente: la suspensión detiene la
--     ejecución, no el contrato (lib/vigencia-contrato.ts).
--   · Mientras dura, la aplicación no pide informes de ese contrato (lo filtra `contratoSuspendido`; ver el aviso R1).
--   · Los periodos ya presentados no se tocan (regla 3 de CLAUDE.md).
-- `reiniciar_contrato` cierra la suspensión con su fecha de reinicio. NO mueve la fecha de fin: si la entidad quiere
-- que el plazo se extienda por los días suspendidos, eso se registra como prórroga con su otrosí (aplicar_otrosi ya crea
-- los periodos nuevos). Así no hay dos caminos para cambiar el plazo.
--
-- PROTECCIONES DE LA BASE
--   · Solo un contrato `vigente` se suspende, y solo uno `suspendido` se reinicia.
--   · Una sola suspensión abierta por contrato.
--   · Terminar un contrato suspendido CIERRA la suspensión con la fecha de terminación (disparador
--     `contratos_suspension_con_terminacion`, sin tocar terminar_contrato). Si la suspensión empezó después del último
--     día de ejecución, la terminación se niega: primero hay que reiniciar. Deshacer esa terminación reabre la suspensión.
--
-- NADA CAMBIA PARA LO EXISTENTE: ningún contrato está suspendido por el flujo nuevo. Los contratos ya marcados por el
-- panel genérico de estado (cambiarEstadoContrato) no tienen fila en contrato_suspensiones; el reinicio exige una fila.
--
-- PARA REVERTIR: supabase/reversiones/082_suspension_contrato.sql.

begin;

create table public.contrato_suspensiones (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  fecha_inicio date not null,
  motivo text not null check (nullif(btrim(motivo), '') is not null),
  numero_acto text,
  fecha_acto date,
  fecha_reinicio date,
  registrada_por uuid not null references public.usuarios(id),
  registrada_en timestamptz not null default now(),
  reiniciada_por uuid references public.usuarios(id),
  reiniciada_en timestamptz,
  -- La suspensión se cerró porque el contrato terminó (no hubo acta de reinicio): no hay quien la reinició.
  cerrada_por_terminacion boolean not null default false,
  constraint contrato_suspensiones_reinicio_completo
    check ((fecha_reinicio is null) = (reiniciada_en is null)),
  constraint contrato_suspensiones_quien_reinicia
    check (fecha_reinicio is null or reiniciada_por is not null or cerrada_por_terminacion),
  constraint contrato_suspensiones_cierre_por_terminacion
    check (not cerrada_por_terminacion or fecha_reinicio is not null),
  constraint contrato_suspensiones_reinicio_no_antes
    check (fecha_reinicio is null or fecha_reinicio >= fecha_inicio)
);

comment on table public.contrato_suspensiones is
  'Suspensiones de la ejecución de un contrato (migración 082): una abierta por contrato como máximo. Se escriben solo con suspender_contrato y reiniciar_contrato.';

create unique index contrato_suspensiones_una_abierta on public.contrato_suspensiones (contrato_id) where fecha_reinicio is null;
create index contrato_suspensiones_contrato_idx on public.contrato_suspensiones (contrato_id);

alter table public.contrato_suspensiones enable row level security;
revoke all on public.contrato_suspensiones from public, anon, authenticated;
grant select on public.contrato_suspensiones to authenticated;
create policy contrato_suspensiones_quien_ve_el_contrato on public.contrato_suspensiones
  for select to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_suspensiones.contrato_id));

-- ─── Suspender ────────────────────────────────────────────────────────────────

create or replace function public.suspender_contrato(
  p_contrato uuid,
  p_fecha date,
  p_motivo text,
  p_numero_acto text,
  p_fecha_acto date,
  p_usuario uuid
) returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_c public.contratos%rowtype;
  v_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if p_contrato is null or p_fecha is null or p_usuario is null then
    raise exception 'SUSPENSION: faltan el contrato, la fecha de la suspensión o quién la registra' using errcode = '22023';
  end if;
  if v_motivo is null then
    raise exception 'SUSPENSION: indica el motivo: queda como constancia en el expediente' using errcode = '22023';
  end if;

  select * into v_c from public.contratos where id = p_contrato for update;
  if not found then raise exception 'SUSPENSION: el contrato no existe' using errcode = 'P0002'; end if;
  if v_c.estado <> 'vigente' then
    raise exception 'SUSPENSION: el contrato está %; solo se suspende uno vigente', v_c.estado using errcode = '22023';
  end if;
  if p_fecha < v_c.fecha_inicio or p_fecha > v_c.fecha_fin_efectiva then
    raise exception 'SUSPENSION: la fecha de suspensión tiene que estar dentro del plazo del contrato (%, %)',
      to_char(v_c.fecha_inicio, 'DD/MM/YYYY'), to_char(v_c.fecha_fin_efectiva, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  insert into public.contrato_suspensiones (contrato_id, fecha_inicio, motivo, numero_acto, fecha_acto, registrada_por)
  values (p_contrato, p_fecha, v_motivo, nullif(btrim(coalesce(p_numero_acto, '')), ''), p_fecha_acto, p_usuario)
  returning id into v_id;

  update public.contratos
     set estado = 'suspendido', estado_fecha = p_fecha, estado_motivo = v_motivo, updated_at = now()
   where id = p_contrato;

  insert into public.contratos_historial (contrato_id, usuario_id, campo, valor_anterior, valor_nuevo)
  values (p_contrato, p_usuario, 'estado', 'vigente',
          format('suspendido (%s) — %s%s', to_char(p_fecha, 'DD/MM/YYYY'), v_motivo,
                 coalesce(' · acta ' || nullif(btrim(coalesce(p_numero_acto, '')), ''), '')));

  return jsonb_build_object('suspension', v_id);
end
$f$;

-- ─── Reiniciar ────────────────────────────────────────────────────────────────

create or replace function public.reiniciar_contrato(
  p_contrato uuid,
  p_fecha date,
  p_numero_acto text,
  p_fecha_acto date,
  p_usuario uuid
) returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_c public.contratos%rowtype;
  v_s public.contrato_suspensiones%rowtype;
begin
  if p_contrato is null or p_fecha is null or p_usuario is null then
    raise exception 'SUSPENSION: faltan el contrato, la fecha de reinicio o quién lo registra' using errcode = '22023';
  end if;

  select * into v_c from public.contratos where id = p_contrato for update;
  if not found then raise exception 'SUSPENSION: el contrato no existe' using errcode = 'P0002'; end if;
  if v_c.estado <> 'suspendido' then
    raise exception 'SUSPENSION: el contrato está %; solo se reinicia uno suspendido', v_c.estado using errcode = '22023';
  end if;
  select * into v_s from public.contrato_suspensiones where contrato_id = p_contrato and fecha_reinicio is null for update;
  if not found then
    raise exception 'SUSPENSION: el contrato figura suspendido sin un acta de suspensión registrada; regístrala antes de reiniciarlo'
      using errcode = '23503';
  end if;
  if p_fecha < v_s.fecha_inicio then
    raise exception 'SUSPENSION: el reinicio (%) no puede ser anterior a la suspensión (%)',
      to_char(p_fecha, 'DD/MM/YYYY'), to_char(v_s.fecha_inicio, 'DD/MM/YYYY') using errcode = '22023';
  end if;
  if p_fecha > v_c.fecha_fin_efectiva then
    raise exception 'SUSPENSION: el reinicio es posterior a la fecha de fin del contrato; el contrato ya venció' using errcode = '22023';
  end if;

  update public.contrato_suspensiones
     set fecha_reinicio = p_fecha, reiniciada_por = p_usuario, reiniciada_en = clock_timestamp()
   where id = v_s.id;

  update public.contratos
     set estado = 'vigente', estado_fecha = p_fecha, estado_motivo = null, updated_at = now()
   where id = p_contrato;

  insert into public.contratos_historial (contrato_id, usuario_id, campo, valor_anterior, valor_nuevo)
  values (p_contrato, p_usuario, 'estado', 'suspendido',
          format('vigente (reinicio %s, %s días suspendido)', to_char(p_fecha, 'DD/MM/YYYY'), p_fecha - v_s.fecha_inicio)
            || coalesce(' · acta ' || nullif(btrim(coalesce(p_numero_acto, '')), ''), ''));

  return jsonb_build_object('dias_suspendido', p_fecha - v_s.fecha_inicio, 'fecha_fin', v_c.fecha_fin);
end
$f$;

-- ─── Terminar o deshacer la terminación de un contrato suspendido ─────────────

create or replace function public.contratos_suspension_con_terminacion()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  if tg_op = 'UPDATE' and old.estado = 'suspendido' and new.estado = 'terminado' then
    if exists (select 1 from public.contrato_suspensiones s
                where s.contrato_id = new.id and s.fecha_reinicio is null and s.fecha_inicio > new.fecha_terminacion) then
      raise exception 'SUSPENSION: el contrato está suspendido desde una fecha posterior al último día de ejecución (%); reinícielo antes de terminarlo',
        to_char(new.fecha_terminacion, 'DD/MM/YYYY') using errcode = '23503';
    end if;
    update public.contrato_suspensiones
       set fecha_reinicio = new.fecha_terminacion, reiniciada_en = clock_timestamp(), cerrada_por_terminacion = true
     where contrato_id = new.id and fecha_reinicio is null;
  elsif tg_op = 'UPDATE' and old.estado = 'terminado' and new.estado = 'suspendido' then
    -- Deshacer la terminación devuelve el contrato a como estaba: la suspensión que la terminación cerró vuelve a estar abierta.
    update public.contrato_suspensiones
       set fecha_reinicio = null, reiniciada_en = null, cerrada_por_terminacion = false
     where contrato_id = new.id and cerrada_por_terminacion and fecha_reinicio = old.fecha_terminacion;
  end if;
  return new;
end
$f$;

create trigger contratos_suspension_con_terminacion
  after update of estado on public.contratos
  for each row when (old.estado is distinct from new.estado)
  execute function public.contratos_suspension_con_terminacion();

revoke all on function public.contratos_suspension_con_terminacion() from public, anon, authenticated;

revoke all on function public.suspender_contrato(uuid, date, text, text, date, uuid) from public, anon, authenticated;
revoke all on function public.reiniciar_contrato(uuid, date, text, date, uuid) from public, anon, authenticated;
grant execute on function public.suspender_contrato(uuid, date, text, text, date, uuid) to service_role;
grant execute on function public.reiniciar_contrato(uuid, date, text, date, uuid) to service_role;

-- ─── Comprobación ─────────────────────────────────────────────────────────────

do $$
declare
  v_n int;
  v_malas text;
begin
  select count(*) into v_n from public.contrato_suspensiones;
  if v_n <> 0 then raise exception 'SUSPENSION 082: la tabla debería estar vacía al aplicarla (hay %)', v_n; end if;
  select count(*) into v_n from public.contratos where estado = 'suspendido';
  if v_n > 0 then raise exception 'SUSPENSION 082: hay % contratos suspendidos sin acta registrada; no se aplica', v_n; end if;
  select string_agg(p.proname, ', ') into v_malas
    from pg_proc p
   where p.oid in ('public.suspender_contrato(uuid, date, text, text, date, uuid)'::regprocedure,
                   'public.reiniciar_contrato(uuid, date, text, date, uuid)'::regprocedure)
     and (p.prosecdef
          or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or not has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'SUSPENSION 082: % no quedó con los permisos que debe', v_malas; end if;
  if not exists (select 1 from pg_trigger where not tgisinternal and tgname = 'contratos_suspension_con_terminacion'
                    and tgrelid = 'public.contratos'::regclass) then
    raise exception 'SUSPENSION 082: falta el disparador que cierra la suspensión al terminar';
  end if;
  if has_table_privilege('anon', 'public.contrato_suspensiones', 'SELECT')
     or has_table_privilege('authenticated', 'public.contrato_suspensiones', 'INSERT')
     or has_table_privilege('authenticated', 'public.contrato_suspensiones', 'UPDATE')
     or has_table_privilege('authenticated', 'public.contrato_suspensiones', 'DELETE')
     or not has_table_privilege('authenticated', 'public.contrato_suspensiones', 'SELECT') then
    raise exception 'SUSPENSION 082: contrato_suspensiones no quedó con los permisos que debe';
  end if;
end $$;

commit;
