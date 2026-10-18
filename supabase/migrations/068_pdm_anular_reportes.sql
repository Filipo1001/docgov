-- Migration 068: módulo Plan de Desarrollo — el administrador ANULA un reporte equivocado (y lo restaura)
--
-- POR QUÉ. Un reporte nunca se reescribe ni se borra: si alguien reportó otra cosa, la salida normal es devolverlo y que
-- su autor lo corrija. Pero hay reportes que NO tienen arreglo: se hicieron sobre el indicador equivocado, los duplicó
-- otra persona, o la evidencia no es de este indicador. Ese reporte tiene que dejar de contar sin desaparecer: quién lo
-- anuló, cuándo y por qué quedan escritos, y el reporte anterior vuelve a ser el vigente.
--
-- (REABRIR un reporte aprobado no necesita nada nuevo en la base: es devolverlo, y `pdm_validar` ya lo permite sobre el
-- último reporte del año. La pantalla lo nombra «Reabrir» y el seguimiento lo muestra distinto de una devolución.)
--
-- QUÉ SE AÑADE
--
--   · `pdm_anulaciones`: solo se AGREGA (no hay UPDATE ni DELETE para nadie con sesión). Cada fila dice «anular» o
--     «restaurar» un reporte, con motivo (10 a 500 caracteres), quién y cuándo. Lo que vale es la ÚLTIMA fila de cada
--     reporte, igual que las validaciones. Restaurar es otra fila, no un borrado: se puede anular, restaurar y volver
--     a anular, y todo queda.
--   · `pdm_privado.anulado(reporte)`: ¿el reporte está anulado ahora? Las vistas, las políticas y las funciones lo usan.
--   · `pdm_anular_reporte(reporte, motivo)` y `pdm_restaurar_reporte(reporte, motivo)`: solo el administrador.
--
-- LAS REGLAS (las impone la base; la pantalla solo las dice)
--
--   1. Solo el administrador, y el motivo es obligatorio.
--   2. Solo se anula lo MÁS RECIENTE: un reporte con otro más nuevo y vigente en el mismo indicador y año no se toca.
--      Para anular uno viejo hay que anular primero lo que vino después (se desenrolla como una pila).
--   3. Un reporte y sus versiones se anulan JUNTOS. Corregir un reporte añade una versión nueva que apunta a la
--      anterior, y la base no admite dos correcciones de la misma versión: si se anulara solo la última versión, la
--      anterior quedaría «ya corregida» por algo que no cuenta y nadie podría volver a corregirla. Por eso anular el
--      reporte anula la cadena entera (de la versión más reciente a la primera) y restaurar la restaura entera (de la
--      primera a la última); un disparador comprueba al final que ninguna cadena quede a medias.
--   4. Solo se restaura si el reporte anterior del año sigue aprobado (o no hay): un avance nuevo solo puede existir
--      después de uno aprobado.
--   5. Lo anulado NO cuenta: la lectura de «lo vigente» (`pdm_reportes_vigentes`), «lo validado» (`pdm_avance_validado`),
--      las evidencias (`pdm_evidencias_vista`, con su columna nueva `anulada`) y las funciones que deciden si lo que
--      sigue es una corrección o un avance (`pdm_reportar`, `pdm_validar` y sus disparadores) lo saltan. El reporte
--      anterior pasa a ser el vigente.
--   6. Lo anulado solo lo ven el administrador y Control Interno (consulta). Se logra con UNA política —la de lectura de
--      `pdm_reportes`— y lo demás la hereda: las evidencias, las validaciones y los comentarios se leen a través del
--      reporte, así que para el resto de las personas el reporte anulado, sus archivos y sus validaciones dejan de
--      existir. Quien lo reportó no lo ve: el administrador se lo explica aparte.
--
-- NO TOCA nada de Contratista Digital. No cambia ninguna fila (hoy no hay reportes), ninguna columna ni ningún permiso
-- de las tablas de reportes, validaciones o evidencias; solo la política de lectura de `pdm_reportes`, tres vistas
-- (mismas columnas, una más al final en `pdm_evidencias_vista`) y cuatro funciones (mismas firmas).
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no queda
-- cumplido. Hay una copia para revertir en supabase/reversiones/068_pdm_anular_reportes.sql y una prueba de punta a
-- punta en supabase/tests/pdm_anular_reportes.sql.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. La tabla: solo se agrega ──────────────────────────────────────────────

create table public.pdm_anulaciones (
  id            uuid primary key default gen_random_uuid(),
  -- Todas las filas de una misma acción (anular o restaurar un reporte con sus versiones) comparten el lote.
  lote          uuid not null,
  reporte_id    uuid not null references public.pdm_reportes(id) on delete restrict,
  accion        text not null check (accion in ('anular', 'restaurar')),
  motivo        text not null check (char_length(btrim(motivo)) between 10 and 500),
  actor_id      uuid references public.usuarios(id) on delete set null,
  actor_nombre  text not null check (btrim(actor_nombre) <> ''),
  created_at    timestamptz not null default clock_timestamp()
);

create index pdm_anulaciones_reporte_idx on public.pdm_anulaciones (reporte_id, created_at desc);
create index pdm_anulaciones_lote_idx on public.pdm_anulaciones (lote);
create index pdm_anulaciones_actor_idx on public.pdm_anulaciones (actor_id);

alter table public.pdm_anulaciones enable row level security;

-- Supabase da por defecto todos los permisos a `anon` y `authenticated` en las tablas nuevas: aquí se quitan y se da
-- lo único que hace falta. Sin UPDATE ni DELETE para nadie con sesión: la tabla solo crece.
revoke all on table public.pdm_anulaciones from public, anon, authenticated;
grant select, insert on table public.pdm_anulaciones to authenticated;

-- Leen el administrador y Control Interno. Los demás no leen la tabla (el resto del módulo les oculta lo anulado por la
-- política de `pdm_reportes`, más abajo).
create policy pdm_anulaciones_select on public.pdm_anulaciones
  for select to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or (select pdm_privado.mi_nivel()) = 'consulta'
  );

-- Escribe solo el administrador, a su nombre.
create policy pdm_anulaciones_insert on public.pdm_anulaciones
  for insert to authenticated
  with check (
    (select public.get_user_rol()) = 'admin'
    and actor_id = (select auth.uid())
  );

comment on table public.pdm_anulaciones is
  'PDM: anulaciones y restauraciones de reportes por el administrador. Solo se agrega; vale la última fila de cada reporte.';

-- ─── 2. ¿Está anulado? ────────────────────────────────────────────────────────
--
-- SECURITY DEFINER porque lo consultan personas que NO pueden leer `pdm_anulaciones` (las vistas y las funciones de
-- reportar y validar corren con la sesión de cada quien). Solo devuelve un sí o un no sobre un reporte que ya se conoce.

create or replace function pdm_privado.anulado(p_reporte uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
  select coalesce(
    (select a.accion = 'anular'
       from public.pdm_anulaciones a
      where a.reporte_id = p_reporte
      order by a.created_at desc, a.id desc
      limit 1),
    false)
$f$;

-- ─── 3. Las reglas de la tabla ────────────────────────────────────────────────

-- Antes de cada fila: qué se puede anular o restaurar en este momento.
create or replace function pdm_privado.preparar_anulacion()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  v_r public.pdm_reportes%rowtype;
  v_ya boolean;
  v_previo public.pdm_reportes%rowtype;
  v_estado text;
begin
  NEW.motivo := btrim(NEW.motivo);
  NEW.actor_nombre := coalesce(pdm_privado.nombre_de(NEW.actor_id), NEW.actor_nombre);
  NEW.created_at := clock_timestamp();

  select * into v_r from public.pdm_reportes where id = NEW.reporte_id;
  if v_r.id is null then raise exception 'PDM: el reporte no existe o no tienes acceso a él' using errcode = '42501'; end if;

  -- El mismo cerrojo que toman los reportes: un reporte a la vez por indicador y año.
  perform pg_advisory_xact_lock(hashtextextended(v_r.indicador_id::text || ':' || v_r.anio::text, 0));

  v_ya := pdm_privado.anulado(NEW.reporte_id);
  if NEW.accion = 'anular' and v_ya then
    raise exception 'PDM: este reporte ya está anulado' using errcode = '23514';
  end if;
  if NEW.accion = 'restaurar' and not v_ya then
    raise exception 'PDM: este reporte no está anulado' using errcode = '23514';
  end if;

  -- Solo lo más reciente: con otro reporte vigente más nuevo en el mismo indicador y año, no se toca este.
  if exists (
    select 1 from public.pdm_reportes r2
    where r2.indicador_id = v_r.indicador_id and r2.anio = v_r.anio
      and (r2.created_at, r2.id) > (v_r.created_at, v_r.id)
      and not pdm_privado.anulado(r2.id)
  ) then
    raise exception 'PDM: hay un reporte más reciente de este indicador en este año; trabaja primero sobre el más reciente' using errcode = '23514';
  end if;

  -- Restaurar el PRIMER reporte de un avance (el que no corrige a nadie): el reporte vigente anterior del año tiene que
  -- seguir aprobado. Un avance nuevo solo puede existir después de uno aprobado.
  if NEW.accion = 'restaurar' and v_r.corrige_a is null then
    select p.* into v_previo
      from public.pdm_reportes p
     where p.indicador_id = v_r.indicador_id and p.anio = v_r.anio
       and (p.created_at, p.id) < (v_r.created_at, v_r.id)
       and not pdm_privado.anulado(p.id)
     order by p.created_at desc, p.id desc
     limit 1;
    if v_previo.id is not null then
      select x.estado into v_estado from public.pdm_validaciones x
       where x.reporte_id = v_previo.id order by x.created_at desc, x.id desc limit 1;
      if v_estado is distinct from 'aprobado' then
        raise exception 'PDM: el reporte anterior de este año ya no está aprobado; no se puede restaurar este avance' using errcode = '23514';
      end if;
    end if;
  end if;

  return NEW;
end $f$;

create trigger pdm_anulaciones_preparar
  before insert on public.pdm_anulaciones
  for each row execute function pdm_privado.preparar_anulacion();

-- Al final de la transacción: una cadena de versiones nunca queda a medias (todas anuladas o todas vigentes).
create or replace function pdm_privado.exigir_cadena_completa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_r public.pdm_reportes%rowtype;
  v_yo boolean;
  v_sig uuid;
begin
  select * into v_r from public.pdm_reportes where id = NEW.reporte_id;
  v_yo := pdm_privado.anulado(NEW.reporte_id);

  if v_r.corrige_a is not null and pdm_privado.anulado(v_r.corrige_a) is distinct from v_yo then
    raise exception 'PDM: un reporte y sus versiones se anulan o se restauran juntos' using errcode = '23514';
  end if;
  select c.id into v_sig from public.pdm_reportes c where c.corrige_a = NEW.reporte_id;
  if v_sig is not null and pdm_privado.anulado(v_sig) is distinct from v_yo then
    raise exception 'PDM: un reporte y sus versiones se anulan o se restauran juntos' using errcode = '23514';
  end if;
  return null;
end $f$;

create constraint trigger pdm_anulaciones_cadena
  after insert on public.pdm_anulaciones
  deferrable initially deferred
  for each row execute function pdm_privado.exigir_cadena_completa();

-- ─── 4. Quién ve lo anulado ───────────────────────────────────────────────────
--
-- Antes: ve el reporte quien ve el indicador. Ahora, además: lo anulado solo lo ven el administrador y Control Interno.
-- Las evidencias, las validaciones y los comentarios se leen a través de este reporte, así que lo heredan.

drop policy pdm_reportes_select on public.pdm_reportes;

create policy pdm_reportes_select on public.pdm_reportes
  for select to authenticated
  using (
    exists (select 1 from public.pdm_indicadores i where i.id = pdm_reportes.indicador_id)
    and (
      (select public.get_user_rol()) = 'admin'
      or (select pdm_privado.mi_nivel()) = 'consulta'
      or not pdm_privado.anulado(pdm_reportes.id)
    )
  );

-- ─── 5. Las vistas: lo anulado no cuenta ──────────────────────────────────────

-- Lo VIGENTE: el último reporte NO anulado de cada indicador y año.
create or replace view public.pdm_reportes_vigentes with (security_invoker = true) as
select distinct on (r.indicador_id, r.anio)
  r.id as reporte_id,
  r.indicador_id,
  r.anio,
  r.valor,
  r.valor_anterior,
  r.texto,
  r.autor_id,
  r.autor_nombre,
  r.created_at,
  r.corrige_a,
  r.motivo_correccion,
  coalesce(v.estado, 'pendiente') as estado,
  v.comentario as validacion_comentario,
  v.validador_nombre,
  v.created_at as validado_en,
  (select count(*) from public.pdm_evidencias e where e.reporte_id = r.id)::integer as n_evidencias
from public.pdm_reportes r
left join lateral (
  select x.estado, x.comentario, x.validador_nombre, x.created_at
  from public.pdm_validaciones x
  where x.reporte_id = r.id
  order by x.created_at desc, x.id desc
  limit 1
) v on true
where not pdm_privado.anulado(r.id)
order by r.indicador_id, r.anio, r.created_at desc, r.id desc;

-- Lo VALIDADO: el último reporte aprobado de cada indicador y año, sin contar los anulados (ni los corregidos por una
-- versión que cuenta).
create or replace view public.pdm_avance_validado with (security_invoker = true) as
select distinct on (r.indicador_id, r.anio)
  r.indicador_id,
  r.anio,
  r.valor,
  v.created_at as validado_en,
  r.created_at as reportado_en
from public.pdm_reportes r
join lateral (
  select x.estado, x.created_at
  from public.pdm_validaciones x
  where x.reporte_id = r.id
  order by x.created_at desc, x.id desc
  limit 1
) v on v.estado = 'aprobado'
where not pdm_privado.anulado(r.id)
  and not exists (
    select 1 from public.pdm_reportes s
    where s.corrige_a = r.id and not pdm_privado.anulado(s.id)
  )
order by r.indicador_id, r.anio, r.created_at desc, r.id desc;

-- Las EVIDENCIAS: igual que antes, con una columna más al final (`anulada`): las pantallas la usan para no listar los
-- archivos de un reporte anulado. `reemplazada` no cambia: una versión de una cadena anulada ya está anulada.
create or replace view public.pdm_evidencias_vista with (security_invoker = true) as
select
  e.id,
  e.reporte_id,
  normalize(e.nombre, NFC) as nombre,
  e.tipo,
  e.bytes,
  (e.copia_de is not null) as conservada,
  r.indicador_id,
  i.fila_origen as indicador_fila,
  i.codigo,
  i.indicador,
  i.sector,
  d.nombre as dependencia,
  r.anio,
  r.valor,
  r.autor_nombre,
  r.created_at as reportado_en,
  coalesce(v.estado, 'pendiente') as estado_reporte,
  exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id) as reemplazada,
  (select o->>'motivo'
     from public.pdm_validaciones x cross join lateral jsonb_array_elements(x.observaciones) o
    where x.reporte_id = r.id and o->>'evidencia' = e.id::text
    order by x.created_at desc, x.id desc limit 1) as observacion,
  translate(lower(normalize(e.nombre || ' ' || i.indicador || ' ' || i.codigo, NFC)),
            'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc') as busqueda,
  pdm_privado.anulado(r.id) as anulada
from public.pdm_evidencias e
join public.pdm_reportes r on r.id = e.reporte_id
join public.pdm_indicadores i on i.id = r.indicador_id
join public.dependencias d on d.id = i.dependencia_id
left join lateral (
  select x.estado from public.pdm_validaciones x
  where x.reporte_id = r.id order by x.created_at desc, x.id desc limit 1
) v on true;

-- Reemplazar una vista conserva sus permisos; se reafirman por si acaso.
revoke all on public.pdm_reportes_vigentes, public.pdm_avance_validado, public.pdm_evidencias_vista from public, anon, authenticated;
grant select on public.pdm_reportes_vigentes, public.pdm_avance_validado, public.pdm_evidencias_vista to authenticated;

-- ─── 6. Las funciones que deciden «corrección o avance» y «se puede validar» ──
--
-- Mismas firmas y mismo cuerpo que antes; cambia solo que un reporte anulado no cuenta como «el último del año», ni como
-- «el que corrigió a otro», ni como «uno más reciente», y que no se valida lo anulado.

create or replace function pdm_privado.preparar_reporte()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  v_ultimo public.pdm_reportes%rowtype;
  v_estado text;
  v_inicio int;
  v_fin int;
  v_hoy int;
begin
  NEW.autor_nombre := coalesce(pdm_privado.nombre_de(NEW.autor_id), NEW.autor_nombre);
  NEW.created_at := clock_timestamp();

  select p.anio_inicio, p.anio_fin into v_inicio, v_fin
  from public.pdm_indicadores i join public.pdm_planes p on p.id = i.plan_id
  where i.id = NEW.indicador_id;
  if NEW.anio < v_inicio or NEW.anio > v_fin then
    raise exception 'PDM: el año % no es del plan (% a %)', NEW.anio, v_inicio, v_fin using errcode = '23514';
  end if;
  v_hoy := extract(year from (now() at time zone 'America/Bogota'))::int;
  if NEW.anio > v_hoy then
    raise exception 'PDM: el año % empieza el 1 de enero; todavía no se puede reportar', NEW.anio using errcode = '23514';
  end if;

  -- Un reporte a la vez por indicador y año: lo último se lee con el cerrojo puesto.
  perform pg_advisory_xact_lock(hashtextextended(NEW.indicador_id::text || ':' || NEW.anio::text, 0));

  -- Lo anulado no cuenta como lo último del año.
  select r.* into v_ultimo from public.pdm_reportes r
   where r.indicador_id = NEW.indicador_id and r.anio = NEW.anio
     and not pdm_privado.anulado(r.id)
   order by r.created_at desc, r.id desc limit 1;
  if v_ultimo.id is not null then
    select x.estado into v_estado from public.pdm_validaciones x where x.reporte_id = v_ultimo.id order by x.created_at desc, x.id desc limit 1;
    v_estado := coalesce(v_estado, 'pendiente');
  end if;

  if NEW.corrige_a is not null then
    if v_ultimo.id is null or v_ultimo.id <> NEW.corrige_a then
      raise exception 'PDM: solo se corrige lo último que se reportó en el año' using errcode = '23514';
    end if;
    if v_estado = 'aprobado' and (select public.get_user_rol()) is distinct from 'admin' then
      raise exception 'PDM: este reporte ya fue aprobado; para sumar avance haz un reporte nuevo' using errcode = '23514';
    end if;
  elsif v_ultimo.id is not null and v_estado <> 'aprobado' then
    raise exception 'PDM: ya hay un reporte de este año sin cerrar; corrígelo en vez de hacer otro' using errcode = '23514';
  end if;

  -- «Antes → ahora»: lo último que se había reportado en el año (nada, si es el primero).
  NEW.valor_anterior := v_ultimo.valor;
  return NEW;
end $f$;

create or replace function public.pdm_reportar(
  p_indicador uuid, p_anio integer, p_valor numeric, p_texto text, p_evidencias jsonb,
  p_motivo text default null, p_conservar uuid[] default '{}'::uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_yo uuid := (select auth.uid());
  v_plan uuid;
  v_inicio int;
  v_fin int;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_conservar uuid[] := coalesce(p_conservar, '{}');
  v_ultimo uuid;
  v_estado text;
  v_id uuid;
  v_prefijo text;
  e jsonb;
begin
  perform pdm_privado.abrir_operacion('reportar', null);
  select i.plan_id, p.anio_inicio, p.anio_fin into v_plan, v_inicio, v_fin
    from public.pdm_indicadores i join public.pdm_planes p on p.id = i.plan_id
   where i.id = p_indicador and i.activo;
  if v_plan is null then raise exception 'PDM: el indicador no existe o no tienes acceso a él' using errcode = '42501'; end if;
  -- Quién puede reportar se dice ANTES de validar nada. La política de la tabla sigue siendo la barrera real.
  if (select pdm_privado.mi_nivel()) is null or not pdm_privado.es_responsable(p_indicador) then
    raise exception 'PDM: este indicador no está a tu cargo' using errcode = '42501';
  end if;
  if p_anio is null or p_anio < v_inicio or p_anio > v_fin then
    raise exception 'PDM: elige un año del plan (% a %)', v_inicio, v_fin using errcode = '22023';
  end if;
  if p_anio > extract(year from (now() at time zone 'America/Bogota'))::int then
    raise exception 'PDM: el año % empieza el 1 de enero; todavía no se puede reportar', p_anio using errcode = '23514';
  end if;

  if p_valor is null or p_valor < 0 then raise exception 'PDM: el valor debe ser un número igual o mayor que cero' using errcode = '22023'; end if;
  if char_length(v_texto) < 10 then raise exception 'PDM: cuenta qué se hizo (al menos 10 caracteres)' using errcode = '22023'; end if;
  if char_length(v_texto) > 1000 then raise exception 'PDM: la descripción no puede pasar de 1.000 caracteres' using errcode = '22001'; end if;
  if jsonb_typeof(p_evidencias) is distinct from 'array' then
    raise exception 'PDM: un reporte necesita al menos una evidencia' using errcode = '23514';
  end if;
  if jsonb_array_length(p_evidencias) + cardinality(v_conservar) = 0 then
    raise exception 'PDM: un reporte necesita al menos una evidencia' using errcode = '23514';
  end if;
  if jsonb_array_length(p_evidencias) + cardinality(v_conservar) > 5 then
    raise exception 'PDM: un reporte admite como máximo 5 evidencias' using errcode = '22023';
  end if;
  if (select count(distinct c) from unnest(v_conservar) c) <> cardinality(v_conservar) then
    raise exception 'PDM: un archivo está repetido entre los que conservas' using errcode = '22023';
  end if;

  v_prefijo := v_plan::text || '/' || p_indicador::text || '/' || p_anio::text || '/';
  for e in select value from jsonb_array_elements(p_evidencias) loop
    if jsonb_typeof(e) is distinct from 'object'
       or coalesce(e->>'ruta', '') = '' or left(e->>'ruta', char_length(v_prefijo)) <> v_prefijo
       or (e->>'ruta') like '%..%' or char_length(e->>'ruta') > 300 then
      raise exception 'PDM: una evidencia no corresponde a este indicador y este año' using errcode = '22023';
    end if;
    if coalesce(btrim(e->>'nombre'), '') = '' or char_length(e->>'nombre') > 200 then
      raise exception 'PDM: una evidencia no tiene un nombre válido' using errcode = '22023';
    end if;
    if (e->>'tipo') is null or (e->>'tipo') not in (
         'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') then
      raise exception 'PDM: tipo de archivo no permitido (PDF, imagen, Word o Excel)' using errcode = '22023';
    end if;
    if (e->>'bytes') is null or (e->>'bytes') !~ '^[0-9]+$' or (e->>'bytes')::bigint < 1 or (e->>'bytes')::bigint > 10485760 then
      raise exception 'PDM: cada evidencia puede pesar hasta 10 MB' using errcode = '22022';
    end if;
  end loop;

  -- Un reporte a la vez por indicador y año; el mismo cerrojo lo toma el disparador (es reentrante).
  perform pg_advisory_xact_lock(hashtextextended(p_indicador::text || ':' || p_anio::text, 0));

  -- Lo último que se reportó en este año (sin contar lo anulado): si está sin cerrar, esto es su corrección; si está
  -- aprobado, es un avance nuevo.
  select r.id into v_ultimo from public.pdm_reportes r
   where r.indicador_id = p_indicador and r.anio = p_anio
     and not pdm_privado.anulado(r.id)
   order by r.created_at desc, r.id desc limit 1;
  if v_ultimo is not null then
    select x.estado into v_estado from public.pdm_validaciones x where x.reporte_id = v_ultimo order by x.created_at desc, x.id desc limit 1;
    v_estado := coalesce(v_estado, 'pendiente');
  end if;

  if v_ultimo is null or v_estado = 'aprobado' then
    if cardinality(v_conservar) > 0 then
      raise exception 'PDM: solo se conservan archivos al corregir un reporte que no está aprobado' using errcode = '22023';
    end if;
    insert into public.pdm_reportes (indicador_id, anio, valor, texto, autor_id, autor_nombre)
    values (p_indicador, p_anio, p_valor, v_texto, v_yo, pdm_privado.nombre_de(v_yo))
    returning id into v_id;
  else
    if v_motivo is null or char_length(v_motivo) < 10 then
      raise exception 'PDM: di qué corriges (al menos 10 caracteres)' using errcode = '22023';
    end if;
    if char_length(v_motivo) > 500 then raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001'; end if;
    if (select count(*) from public.pdm_evidencias e where e.id = any(v_conservar) and e.reporte_id = v_ultimo) <> cardinality(v_conservar) then
      raise exception 'PDM: un archivo que quieres conservar no es del reporte que corriges' using errcode = '22023';
    end if;
    insert into public.pdm_reportes (indicador_id, anio, valor, texto, autor_id, autor_nombre, corrige_a, motivo_correccion)
    values (p_indicador, p_anio, p_valor, v_texto, v_yo, pdm_privado.nombre_de(v_yo), v_ultimo, v_motivo)
    returning id into v_id;
  end if;

  insert into public.pdm_evidencias (reporte_id, ruta, nombre, tipo, bytes, subido_por)
  select v_id, x->>'ruta', btrim(x->>'nombre'), x->>'tipo', (x->>'bytes')::bigint, v_yo
  from jsonb_array_elements(p_evidencias) x;

  -- Lo conservado: filas nuevas de esta versión que apuntan a las anteriores (el disparador las rellena tal cual eran).
  insert into public.pdm_evidencias (reporte_id, ruta, nombre, tipo, bytes, subido_por, copia_de)
  select v_id, e.ruta, e.nombre, e.tipo, e.bytes, v_yo, e.id
  from public.pdm_evidencias e where e.id = any(v_conservar);

  return jsonb_build_object(
    'reporte', v_id, 'correccion', v_ultimo is not null and v_estado <> 'aprobado', 'anio', p_anio,
    'conservadas', cardinality(v_conservar));
end $f$;

create or replace function pdm_privado.preparar_validacion()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  x jsonb;
  v_id uuid;
  v_vistos uuid[] := '{}';
begin
  NEW.validador_nombre := coalesce(pdm_privado.nombre_de(NEW.validador_id), NEW.validador_nombre);
  NEW.created_at := clock_timestamp();
  if pdm_privado.anulado(NEW.reporte_id) then
    raise exception 'PDM: este reporte fue anulado; ya no se valida' using errcode = '23514';
  end if;
  if exists (select 1 from public.pdm_reportes c where c.corrige_a = NEW.reporte_id and not pdm_privado.anulado(c.id)) then
    raise exception 'PDM: este reporte ya fue corregido; valida la versión más reciente' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.pdm_reportes r1
    join public.pdm_reportes r2 on r2.indicador_id = r1.indicador_id and r2.anio = r1.anio
                               and (r2.created_at, r2.id) > (r1.created_at, r1.id)
    where r1.id = NEW.reporte_id and not pdm_privado.anulado(r2.id)
  ) then
    raise exception 'PDM: hay un reporte más reciente de este indicador en este año; valida el más reciente' using errcode = '23514';
  end if;

  if jsonb_array_length(NEW.observaciones) > 0 then
    if NEW.estado <> 'devuelto' then
      raise exception 'PDM: solo se observan archivos al devolver un reporte' using errcode = '23514';
    end if;
    for x in select value from jsonb_array_elements(NEW.observaciones) loop
      if jsonb_typeof(x) is distinct from 'object'
         or coalesce(x->>'evidencia', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or coalesce(btrim(x->>'motivo'), '') = '' or char_length(x->>'motivo') > 300 then
        raise exception 'PDM: escribe qué le pasa a cada archivo que devuelves (hasta 300 caracteres)' using errcode = '22023';
      end if;
      v_id := (x->>'evidencia')::uuid;
      if v_id = any(v_vistos) then
        raise exception 'PDM: un archivo está observado dos veces' using errcode = '22023';
      end if;
      v_vistos := v_vistos || v_id;
      if not exists (select 1 from public.pdm_evidencias e where e.id = v_id and e.reporte_id = NEW.reporte_id) then
        raise exception 'PDM: un archivo observado no es de este reporte' using errcode = '23514';
      end if;
    end loop;
  end if;
  return NEW;
end $f$;

create or replace function public.pdm_validar(
  p_reporte uuid, p_estado text, p_comentario text default null, p_observaciones jsonb default null)
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_yo uuid := (select auth.uid());
  v_lote uuid;
  v_rep public.pdm_reportes%rowtype;
  v_c text := nullif(btrim(coalesce(p_comentario, '')), '');
  v_obs jsonb := coalesce(p_observaciones, '[]'::jsonb);
  v_limpias jsonb;
  v_ultimo text;
begin
  v_lote := pdm_privado.abrir_operacion('validar', null);
  if p_estado is null or p_estado not in ('aprobado', 'devuelto') then
    raise exception 'PDM: el estado debe ser aprobado o devuelto' using errcode = '22023';
  end if;
  if p_estado = 'devuelto' and (v_c is null or char_length(v_c) < 10) then
    raise exception 'PDM: al devolver un reporte explica qué falta (al menos 10 caracteres)' using errcode = '22023';
  end if;
  if v_c is not null and char_length(v_c) > 1000 then raise exception 'PDM: el comentario no puede pasar de 1.000 caracteres' using errcode = '22001'; end if;
  if jsonb_typeof(v_obs) is distinct from 'array' then
    raise exception 'PDM: las observaciones de los archivos no son válidas' using errcode = '22023';
  end if;
  if jsonb_array_length(v_obs) > 0 and p_estado <> 'devuelto' then
    raise exception 'PDM: solo se observan archivos al devolver un reporte' using errcode = '22023';
  end if;
  if jsonb_array_length(v_obs) > 5 then raise exception 'PDM: un reporte tiene como máximo 5 archivos' using errcode = '22023'; end if;

  select * into v_rep from public.pdm_reportes where id = p_reporte;
  if v_rep.id is null then raise exception 'PDM: el reporte no existe o no tienes acceso a él' using errcode = '42501'; end if;
  if v_rep.autor_id is not distinct from v_yo then raise exception 'PDM: no puedes validar tu propio reporte' using errcode = '23514'; end if;
  if pdm_privado.anulado(p_reporte) then
    raise exception 'PDM: este reporte fue anulado; ya no se valida' using errcode = '23514';
  end if;
  if exists (select 1 from public.pdm_reportes c where c.corrige_a = p_reporte and not pdm_privado.anulado(c.id)) then
    raise exception 'PDM: este reporte ya fue corregido; valida la versión más reciente' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.pdm_reportes r2
    where r2.indicador_id = v_rep.indicador_id and r2.anio = v_rep.anio
      and (r2.created_at, r2.id) > (v_rep.created_at, v_rep.id)
      and not pdm_privado.anulado(r2.id)
  ) then
    raise exception 'PDM: hay un reporte más reciente de este indicador en este año; valida el más reciente' using errcode = '23514';
  end if;

  select estado into v_ultimo from public.pdm_validaciones where reporte_id = p_reporte order by created_at desc, id desc limit 1;
  if v_ultimo = p_estado and (p_estado = 'aprobado' or (v_c is null and jsonb_array_length(v_obs) = 0)) then
    return jsonb_build_object('lote', v_lote, 'cambio', 'ninguno', 'estado', p_estado);
  end if;

  -- Solo se guarda lo que importa de cada observación (el disparador comprueba que sean archivos de ESTE reporte).
  select coalesce(jsonb_agg(jsonb_build_object('evidencia', o->>'evidencia', 'motivo', btrim(o->>'motivo'))), '[]'::jsonb)
    into v_limpias from jsonb_array_elements(v_obs) o;

  insert into public.pdm_validaciones (reporte_id, estado, comentario, validador_id, validador_nombre, observaciones)
  values (p_reporte, p_estado, v_c, v_yo, pdm_privado.nombre_de(v_yo), v_limpias);
  return jsonb_build_object('lote', v_lote, 'cambio', p_estado, 'estado', p_estado, 'observados', jsonb_array_length(v_limpias));
end $f$;

-- ─── 7. Las dos acciones del administrador ────────────────────────────────────

-- ANULAR: se pasa la versión más reciente del reporte; la base anula también sus versiones anteriores.
create or replace function public.pdm_anular_reporte(p_reporte uuid, p_motivo text)
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_yo uuid := (select auth.uid());
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_r public.pdm_reportes%rowtype;
  v_lote uuid := gen_random_uuid();
  v_id uuid;
  v_n int := 0;
begin
  if v_yo is null then raise exception 'PDM: se requiere una sesión' using errcode = '28000'; end if;
  if (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador puede anular un reporte' using errcode = '42501';
  end if;
  if v_motivo is null or char_length(v_motivo) < 10 then
    raise exception 'PDM: explica por qué anulas el reporte (al menos 10 caracteres)' using errcode = '22023';
  end if;
  if char_length(v_motivo) > 500 then raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001'; end if;

  select * into v_r from public.pdm_reportes where id = p_reporte;
  if v_r.id is null then raise exception 'PDM: el reporte no existe o no tienes acceso a él' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_r.indicador_id::text || ':' || v_r.anio::text, 0));

  if pdm_privado.anulado(p_reporte) then raise exception 'PDM: este reporte ya está anulado' using errcode = '23514'; end if;
  if exists (select 1 from public.pdm_reportes c where c.corrige_a = p_reporte) then
    raise exception 'PDM: este reporte ya fue corregido; anula su versión más reciente' using errcode = '23514';
  end if;

  -- De la versión más reciente a la primera (el disparador de la tabla no deja anular una versión con otra más nueva en pie).
  v_id := p_reporte;
  while v_id is not null loop
    insert into public.pdm_anulaciones (lote, reporte_id, accion, motivo, actor_id, actor_nombre)
    values (v_lote, v_id, 'anular', v_motivo, v_yo, pdm_privado.nombre_de(v_yo));
    v_n := v_n + 1;
    select corrige_a into v_id from public.pdm_reportes where id = v_id;
  end loop;

  -- La cadena se comprueba AHORA (no al cerrar la transacción) para que un fallo salga con su frase desde aquí; y se
  -- vuelve a diferir para que una segunda operación en la misma transacción no se compruebe fila por fila.
  set constraints public.pdm_anulaciones_cadena immediate;
  set constraints public.pdm_anulaciones_cadena deferred;
  return jsonb_build_object('lote', v_lote, 'versiones', v_n, 'anio', v_r.anio, 'indicador', v_r.indicador_id);
end $f$;

-- RESTAURAR: se pasa la versión más reciente del reporte anulado; la base restaura la cadena de la primera a la última.
create or replace function public.pdm_restaurar_reporte(p_reporte uuid, p_motivo text)
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_yo uuid := (select auth.uid());
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_r public.pdm_reportes%rowtype;
  v_lote uuid := gen_random_uuid();
  v_id uuid;
  v_ids uuid[] := '{}';
  k int;
begin
  if v_yo is null then raise exception 'PDM: se requiere una sesión' using errcode = '28000'; end if;
  if (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador puede restaurar un reporte' using errcode = '42501';
  end if;
  if v_motivo is null or char_length(v_motivo) < 10 then
    raise exception 'PDM: explica por qué restauras el reporte (al menos 10 caracteres)' using errcode = '22023';
  end if;
  if char_length(v_motivo) > 500 then raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001'; end if;

  select * into v_r from public.pdm_reportes where id = p_reporte;
  if v_r.id is null then raise exception 'PDM: el reporte no existe o no tienes acceso a él' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_r.indicador_id::text || ':' || v_r.anio::text, 0));

  if not pdm_privado.anulado(p_reporte) then raise exception 'PDM: este reporte no está anulado' using errcode = '23514'; end if;
  if exists (select 1 from public.pdm_reportes c where c.corrige_a = p_reporte) then
    raise exception 'PDM: indica la versión más reciente del reporte anulado' using errcode = '23514';
  end if;

  v_id := p_reporte;
  while v_id is not null loop
    v_ids := v_ids || v_id;
    select corrige_a into v_id from public.pdm_reportes where id = v_id;
  end loop;

  -- De la primera versión a la más reciente: cada una se restaura cuando las que le siguen todavía están anuladas.
  for k in reverse cardinality(v_ids)..1 loop
    insert into public.pdm_anulaciones (lote, reporte_id, accion, motivo, actor_id, actor_nombre)
    values (v_lote, v_ids[k], 'restaurar', v_motivo, v_yo, pdm_privado.nombre_de(v_yo));
  end loop;

  set constraints public.pdm_anulaciones_cadena immediate;
  set constraints public.pdm_anulaciones_cadena deferred;
  return jsonb_build_object('lote', v_lote, 'versiones', cardinality(v_ids), 'anio', v_r.anio, 'indicador', v_r.indicador_id);
end $f$;

-- ─── 8. Quién puede llamar ────────────────────────────────────────────────────

revoke all on function
  public.pdm_anular_reporte(uuid, text),
  public.pdm_restaurar_reporte(uuid, text),
  pdm_privado.anulado(uuid),
  pdm_privado.preparar_anulacion(),
  pdm_privado.exigir_cadena_completa()
from public, anon;

grant execute on function
  public.pdm_anular_reporte(uuid, text),
  public.pdm_restaurar_reporte(uuid, text)
to authenticated;

-- El ayudante lo llaman las vistas, las políticas y las funciones con la sesión de cada quien (y el servidor, con la
-- clave de servicio, cuando lee a nombre del módulo).
grant execute on function pdm_privado.anulado(uuid) to authenticated, service_role;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. La tabla: con RLS; `anon` sin nada; `authenticated` solo lee e inserta (la tabla solo crece)
  if not exists (select 1 from pg_class c where c.oid = 'public.pdm_anulaciones'::regclass and c.relrowsecurity) then
    raise exception 'PDM 068: pdm_anulaciones sin seguridad por filas';
  end if;
  select string_agg(p, ', ') into v_malas
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where has_table_privilege('anon', 'public.pdm_anulaciones', p)
     or (has_table_privilege('authenticated', 'public.pdm_anulaciones', p) and p not in ('SELECT', 'INSERT'));
  if v_malas is not null then raise exception 'PDM 068: pdm_anulaciones con permisos de más: %', v_malas; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pdm_anulaciones') <> 2 then
    raise exception 'PDM 068: pdm_anulaciones no tiene exactamente sus dos políticas';
  end if;

  -- 2. Las dos funciones públicas: SECURITY INVOKER, search_path fijo, sin `anon` ni PUBLIC, con `authenticated`, y piden ser administrador
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in ('pdm_anular_reporte', 'pdm_restaurar_reporte')
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or p.prosrc not like '%get_user_rol()%');
  if v_malas is not null then raise exception 'PDM 068: función mal protegida: %', v_malas; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('pdm_anular_reporte', 'pdm_restaurar_reporte')) <> 2 then
    raise exception 'PDM 068: no quedan exactamente las dos funciones públicas';
  end if;

  -- 3. Las ayudas de `pdm_privado` no son invocables por PUBLIC ni por anon
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.pronamespace = 'pdm_privado'::regnamespace
    and p.proname in ('anulado', 'preparar_anulacion', 'exigir_cadena_completa')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 068: ayuda invocable de más: %', v_malas; end if;

  -- 4. Las tres vistas siguen respetando los permisos de quien pregunta, sin permisos para anon, y saltan lo anulado
  select string_agg(v.n, ', ') into v_malas
  from (values ('pdm_reportes_vigentes'), ('pdm_avance_validado'), ('pdm_evidencias_vista')) v(n)
  where not exists (select 1 from pg_class c where c.oid = ('public.' || v.n)::regclass and 'security_invoker=true' = any(c.reloptions))
     or pg_get_viewdef(('public.' || v.n)::regclass) not like '%anulado%'
     or has_table_privilege('anon', 'public.' || v.n, 'SELECT');
  if v_malas is not null then raise exception 'PDM 068: vista mal armada: %', v_malas; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pdm_evidencias_vista' and column_name = 'anulada') then
    raise exception 'PDM 068: falta la columna anulada';
  end if;

  -- 5. La política de lectura de los reportes esconde lo anulado a quien no es administrador ni consulta
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pdm_reportes' and policyname = 'pdm_reportes_select' and qual like '%anulado%') then
    raise exception 'PDM 068: la política de lectura de pdm_reportes no esconde lo anulado';
  end if;

  -- 6. Las cuatro funciones que deciden «corrección o avance» y «se puede validar» saltan lo anulado
  select string_agg(x.f, ', ') into v_malas
  from (values ('pdm_reportar'), ('pdm_validar'), ('preparar_reporte'), ('preparar_validacion')) x(f)
  where not exists (select 1 from pg_proc p where p.proname = x.f and p.pronamespace in ('public'::regnamespace, 'pdm_privado'::regnamespace) and p.prosrc like '%anulado%');
  if v_malas is not null then raise exception 'PDM 068: función que no salta lo anulado: %', v_malas; end if;

  -- 7. Los disparadores están enchufados y las funciones anteriores siguen
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_anulaciones', 'pdm_anulaciones_preparar'), ('pdm_anulaciones', 'pdm_anulaciones_cadena'),
               ('pdm_reportes', 'pdm_reportes_preparar'), ('pdm_reportes', 'pdm_reportes_exige_evidencia'),
               ('pdm_validaciones', 'pdm_validaciones_preparar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 068: disparador sin enchufar: %', v_malas; end if;
  if to_regprocedure('public.pdm_reportar(uuid,integer,numeric,text,jsonb,text,uuid[])') is null
     or to_regprocedure('public.pdm_validar(uuid,text,text,jsonb)') is null then
    raise exception 'PDM 068: falta una función anterior';
  end if;

  -- 8. No se anuló nada al instalar
  if exists (select 1 from public.pdm_anulaciones) then raise exception 'PDM 068: la tabla debía nacer vacía'; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/068_pdm_anular_reportes.sql. Devuelve las tres vistas, la política y
-- las cuatro funciones a como estaban y quita lo nuevo. SE NIEGA a borrar la tabla si ya tiene anulaciones escritas
-- (son historia): primero hay que exportarlas.
