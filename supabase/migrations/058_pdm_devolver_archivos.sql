-- Migration 058: módulo Plan de Desarrollo — devolver un ARCHIVO, no todo el reporte
--
-- POR QUÉ. Hasta la 057 la secretaría solo podía devolver el reporte completo, y quien respondía tenía que volver
-- a adjuntar TODA la evidencia (nada se reutilizaba): si fallaba un solo archivo, la versión corregida quedaba solo
-- con los que se subieran de nuevo. Ahora la secretaría marca QUÉ archivos tienen problema (con una nota en cada
-- uno) y los demás pasan solos a la versión corregida.
--
-- LA REGLA (decidida con la Alcaldía): no se aprueba a medias. Un archivo observado devuelve el reporte COMPLETO;
-- no existe «aprobado, pero sin este archivo». La corrección conserva lo que estaba bien y reemplaza (o quita) lo
-- observado: un archivo observado NO se puede conservar tal cual.
--
-- QUÉ CAMBIA
--
--   · `pdm_validaciones.observaciones`: la lista de archivos observados de ESA validación, con su nota. Vive en la
--     misma fila inmutable que la devolución, así que las dos cosas nacen juntas y no se pueden separar. Solo se
--     observan archivos al DEVOLVER, y de ese reporte (hasta cinco, sin repetir).
--   · `pdm_evidencias.copia_de`: un archivo conservado en una corrección es una fila NUEVA de la nueva versión que
--     apunta a la anterior. Cada versión del reporte conserva sus archivos tal como se vieron al validarla: nada
--     de lo ya revisado se toca. Comparten el mismo objeto del almacenamiento, así que no se copia ni se vuelve a
--     subir nada.
--       - El disparador `preparar_evidencia` impone que lo conservado venga de la versión que se corrige, que no
--         esté observado, y lo rellena TAL CUAL era (nombre, tipo, tamaño y ruta): nadie puede redeclararlo.
--       - Una ruta «original» sigue siendo de UN solo reporte en toda la base (índice único parcial); solo se
--         repite conservándola.
--   · `pdm_reportar(…, p_conservar uuid[])`: en una corrección se pueden conservar archivos de la versión que se
--     corrige. Entre lo conservado y lo nuevo hay de 1 a 5 archivos.
--   · `pdm_validar(…, p_observaciones jsonb)`: recibe las observaciones al devolver.
--
-- LO QUE NO TOCA. Nada de Contratista Digital. No se pierde nada: lo existente sigue igual (hoy no hay reportes).
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no
-- queda cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── Evidencias: una versión corregida puede conservar los archivos de la anterior ──

alter table public.pdm_evidencias drop constraint pdm_evidencias_ruta_key;
alter table public.pdm_evidencias add column copia_de uuid references public.pdm_evidencias(id) on delete restrict;
-- Una ruta ORIGINAL (subida de verdad) es de un solo reporte, en toda la base; solo se repite conservándola.
create unique index pdm_evidencias_ruta_original on public.pdm_evidencias (ruta) where copia_de is null;
-- Y dentro de un reporte, un archivo no aparece dos veces.
alter table public.pdm_evidencias add constraint pdm_evidencias_reporte_ruta_key unique (reporte_id, ruta);
create index pdm_evidencias_copia_idx on public.pdm_evidencias (copia_de);

comment on column public.pdm_evidencias.copia_de is
  'Si este archivo se CONSERVÓ al corregir un reporte: la evidencia de la versión anterior de la que viene (misma ruta en el almacenamiento). NULL = se subió con este reporte.';

-- ─── Validaciones: los archivos observados al devolver ──────────────────────

alter table public.pdm_validaciones
  add column observaciones jsonb not null default '[]'::jsonb
  check (jsonb_typeof(observaciones) = 'array' and jsonb_array_length(observaciones) <= 5);

comment on column public.pdm_validaciones.observaciones is
  'Archivos observados al devolver el reporte: [{evidencia, motivo}]. Solo con estado «devuelto». Un archivo observado no se conserva en la corrección.';

-- ─── Disparadores ───────────────────────────────────────────────────────────

-- Antes de insertar una evidencia: si se CONSERVA (copia_de), tiene que venir de la versión que se corrige, sin estar
-- observada, y queda EXACTAMENTE como era. Corre con los permisos del dueño: ve toda la base, no solo lo que ve quien inserta.
create function pdm_privado.preparar_evidencia() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  o public.pdm_evidencias%rowtype;
  v_corrige uuid;
begin
  if NEW.copia_de is null then return NEW; end if;

  select * into o from public.pdm_evidencias where id = NEW.copia_de;
  select corrige_a into v_corrige from public.pdm_reportes where id = NEW.reporte_id;
  if o.id is null or v_corrige is null or o.reporte_id <> v_corrige then
    raise exception 'PDM: solo se conservan archivos del reporte que se corrige' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.pdm_validaciones v, jsonb_array_elements(v.observaciones) x
    where v.reporte_id = o.reporte_id and (x->>'evidencia')::uuid = o.id
  ) then
    raise exception 'PDM: un archivo devuelto no se conserva; reemplázalo o quítalo' using errcode = '23514';
  end if;

  -- Lo conservado es lo que ya estaba: nada se redeclara.
  NEW.ruta := o.ruta;
  NEW.nombre := o.nombre;
  NEW.tipo := o.tipo;
  NEW.bytes := o.bytes;
  return NEW;
end $$;

create trigger pdm_evidencias_preparar before insert on public.pdm_evidencias
  for each row execute function pdm_privado.preparar_evidencia();

-- Antes de insertar una validación: el nombre es el real, la hora es la real, solo se valida lo ÚLTIMO del año, y las
-- observaciones de archivos son de ESE reporte, solo al devolver.
create or replace function pdm_privado.preparar_validacion() returns trigger
language plpgsql set search_path = ''
as $$
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
end $$;

-- ─── Reportar y validar ─────────────────────────────────────────────────────

drop function public.pdm_reportar(uuid, integer, numeric, text, jsonb, text);
drop function public.pdm_validar(uuid, text, text);

-- Reporta el avance de un indicador en un AÑO, con sus evidencias, de una pieza.
--   p_evidencias: lista de {ruta, nombre, tipo, bytes} NUEVAS; las rutas deben ser de ESTE indicador y ESTE año.
--   p_conservar:  ids de evidencias de la versión que se corrige, que pasan tal cual a la nueva. Solo al corregir.
--                 Entre lo nuevo y lo conservado: de 1 a 5 archivos. Un archivo devuelto no se conserva.
--   p_motivo:     solo si el último reporte del año está sin cerrar (pendiente o devuelto): entonces esto es una
--                 corrección y el motivo es obligatorio. Tras un reporte aprobado, el siguiente es un avance nuevo.
create function public.pdm_reportar(
  p_indicador  uuid,
  p_anio       integer,
  p_valor      numeric,
  p_texto      text,
  p_evidencias jsonb,
  p_motivo     text default null,
  p_conservar  uuid[] default '{}'
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
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
end $$;

-- Aprueba o devuelve el último reporte de un indicador en un año. Al devolver se pueden marcar los archivos con
-- problema (`p_observaciones`: [{evidencia, motivo}]); el reporte se devuelve COMPLETO, y quien responde conserva los demás.
create function public.pdm_validar(
  p_reporte        uuid,
  p_estado         text,
  p_comentario     text default null,
  p_observaciones  jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
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
end $$;

revoke all on function public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[]) from public, anon;
grant execute on function public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[]) to authenticated;
revoke all on function public.pdm_validar(uuid, text, text, jsonb) from public, anon;
grant execute on function public.pdm_validar(uuid, text, text, jsonb) to authenticated;
revoke all on function pdm_privado.preparar_evidencia(), pdm_privado.preparar_validacion() from public;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
  v_publicas constant text[] := array[
    'pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar', 'pdm_habilitar', 'pdm_deshabilitar',
    'pdm_reportar', 'pdm_validar', 'pdm_comentar'];
begin
  -- 1. Lo nuevo está y lo viejo se fue
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pdm_evidencias' and column_name = 'copia_de') then
    raise exception 'PDM 058: falta pdm_evidencias.copia_de';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pdm_validaciones'
                 and column_name = 'observaciones' and is_nullable = 'NO') then
    raise exception 'PDM 058: falta pdm_validaciones.observaciones (obligatoria)';
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.pdm_evidencias'::regclass and conname = 'pdm_evidencias_ruta_key') then
    raise exception 'PDM 058: sigue la restricción que impedía conservar un archivo';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.pdm_evidencias'::regclass and conname = 'pdm_evidencias_reporte_ruta_key' and contype = 'u') then
    raise exception 'PDM 058: falta que un archivo no se repita dentro de un reporte';
  end if;
  if not exists (
    select 1 from pg_class c join pg_index i on i.indexrelid = c.oid
    where c.relnamespace = 'public'::regnamespace and c.relname = 'pdm_evidencias_ruta_original' and i.indisvalid and i.indisunique) then
    raise exception 'PDM 058: falta el índice único de las rutas originales';
  end if;
  if to_regprocedure('public.pdm_validar(uuid,text,text)') is not null
     or to_regprocedure('public.pdm_reportar(uuid,integer,numeric,text,jsonb,text)') is not null then
    raise exception 'PDM 058: quedan las firmas anteriores de pdm_validar o pdm_reportar';
  end if;

  -- 2. RLS en las tablas de seguimiento; `anon` sin nada; `authenticated` sin UPDATE, DELETE, TRUNCATE, REFERENCES ni TRIGGER
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relname in ('pdm_reportes', 'pdm_evidencias', 'pdm_validaciones', 'pdm_comentarios') and not c.relrowsecurity;
  if v_malas is not null then raise exception 'PDM 058: sin RLS: %', v_malas; end if;

  select string_agg(c.relname || ':' || p, ', ') into v_malas
  from pg_class c, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_reportes', 'pdm_evidencias', 'pdm_validaciones', 'pdm_comentarios')
    and (has_table_privilege('anon', c.oid, p)
         or (p in ('UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER') and has_table_privilege('authenticated', c.oid, p)));
  if v_malas is not null then raise exception 'PDM 058: permisos de sobra: %', v_malas; end if;

  select string_agg(tablename || '.' || policyname, ', ') into v_malas
  from pg_policies where schemaname = 'public' and tablename like 'pdm\_%' and roles <> '{authenticated}';
  if v_malas is not null then raise exception 'PDM 058: políticas fuera de authenticated: %', v_malas; end if;

  -- 3. Nunca NO ACTION ni RESTRICT hacia `usuarios`; toda clave foránea cubierta entera por un índice
  select string_agg(conrelid::regclass::text || '.' || conname, ', ') into v_malas
  from pg_constraint
  where contype = 'f' and confrelid = 'public.usuarios'::regclass
    and conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and confdeltype not in ('c', 'n');
  if v_malas is not null then raise exception 'PDM 058: bloquearía el borrado de usuarios: %', v_malas; end if;
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v_malas
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and array_to_string((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1], ',') = array_to_string(c.conkey, ','));
  if v_malas is not null then raise exception 'PDM 058: clave foránea sin índice que la cubra entera: %', v_malas; end if;

  -- 4. Las diez funciones públicas: SECURITY INVOKER, search_path fijo, sin `anon` ni PUBLIC, con `authenticated`
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(v_publicas)
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 058: función mal protegida: %', v_malas; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(v_publicas)) <> 10 then
    raise exception 'PDM 058: no quedan exactamente diez funciones públicas';
  end if;

  -- 5. Las ayudas de `pdm_privado` no son invocables por PUBLIC ni por anon
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pdm_privado'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 058: ayuda invocable de más: %', v_malas; end if;

  -- 6. Los disparadores están enchufados y activos (incluido el de la evidencia obligatoria, que es diferido)
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_asignaciones', 'pdm_asignaciones_auditar'), ('pdm_grupos', 'pdm_grupos_auditar'),
               ('pdm_grupo_miembros', 'pdm_grupo_miembros_auditar'), ('pdm_permisos', 'pdm_permisos_auditar'),
               ('pdm_reportes', 'pdm_reportes_preparar'), ('pdm_reportes', 'pdm_reportes_exige_evidencia'),
               ('pdm_evidencias', 'pdm_evidencias_preparar'),
               ('pdm_validaciones', 'pdm_validaciones_preparar'), ('pdm_comentarios', 'pdm_comentarios_preparar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 058: disparador sin enchufar: %', v_malas; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'pdm_reportes_exige_evidencia' and g.tgdeferrable and g.tginitdeferred) then
    raise exception 'PDM 058: la evidencia obligatoria debe ser un disparador diferido';
  end if;

  -- 7. Las dos vistas siguen corriendo con los permisos de quien pregunta
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_reportes_vigentes', 'pdm_avance_validado')
    and not coalesce('security_invoker=true' = any(c.reloptions), false);
  if v_malas is not null then raise exception 'PDM 058: vista que no respeta los permisos de quien pregunta: %', v_malas; end if;

  -- 8. El espacio de archivos sigue existiendo y es privado
  if not exists (select 1 from storage.buckets where id = 'pdm-evidencias' and not public and file_size_limit = 10485760) then
    raise exception 'PDM 058: el espacio pdm-evidencias no existe o no es privado';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Antes: confirmar que ninguna evidencia se haya conservado (`select count(*) from public.pdm_evidencias where copia_de is not null;`
-- debe dar 0) y que ninguna validación lleve observaciones. Después: volver a poner `pdm_evidencias_ruta_key`,
-- quitar `copia_de`, `pdm_evidencias_preparar`, `pdm_evidencias_ruta_original` y `pdm_evidencias_reporte_ruta_key`, quitar
-- `pdm_validaciones.observaciones`, y recrear `pdm_reportar` (6 argumentos), `pdm_validar` (3) y `preparar_validacion` como en la 057.
