-- Migration 081: Contratista Digital — terminación anticipada de un contrato, con sus efectos
--
-- POR QUÉ. Felipe (30-oct-2026): los contratos que terminan antes de la fecha pactada seguían «Pendientes de enviar»,
-- sus contratistas seguían recibiendo recordatorios y seguían contando como activos. El estado `terminado` existe desde
-- la 039, pero era una etiqueta: no tocaba los periodos, que se generan de entrada hasta la fecha pactada y son los que
-- alimentan las listas de pendientes y los recordatorios. Pidió que admin, contratación y el supervisor REGISTREN la
-- terminación con su causal —el sistema no la deduce de nada— y que tenga efectos en todo el sistema.
--
-- QUÉ HACE. Registrar una terminación es un hecho con efectos, en una sola transacción (`terminar_contrato`):
--
--   · El contrato guarda el ÚLTIMO DÍA DE EJECUCIÓN (`fecha_terminacion`) y pasa a `terminado`. La fecha de terminación
--     PACTADA (`fecha_fin`) no se toca: la usan los documentos, los otrosíes y el plazo escrito. La fecha que manda la
--     vigencia es `fecha_fin_efectiva`, una columna calculada por la base (la pactada, o la de terminación si la hay):
--     es la única definición de «hasta cuándo va el contrato», y la aplicación filtra por ella.
--   · Los periodos que empiezan después de ese día pasan a `anulado` (080). No se borran: quedan a la vista, con lo que
--     alguien alcanzó a escribir, para poder deshacer un error. Ninguna lista ni ningún recordatorio los ve.
--   · El periodo que contiene ese día se recorta: termina ese día y vale lo que diga quien registra (la pantalla propone
--     el proporcional por días). Los anteriores siguen siendo obligaciones: con su informe se cobra lo ejecutado.
--   · Se niega si algún periodo afectado (anulado o recortado) ya se presentó o es histórico: lo presentado no se
--     reescribe (regla 3 de CLAUDE.md). Primero hay que devolverlo.
--   · Un acta de terminación por vencimiento del plazo ya aceptada (y que diga una fecha posterior) queda «sin efecto»,
--     como la deja un otrosí (063): diría que el contrato llegó a su fecha y no llegó. No se borra ni se reescribe.
--   · Queda el registro en `contrato_terminaciones` (causal, acto, quién y cuándo, y lo necesario para deshacerla), en
--     el historial del contrato y en el de cada periodo tocado.
--
-- `revertir_terminacion` lo deshace todo, salvo que el periodo recortado ya se haya presentado con su nueva fecha.
--
-- PROTECCIONES DE LA BASE (no dependen de que la aplicación se acuerde):
--   · Un periodo entra en `anulado` o sale de él solo desde esas dos funciones, para cualquier rol, incluido el
--     administrador del servidor (`periodos_anulado_protegido`). Las sesiones de usuario ya no podían (065).
--   · A un contrato terminado no se le registra ni se le aplica un otrosí (`otrosies_contrato_no_terminado`).
--   · La aplicación tampoco pide el acta de vencimiento del plazo a un contrato terminado (lib/actas-terminacion.ts).
--   · `terminado` y `fecha_terminacion` van juntos, y la fecha cae dentro del contrato (restricciones).
--
-- NADA CAMBIA PARA LO EXISTENTE: ningún contrato está terminado (los 176 están vigentes), así que `fecha_fin_efectiva`
-- es igual a `fecha_fin` en todos y ningún periodo cambia. `contratos` no tiene permisos por columna (regla 2 de
-- CLAUDE.md: la consulta da 0), así que las columnas nuevas se leen como las demás.
--
-- REQUIERE LA 080 APLICADA (el valor `anulado`); si no, aborta sin hacer nada. El comprobador del final aborta la
-- migración si algo de lo prometido no queda cumplido. Copia para revertir: supabase/reversiones/081_…; prueba de punta a
-- punta: supabase/tests/terminacion_anticipada.sql.

begin;

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'estado_periodo' and e.enumlabel = 'anulado') then
    raise exception 'TERMINACION 081: falta el estado «anulado» de los periodos: aplica primero la 080';
  end if;
end $$;

-- ─── 1. Las causales ──────────────────────────────────────────────────────────
-- Un solo lugar: la restricción de la tabla y los mensajes la consultan. La aplicación tiene su copia, con la norma y la
-- ayuda de cada una, en lib/terminacion-contrato.ts (CAUSALES_TERMINACION); tests/cd/terminacion-contrato.test.ts vigila
-- que digan lo mismo.

create or replace function public.terminacion_causal_nombre(p_causal text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $f$
  select case p_causal
    when 'mutuo_acuerdo'      then 'Mutuo acuerdo'
    when 'unilateral'         then 'Terminación unilateral'
    when 'muerte_incapacidad' then 'Muerte o incapacidad permanente del contratista'
    when 'caducidad'          then 'Caducidad'
    when 'inhabilidad'        then 'Inhabilidad o incompatibilidad sobreviniente'
    when 'nulidad'            then 'Nulidad absoluta'
    when 'fuerza_mayor'       then 'Fuerza mayor o imposibilidad de ejecución'
    when 'otra'               then 'Otra causal'
  end
$f$;

comment on function public.terminacion_causal_nombre(text) is
  'Nombre de cada causal de terminación anticipada; null si la causal no existe (así la usa la restricción de contrato_terminaciones). La aplicación tiene su copia en lib/terminacion-contrato.ts y tests/cd/terminacion-contrato.test.ts vigila que coincidan.';

-- ─── 2. El contrato: último día de ejecución y fecha de fin efectiva ──────────

alter table public.contratos add column fecha_terminacion date;
alter table public.contratos add column fecha_fin_efectiva date generated always as (coalesce(fecha_terminacion, fecha_fin)) stored;

comment on column public.contratos.fecha_terminacion is
  'Último día de ejecución de un contrato terminado antes de su fecha pactada (migración 081). Lo escribe solo terminar_contrato; null si no se ha terminado anticipadamente. El día anterior al inicio significa que nunca se ejecutó.';
comment on column public.contratos.fecha_fin_efectiva is
  'Hasta cuándo va el contrato de verdad: la fecha pactada (fecha_fin) o, si se terminó antes, el último día de ejecución. Es la que decide si un contrato está vigente; la pactada sigue siendo la de los documentos y los otrosíes.';

-- Una terminación liquidada después conserva su fecha (fase 2): por eso `liquidado` también la admite.
alter table public.contratos add constraint contratos_terminacion_con_fecha
  check ((estado <> 'terminado' or fecha_terminacion is not null)
     and (fecha_terminacion is null or estado in ('terminado', 'liquidado')));
alter table public.contratos add constraint contratos_terminacion_dentro_del_plazo
  check (fecha_terminacion is null or (fecha_terminacion >= fecha_inicio - 1 and fecha_terminacion < fecha_fin));

create index contratos_fecha_fin_efectiva_idx on public.contratos (fecha_fin_efectiva);

-- ─── 3. El registro de cada terminación ───────────────────────────────────────

create table public.contrato_terminaciones (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  causal text not null check (public.terminacion_causal_nombre(causal) is not null),
  fecha_terminacion date not null,
  fecha_acto date,
  numero_acto text,
  observacion text,
  -- Lo necesario para deshacerla: cómo estaba el contrato, qué periodos se anularon y desde qué estado, y cómo era el
  -- periodo que se recortó.
  contrato_estado_anterior text not null,
  contrato_estado_fecha_anterior date,
  contrato_estado_motivo_anterior text,
  periodos_anulados jsonb not null default '[]'::jsonb check (jsonb_typeof(periodos_anulados) = 'array'),
  periodo_ajustado_id uuid references public.periodos(id) on delete set null,
  periodo_fecha_fin_anterior date,
  periodo_valor_anterior numeric,
  periodo_valor_nuevo numeric,
  actas_sin_efecto uuid[] not null default '{}',
  registrada_por uuid not null references public.usuarios(id),
  registrada_en timestamptz not null default now(),
  revertida_por uuid references public.usuarios(id),
  revertida_en timestamptz,
  motivo_reversion text,
  constraint contrato_terminaciones_reversion_completa
    check ((revertida_en is null) = (revertida_por is null) and (revertida_en is null) = (motivo_reversion is null)),
  constraint contrato_terminaciones_otra_explicada
    check (causal <> 'otra' or nullif(btrim(coalesce(observacion, '')), '') is not null)
);

comment on table public.contrato_terminaciones is
  'Terminaciones anticipadas de contratos (migración 081): una vigente por contrato como máximo; las deshechas se conservan con quién, cuándo y por qué. Se escribe solo con terminar_contrato y revertir_terminacion.';

create unique index contrato_terminaciones_una_vigente on public.contrato_terminaciones (contrato_id) where revertida_en is null;
create index contrato_terminaciones_contrato_idx on public.contrato_terminaciones (contrato_id);

-- Se lee con la misma visibilidad que el contrato (la subconsulta pasa por la RLS de `contratos`): quien ve el contrato
-- ve por qué terminó. Nadie escribe con su sesión: solo las funciones, desde el servidor.
alter table public.contrato_terminaciones enable row level security;
revoke all on public.contrato_terminaciones from public, anon, authenticated;
grant select on public.contrato_terminaciones to authenticated;
create policy contrato_terminaciones_quien_ve_el_contrato on public.contrato_terminaciones
  for select to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_terminaciones.contrato_id));

-- ─── 4. Registrar la terminación ──────────────────────────────────────────────

create or replace function public.terminar_contrato(
  p_contrato uuid,
  p_causal text,
  p_fecha date,
  p_fecha_acto date,
  p_numero_acto text,
  p_observacion text,
  p_valor_ajustado numeric,
  p_usuario uuid
) returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_c public.contratos%rowtype;
  v_p public.periodos%rowtype;
  v_hay_ajuste boolean;
  v_valor numeric;
  v_bloqueo text;
  v_anulados jsonb;
  v_actas uuid[];
  v_n int := 0;
  v_t uuid;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_num text := nullif(btrim(coalesce(p_numero_acto, '')), '');
  v_nombre text := public.terminacion_causal_nombre(p_causal);
begin
  if p_contrato is null or p_fecha is null or p_usuario is null then
    raise exception 'TERMINACION: faltan el contrato, el último día de ejecución o quién la registra' using errcode = '22023';
  end if;
  if v_nombre is null then
    raise exception 'TERMINACION: la causal no es válida' using errcode = '22023';
  end if;
  if p_causal = 'otra' and v_obs is null then
    raise exception 'TERMINACION: con «Otra causal» hay que explicar cuál en la observación' using errcode = '22023';
  end if;

  select * into v_c from public.contratos where id = p_contrato for update;
  if not found then raise exception 'TERMINACION: el contrato no existe' using errcode = 'P0002'; end if;
  if v_c.estado not in ('vigente', 'suspendido') then
    raise exception 'TERMINACION: el contrato está %; solo se termina uno vigente o suspendido', v_c.estado using errcode = '22023';
  end if;
  if p_fecha >= v_c.fecha_fin then
    raise exception 'TERMINACION: el último día de ejecución (%) tiene que ser anterior a la terminación pactada (%). Si el contrato llega a su fecha, termina solo.',
      to_char(p_fecha, 'DD/MM/YYYY'), to_char(v_c.fecha_fin, 'DD/MM/YYYY') using errcode = '22023';
  end if;
  if p_fecha < v_c.fecha_inicio - 1 then
    raise exception 'TERMINACION: el último día de ejecución no puede ser anterior al inicio del contrato (%)',
      to_char(v_c.fecha_inicio, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  -- Lo presentado no se reescribe: ningún periodo que pase del último día puede haber salido de borrador o devuelto.
  select string_agg(format('%s %s (%s)', p.mes, p.anio, case when p.es_historico then 'histórico' else p.estado::text end),
                    ', ' order by p.fecha_inicio)
    into v_bloqueo
    from public.periodos p
   where p.contrato_id = p_contrato and p.fecha_fin > p_fecha
     and (p.es_historico or p.estado not in ('borrador', 'rechazado'));
  if v_bloqueo is not null then
    raise exception 'TERMINACION: estos periodos van más allá del último día de ejecución y ya se presentaron: %. Lo presentado no se reescribe: primero hay que devolverlos, o el último día no puede quedar antes de que terminen.',
      v_bloqueo using errcode = '23503';
  end if;

  -- El periodo que contiene el último día se recorta.
  if (select count(*) from public.periodos where contrato_id = p_contrato and fecha_inicio <= p_fecha and fecha_fin > p_fecha) > 1 then
    raise exception 'TERMINACION: hay más de un periodo que contiene el %; revisa el plan de pagos', to_char(p_fecha, 'DD/MM/YYYY')
      using errcode = '23503';
  end if;
  select * into v_p from public.periodos
   where contrato_id = p_contrato and fecha_inicio <= p_fecha and fecha_fin > p_fecha for update;
  v_hay_ajuste := found;
  if v_hay_ajuste then
    v_valor := round(p_valor_ajustado);
    if v_valor is null then
      raise exception 'TERMINACION: falta el valor del periodo de % %, que queda recortado', v_p.mes, v_p.anio using errcode = '22023';
    end if;
    if v_valor < 0 or v_valor > v_p.valor_cobro then
      raise exception 'TERMINACION: el valor del periodo de % % debe estar entre 0 y % (lo que valía completo)',
        v_p.mes, v_p.anio, replace(to_char(v_p.valor_cobro, 'FM999,999,999,990'), ',', '.') using errcode = '22023';
    end if;
  end if;

  perform set_config('cd.terminacion', 'si', true);

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'estado', p.estado) order by p.fecha_inicio), '[]'::jsonb)
    into v_anulados
    from public.periodos p where p.contrato_id = p_contrato and p.fecha_inicio > p_fecha;

  -- Un acta de vencimiento del plazo que dice una fecha posterior ya no describe cómo terminó: queda sin efecto (063).
  select coalesce(array_agg(a.id), '{}') into v_actas
    from public.actas_terminacion a
   where a.contrato_id = p_contrato and a.vigencia = 'vigente' and a.fecha_terminacion > p_fecha;
  update public.actas_terminacion
     set vigencia = 'sin_efecto', sin_efecto_en = clock_timestamp(), updated_at = clock_timestamp()
   where id = any (v_actas);

  insert into public.contrato_terminaciones (
    contrato_id, causal, fecha_terminacion, fecha_acto, numero_acto, observacion,
    contrato_estado_anterior, contrato_estado_fecha_anterior, contrato_estado_motivo_anterior,
    periodos_anulados, periodo_ajustado_id, periodo_fecha_fin_anterior, periodo_valor_anterior, periodo_valor_nuevo,
    actas_sin_efecto, registrada_por
  ) values (
    p_contrato, p_causal, p_fecha, p_fecha_acto, v_num, v_obs,
    v_c.estado, v_c.estado_fecha, v_c.estado_motivo,
    v_anulados,
    case when v_hay_ajuste then v_p.id end, case when v_hay_ajuste then v_p.fecha_fin end,
    case when v_hay_ajuste then v_p.valor_cobro end, case when v_hay_ajuste then v_valor end,
    v_actas, p_usuario
  ) returning id into v_t;

  insert into public.historial_periodos (periodo_id, estado_anterior, estado_nuevo, usuario_id, comentario)
  select p.id, p.estado, 'anulado', p_usuario,
         format('Anulado: el contrato terminó anticipadamente; su último día de ejecución fue el %s (%s)', to_char(p_fecha, 'DD/MM/YYYY'), v_nombre)
    from public.periodos p where p.contrato_id = p_contrato and p.fecha_inicio > p_fecha;

  update public.periodos set estado = 'anulado' where contrato_id = p_contrato and fecha_inicio > p_fecha;
  get diagnostics v_n = row_count;

  if v_hay_ajuste then
    update public.periodos set fecha_fin = p_fecha, valor_cobro = v_valor where id = v_p.id;
    insert into public.historial_periodos (periodo_id, estado_anterior, estado_nuevo, usuario_id, comentario)
    values (v_p.id, v_p.estado, v_p.estado, p_usuario,
            format('Recortado por la terminación anticipada del contrato: ahora va del %s al %s; valor %s → %s',
                   to_char(v_p.fecha_inicio, 'DD/MM/YYYY'), to_char(p_fecha, 'DD/MM/YYYY'),
                   replace(to_char(v_p.valor_cobro, 'FM999,999,999,990'), ',', '.'), replace(to_char(v_valor, 'FM999,999,999,990'), ',', '.')));
  end if;

  update public.contratos
     set estado = 'terminado', estado_fecha = p_fecha, fecha_terminacion = p_fecha,
         estado_motivo = v_nombre || coalesce(' — ' || v_obs, ''), updated_at = now()
   where id = p_contrato;

  insert into public.contratos_historial (contrato_id, usuario_id, campo, valor_anterior, valor_nuevo)
  values (p_contrato, p_usuario, 'terminacion', v_c.estado,
          format('terminado; último día de ejecución %s · %s%s%s', to_char(p_fecha, 'DD/MM/YYYY'), v_nombre,
                 coalesce(' · acto ' || v_num, ''), coalesce(' del ' || to_char(p_fecha_acto, 'DD/MM/YYYY'), '')));

  -- La marca se apaga al salir: dentro de una transacción más larga (una prueba), lo que venga después vuelve a estar protegido.
  perform set_config('cd.terminacion', '', true);

  return jsonb_build_object(
    'terminacion', v_t,
    'anulados', v_n,
    'actas_sin_efecto', coalesce(array_length(v_actas, 1), 0),
    'ajustado', case when v_hay_ajuste then jsonb_build_object('periodo', v_p.id, 'mes', v_p.mes, 'anio', v_p.anio, 'valor', v_valor) end
  );
end
$f$;

comment on function public.terminar_contrato(uuid, text, date, date, text, text, numeric, uuid) is
  'Registra la terminación anticipada de un contrato y sus efectos en una transacción (migración 081): anula los periodos posteriores al último día de ejecución, recorta el que lo contiene, marca el contrato y deja constancia. Se niega si algún periodo afectado ya se presentó. Solo la llama el servidor (app/actions/terminacion-contrato.ts), que decide quién puede.';

-- ─── 5. Deshacerla ────────────────────────────────────────────────────────────

create or replace function public.revertir_terminacion(p_contrato uuid, p_motivo text, p_usuario uuid)
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_c public.contratos%rowtype;
  v_t public.contrato_terminaciones%rowtype;
  v_p public.periodos%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_n int := 0;
  v_actas int := 0;
  v_ajuste boolean := false;
begin
  if p_contrato is null or p_usuario is null then
    raise exception 'TERMINACION: faltan el contrato o quién la deshace' using errcode = '22023';
  end if;
  if v_motivo is null then
    raise exception 'TERMINACION: indica por qué se deshace la terminación: queda en el historial del contrato' using errcode = '22023';
  end if;

  select * into v_c from public.contratos where id = p_contrato for update;
  if not found then raise exception 'TERMINACION: el contrato no existe' using errcode = 'P0002'; end if;
  select * into v_t from public.contrato_terminaciones where contrato_id = p_contrato and revertida_en is null for update;
  if not found then raise exception 'TERMINACION: el contrato no tiene una terminación vigente' using errcode = 'P0002'; end if;
  if v_c.estado <> 'terminado' then
    raise exception 'TERMINACION: el contrato ya no está terminado (está %); la terminación no se puede deshacer desde aquí', v_c.estado
      using errcode = '23503';
  end if;

  if v_t.periodo_ajustado_id is not null then
    select * into v_p from public.periodos where id = v_t.periodo_ajustado_id for update;
    v_ajuste := found;
    if v_ajuste and (v_p.es_historico or v_p.estado not in ('borrador', 'rechazado')) then
      raise exception 'TERMINACION: el informe de % % ya se presentó con el último día de ejecución (está %). Lo presentado no se reescribe: primero hay que devolverlo.',
        v_p.mes, v_p.anio, v_p.estado using errcode = '23503';
    end if;
    if v_ajuste and v_p.fecha_fin is distinct from v_t.fecha_terminacion then
      raise exception 'TERMINACION: las fechas del periodo de % % cambiaron después de la terminación; revísalas antes de deshacerla', v_p.mes, v_p.anio
        using errcode = '23503';
    end if;
  end if;

  perform set_config('cd.terminacion', 'si', true);

  insert into public.historial_periodos (periodo_id, estado_anterior, estado_nuevo, usuario_id, comentario)
  select p.id, 'anulado', (e->>'estado')::public.estado_periodo, p_usuario,
         format('Repuesto: se deshizo la terminación anticipada del contrato (%s)', v_motivo)
    from jsonb_array_elements(v_t.periodos_anulados) e
    join public.periodos p on p.id = (e->>'id')::uuid
   where p.estado = 'anulado';

  update public.periodos p
     set estado = (e->>'estado')::public.estado_periodo
    from jsonb_array_elements(v_t.periodos_anulados) e
   where p.id = (e->>'id')::uuid and p.estado = 'anulado';
  get diagnostics v_n = row_count;

  if v_ajuste then
    update public.periodos set fecha_fin = v_t.periodo_fecha_fin_anterior, valor_cobro = v_t.periodo_valor_anterior where id = v_p.id;
    insert into public.historial_periodos (periodo_id, estado_anterior, estado_nuevo, usuario_id, comentario)
    values (v_p.id, v_p.estado, v_p.estado, p_usuario,
            format('Repuesto: se deshizo la terminación anticipada; vuelve a ir hasta el %s y a valer %s (%s)',
                   to_char(v_t.periodo_fecha_fin_anterior, 'DD/MM/YYYY'), replace(to_char(v_t.periodo_valor_anterior, 'FM999,999,999,990'), ',', '.'), v_motivo));
  end if;

  -- Las actas que la terminación dejó sin efecto vuelven a estar vigentes, salvo que ya haya otra vigente.
  if cardinality(v_t.actas_sin_efecto) > 0 then
    if exists (select 1 from public.actas_terminacion where contrato_id = p_contrato and vigencia = 'vigente') then
      raise exception 'TERMINACION: el contrato ya tiene otra acta de terminación vigente; hay que resolverla antes de deshacer la terminación'
        using errcode = '23503';
    end if;
    update public.actas_terminacion
       set vigencia = 'vigente', sin_efecto_en = null, updated_at = clock_timestamp()
     where id = any (v_t.actas_sin_efecto) and vigencia = 'sin_efecto' and sin_efecto_otrosi_id is null;
    get diagnostics v_actas = row_count;
  end if;

  update public.contrato_terminaciones
     set revertida_en = clock_timestamp(), revertida_por = p_usuario, motivo_reversion = v_motivo
   where id = v_t.id;

  update public.contratos
     set estado = v_t.contrato_estado_anterior, estado_fecha = v_t.contrato_estado_fecha_anterior,
         estado_motivo = v_t.contrato_estado_motivo_anterior, fecha_terminacion = null, updated_at = now()
   where id = p_contrato;

  insert into public.contratos_historial (contrato_id, usuario_id, campo, valor_anterior, valor_nuevo)
  values (p_contrato, p_usuario, 'terminacion', 'terminado',
          format('%s; se deshizo la terminación anticipada · %s', v_t.contrato_estado_anterior, v_motivo));

  perform set_config('cd.terminacion', '', true);

  return jsonb_build_object('repuestos', v_n, 'ajuste_repuesto', v_ajuste, 'actas_repuestas', v_actas);
end
$f$;

comment on function public.revertir_terminacion(uuid, text, uuid) is
  'Deshace la terminación anticipada vigente de un contrato (migración 081): repone los periodos anulados en el estado que tenían, devuelve el periodo recortado a su fecha y su valor, y repone el estado del contrato. Se niega si el periodo recortado ya se presentó. Solo la llama el servidor.';

-- ─── 6. Protecciones ──────────────────────────────────────────────────────────

-- Un periodo entra en «anulado» o sale de él solo desde las dos funciones de arriba, que marcan la transacción. Vale para
-- todos los roles: también para el cliente administrador del servidor (devolver un periodo, editar su estado a mano).
create or replace function public.periodos_anulado_protegido()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  if coalesce(current_setting('cd.terminacion', true), '') = 'si' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.estado = 'anulado' then
      raise exception 'PERIODOS: un periodo solo queda «anulado» al registrar la terminación anticipada del contrato' using errcode = '42501';
    end if;
  elsif new.estado is distinct from old.estado and (old.estado = 'anulado' or new.estado = 'anulado') then
    raise exception 'PERIODOS: un periodo anulado por la terminación del contrato solo se recupera deshaciendo la terminación' using errcode = '42501';
  end if;
  return new;
end
$f$;

create trigger periodos_anulado_protegido
  before insert or update of estado on public.periodos
  for each row execute function public.periodos_anulado_protegido();

-- A un contrato terminado no se le registra ni se le aplica un otrosí: ya no hay nada que prorrogar ni modificar.
create or replace function public.otrosies_contrato_no_terminado()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  v_fecha date;
  v_numero text;
begin
  if tg_op = 'UPDATE' and not (old.aplicado_en is null and new.aplicado_en is not null) then
    return new;
  end if;
  select fecha_terminacion, numero into v_fecha, v_numero from public.contratos where id = new.contrato_id;
  if v_fecha is not null then
    raise exception 'OTROSI: el contrato % terminó anticipadamente (último día de ejecución: %). Un contrato terminado no admite otrosíes; si la terminación fue un error, primero hay que deshacerla.',
      v_numero, to_char(v_fecha, 'DD/MM/YYYY') using errcode = '23514';
  end if;
  return new;
end
$f$;

create trigger otrosies_contrato_no_terminado
  before insert or update of aplicado_en on public.otrosies
  for each row execute function public.otrosies_contrato_no_terminado();

-- ─── 7. Permisos de las funciones ─────────────────────────────────────────────
-- Las dos que escriben, solo desde el servidor (como aplicar_otrosi); los disparadores, de nadie; el nombre de la causal,
-- de quien tenga sesión (lo consulta la restricción, y es solo un texto).

revoke all on function public.terminar_contrato(uuid, text, date, date, text, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.revertir_terminacion(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.terminar_contrato(uuid, text, date, date, text, text, numeric, uuid) to service_role;
grant execute on function public.revertir_terminacion(uuid, text, uuid) to service_role;
revoke all on function public.periodos_anulado_protegido() from public, anon, authenticated;
revoke all on function public.otrosies_contrato_no_terminado() from public, anon, authenticated;
revoke all on function public.terminacion_causal_nombre(text) from public, anon;
grant execute on function public.terminacion_causal_nombre(text) to authenticated, service_role;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_n int;
  v_malas text;
begin
  -- 1. Nada cambió para lo existente
  select count(*) into v_n from public.contratos where fecha_terminacion is not null or fecha_fin_efectiva is distinct from fecha_fin;
  if v_n > 0 then raise exception 'TERMINACION 081: % contratos quedaron con una fecha de fin efectiva distinta de la pactada', v_n; end if;
  select count(*) into v_n from public.periodos where estado = 'anulado';
  if v_n > 0 then raise exception 'TERMINACION 081: hay % periodos anulados recién aplicada la migración', v_n; end if;
  if exists (select 1 from public.contratos where estado = 'terminado') then
    raise exception 'TERMINACION 081: hay contratos «terminado» sin último día de ejecución (la restricción no debió crearse)';
  end if;

  -- 2. La columna calculada es calculada, y las restricciones existen
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contratos'
                    and column_name = 'fecha_fin_efectiva' and is_generated = 'ALWAYS') then
    raise exception 'TERMINACION 081: fecha_fin_efectiva no es una columna calculada';
  end if;
  select count(*) into v_n from pg_constraint where conrelid = 'public.contratos'::regclass
     and conname in ('contratos_terminacion_con_fecha', 'contratos_terminacion_dentro_del_plazo');
  if v_n <> 2 then raise exception 'TERMINACION 081: faltan restricciones del contrato (%/2)', v_n; end if;
  if (select count(*) filter (where attacl is not null) from pg_attribute
       where attrelid = 'public.contratos'::regclass and attnum > 0 and not attisdropped) > 0 then
    raise exception 'TERMINACION 081: contratos tiene permisos por columna: las columnas nuevas necesitan su GRANT SELECT';
  end if;

  -- 3. Las causales
  if public.terminacion_causal_nombre('mutuo_acuerdo') is null or public.terminacion_causal_nombre('no_existe') is not null then
    raise exception 'TERMINACION 081: la lista de causales no responde como debe';
  end if;

  -- 4. Las funciones que escriben: de invocador, con ruta fija, solo el servidor
  select string_agg(p.proname, ', ') into v_malas
    from pg_proc p
   where p.oid in ('public.terminar_contrato(uuid, text, date, date, text, text, numeric, uuid)'::regprocedure,
                   'public.revertir_terminacion(uuid, text, uuid)'::regprocedure)
     and (p.prosecdef
          or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or not has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'TERMINACION 081: % no quedó con los permisos que debe', v_malas; end if;

  -- 5. Los disparadores
  select count(*) into v_n from pg_trigger
   where not tgisinternal and ((tgrelid = 'public.periodos'::regclass and tgname = 'periodos_anulado_protegido')
                            or (tgrelid = 'public.otrosies'::regclass and tgname = 'otrosies_contrato_no_terminado'));
  if v_n <> 2 then raise exception 'TERMINACION 081: faltan disparadores (%/2)', v_n; end if;

  -- 6. La tabla del registro: RLS, solo lectura para la sesión, nada para anon
  if not (select relrowsecurity from pg_class where oid = 'public.contrato_terminaciones'::regclass) then
    raise exception 'TERMINACION 081: contrato_terminaciones sin RLS';
  end if;
  if has_table_privilege('anon', 'public.contrato_terminaciones', 'SELECT')
     or has_table_privilege('authenticated', 'public.contrato_terminaciones', 'INSERT')
     or has_table_privilege('authenticated', 'public.contrato_terminaciones', 'UPDATE')
     or has_table_privilege('authenticated', 'public.contrato_terminaciones', 'DELETE')
     or not has_table_privilege('authenticated', 'public.contrato_terminaciones', 'SELECT')
     or not has_table_privilege('service_role', 'public.contrato_terminaciones', 'INSERT')
     or not has_table_privilege('service_role', 'public.contrato_terminaciones', 'UPDATE') then
    raise exception 'TERMINACION 081: contrato_terminaciones no quedó con los permisos que debe';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/081_terminacion_anticipada.sql. Se NIEGA si hay terminaciones
-- vigentes: primero se deshacen desde la aplicación (o con revertir_terminacion), para que los periodos vuelvan a su
-- estado y fecha. El valor «anulado» del enum (080) queda, sin uso.
