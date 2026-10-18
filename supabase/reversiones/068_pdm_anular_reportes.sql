-- Reversión de la migración 068 (módulo Plan de Desarrollo: anular reportes).
--
-- Devuelve a como estaban antes de la 068: la política de lectura de `pdm_reportes`, las tres vistas (`pdm_evidencias_vista`
-- vuelve a no tener la columna `anulada`) y las cuatro funciones que deciden «corrección o avance» y «se puede validar»
-- (`pdm_reportar`, `pdm_validar`, `preparar_reporte`, `preparar_validacion`). Después quita lo que la 068 añadió: las
-- funciones `pdm_anular_reporte` y `pdm_restaurar_reporte`, los disparadores, `pdm_privado.anulado` y la tabla.
--
-- SE NIEGA a correr si `pdm_anulaciones` ya tiene filas: son historia (quién anuló qué y por qué) y borrar la tabla las
-- destruiría. En ese caso: primero exportarlas (`select * from public.pdm_anulaciones order by created_at`), y solo
-- entonces correr esto con la línea marcada «PUNTO DE NO RETORNO» activada. Además, mientras haya reportes anulados,
-- revertir los vuelve a contar como vigentes: restaurar o decidir uno por uno ANTES de revertir.
--
-- Antes de correrla: si la pantalla del seguimiento con «Anular» ya está desplegada, bajarla primero (los botones
-- llamarían a funciones que ya no existen). Se puede correr sin riesgo cuantas veces haga falta (`if exists`).

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Las anulaciones son historia: no se borran por descuido.
do $$
declare
  v_n bigint;
begin
  -- Dinámico a propósito: si la tabla ya no existe (se corrió antes), la consulta no se puede ni planificar.
  if to_regclass('public.pdm_anulaciones') is not null then
    execute 'select count(*) from public.pdm_anulaciones' into v_n;
    if v_n > 0 then
      raise exception 'Reversión 068: pdm_anulaciones tiene % filas. Expórtalas y restaura/decide cada reporte anulado antes de revertir (ver el encabezado de este archivo).', v_n;
    end if;
  end if;
end $$;

-- ─── La política de lectura de los reportes, como era ───────────────────────

drop policy if exists pdm_reportes_select on public.pdm_reportes;
create policy pdm_reportes_select on public.pdm_reportes
  for select to authenticated
  using (exists (select 1 from public.pdm_indicadores i where i.id = pdm_reportes.indicador_id));

-- ─── Las tres vistas, como eran ──────────────────────────────────────────────

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
order by r.indicador_id, r.anio, r.created_at desc, r.id desc;

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
where not exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id)
order by r.indicador_id, r.anio, r.created_at desc, r.id desc;

-- Quitar una columna a una vista no se puede con `create or replace`: se rehace.
drop view if exists public.pdm_evidencias_vista;
create view public.pdm_evidencias_vista with (security_invoker = true) as
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
            'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc') as busqueda
from public.pdm_evidencias e
join public.pdm_reportes r on r.id = e.reporte_id
join public.pdm_indicadores i on i.id = r.indicador_id
join public.dependencias d on d.id = i.dependencia_id
left join lateral (
  select x.estado from public.pdm_validaciones x
  where x.reporte_id = r.id order by x.created_at desc, x.id desc limit 1
) v on true;

revoke all on public.pdm_reportes_vigentes, public.pdm_avance_validado, public.pdm_evidencias_vista from public, anon, authenticated;
grant select on public.pdm_reportes_vigentes, public.pdm_avance_validado, public.pdm_evidencias_vista to authenticated;

-- ─── Las cuatro funciones, como eran ─────────────────────────────────────────

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

  select r.* into v_ultimo from public.pdm_reportes r
   where r.indicador_id = NEW.indicador_id and r.anio = NEW.anio
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

  -- Lo último que se reportó en este año: si está sin cerrar, esto es su corrección; si está aprobado, es un avance nuevo.
  select r.id into v_ultimo from public.pdm_reportes r
   where r.indicador_id = p_indicador and r.anio = p_anio
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
  if exists (select 1 from public.pdm_reportes where corrige_a = NEW.reporte_id) then
    raise exception 'PDM: este reporte ya fue corregido; valida la versión más reciente' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.pdm_reportes r1
    join public.pdm_reportes r2 on r2.indicador_id = r1.indicador_id and r2.anio = r1.anio
                               and (r2.created_at, r2.id) > (r1.created_at, r1.id)
    where r1.id = NEW.reporte_id
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
  if exists (select 1 from public.pdm_reportes where corrige_a = p_reporte) then
    raise exception 'PDM: este reporte ya fue corregido; valida la versión más reciente' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.pdm_reportes r2
    where r2.indicador_id = v_rep.indicador_id and r2.anio = v_rep.anio
      and (r2.created_at, r2.id) > (v_rep.created_at, v_rep.id)
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

-- ─── Lo que añadió la 068 ────────────────────────────────────────────────────

drop function if exists public.pdm_anular_reporte(uuid, text);
drop function if exists public.pdm_restaurar_reporte(uuid, text);
-- ─── PUNTO DE NO RETORNO: desde aquí se borra la tabla de anulaciones (ya vacía, o exportada) ───
-- Los dos disparadores de la tabla se van con ella (`drop trigger ... on` falla si la tabla ya no existe).
drop table if exists public.pdm_anulaciones;
drop function if exists pdm_privado.exigir_cadena_completa();
drop function if exists pdm_privado.preparar_anulacion();
drop function if exists pdm_privado.anulado(uuid);

-- Comprobación: no queda nada de la 068 y lo anterior sigue en pie.
do $$
begin
  if to_regclass('public.pdm_anulaciones') is not null
     or to_regprocedure('public.pdm_anular_reporte(uuid,text)') is not null
     or to_regprocedure('public.pdm_restaurar_reporte(uuid,text)') is not null
     or to_regprocedure('pdm_privado.anulado(uuid)') is not null then
    raise exception 'Reversión 068: quedan restos de la 068';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace in ('public'::regnamespace, 'pdm_privado'::regnamespace) and p.prokind = 'f' and p.prosrc like '%anulado(%') then
    raise exception 'Reversión 068: una función todavía nombra lo anulado';
  end if;
  if exists (select 1 from pg_views v where v.schemaname = 'public' and v.definition like '%anulado%') then
    raise exception 'Reversión 068: una vista todavía nombra lo anulado';
  end if;
  if to_regprocedure('public.pdm_reportar(uuid,integer,numeric,text,jsonb,text,uuid[])') is null
     or to_regprocedure('public.pdm_validar(uuid,text,text,jsonb)') is null then
    raise exception 'Reversión 068: falta una función anterior';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pdm_evidencias_vista' and column_name = 'anulada') then
    raise exception 'Reversión 068: la vista de evidencias todavía tiene la columna anulada';
  end if;
end $$;

commit;
