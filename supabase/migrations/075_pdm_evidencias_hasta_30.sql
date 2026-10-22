-- Migration 075: módulo Plan de Desarrollo — un reporte admite hasta 30 archivos, y la aplicación ya no dice cuántos
--
-- POR QUÉ. Hasta aquí un reporte admitía como máximo 5 archivos, un número que puse yo en la Fase B (1-oct-2026) como valor de diseño y
-- que nadie decidió. Felipe (20-oct-2026): «no quiero que exista tope, o que si existe sea de 30 y no lo especifiques en la
-- aplicación». Un tope en cero (sin límite) no se deja: cada archivo se firma, se lee entero para calcular su huella y se empaqueta, y
-- sin una barrera un reporte absurdo (o un error del navegador) podría dejar cientos de archivos en un solo envío. 30 queda como
-- RED DE SEGURIDAD que nadie debería tocar en el uso normal, y la aplicación NO lo muestra: ni «N de 30», ni «hasta 30», ni en un
-- mensaje de error.
--
-- QUÉ CAMBIA
--
--   · `pdm_privado.max_evidencias()`: UN solo lugar de la base donde está el número (30), como `limite_de_evidencia` lo es para los
--     tipos. `pdm_reportar` y `pdm_validar` lo consultan en vez de repetir el literal. La aplicación tiene su copia en
--     lib/pdm/seguimiento-acciones.ts (MAX_EVIDENCIAS); tests/pdm/seguimiento.test.ts vigila que digan lo mismo.
--   · `pdm_reportar`: entre los archivos nuevos y los conservados de la versión anterior caben hasta 30 (antes 5). Es la de la 073,
--     palabra por palabra, salvo ese control y su mensaje, que ya no lleva el número.
--   · `pdm_validar`: al devolver un reporte se pueden marcar hasta tantos archivos como admite un reporte (antes 5): con 30 archivos,
--     la secretaría tiene que poder observar el que falle, sea cual sea. Es la de la 069, palabra por palabra, salvo ese control y
--     su mensaje.
--   · `pdm_validaciones_observaciones_check`: de 5 a 30 observaciones, lo mismo.
--
-- NADA CAMBIA PARA LO YA REPORTADO: no se toca ninguna fila (hoy no hay reportes). Conserva los permisos de las dos funciones:
-- `create or replace` no los toca. El comprobador del final aborta la migración si algo de lo prometido no queda cumplido.
-- Copia para revertir: supabase/reversiones/075_…; prueba de punta a punta: supabase/tests/pdm_evidencias_tope.sql.

begin;

-- ─── 1. El número, en un solo lugar ───────────────────────────────────────────

create or replace function pdm_privado.max_evidencias()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $f$ select 30 $f$;

comment on function pdm_privado.max_evidencias() is
  'Cuántos archivos admite como máximo un reporte (red de seguridad; la aplicación no lo muestra). pdm_reportar y pdm_validar lo consultan. La aplicación tiene su copia en lib/pdm/seguimiento-acciones.ts (MAX_EVIDENCIAS) y la restricción pdm_validaciones_observaciones_check lleva el mismo número escrito; tests/pdm/seguimiento.test.ts vigila que los tres digan lo mismo.';

revoke all on function pdm_privado.max_evidencias() from public, anon;
grant execute on function pdm_privado.max_evidencias() to authenticated, service_role;

-- ─── 2. pdm_reportar: la de la 073, con el tope de la función ─────────────────

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
  v_limite bigint;
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
  if jsonb_array_length(p_evidencias) + cardinality(v_conservar) > pdm_privado.max_evidencias() then
    raise exception 'PDM: este reporte tiene más archivos de los que admite' using errcode = '22023';
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
    -- Qué tipos se admiten y cuánto puede pesar cada uno lo dice UNA función (`pdm_privado.limite_de_evidencia`): esta no repite la lista.
    v_limite := pdm_privado.limite_de_evidencia(e->>'tipo');
    if v_limite is null then
      raise exception 'PDM: tipo de archivo no permitido (PDF, imagen, Word, Excel, presentación o video MP4 o MOV)' using errcode = '22023';
    end if;
    if (e->>'bytes') is null or (e->>'bytes') !~ '^[0-9]{1,12}$' or (e->>'bytes')::bigint < 1 or (e->>'bytes')::bigint > v_limite then
      raise exception 'PDM: este archivo pesa más de lo que admite su tipo (hasta % MB; los videos, hasta % MB)',
        pdm_privado.limite_de_evidencia('application/pdf') / 1048576, pdm_privado.limite_de_evidencia('video/mp4') / 1048576
        using errcode = '22022';
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

-- ─── 3. pdm_validar: la de la 069, con el tope de la función ──────────────────

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
  if jsonb_array_length(v_obs) > pdm_privado.max_evidencias() then raise exception 'PDM: se marcaron más archivos de los que tiene un reporte' using errcode = '22023'; end if;

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
  -- Reabrir (devolver un reporte que está APROBADO) es del administrador.
  if p_estado = 'devuelto' and v_ultimo = 'aprobado' and (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador puede reabrir un reporte aprobado' using errcode = '42501';
  end if;
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

-- ─── 4. La restricción de la tabla de validaciones ────────────────────────────

alter table public.pdm_validaciones drop constraint pdm_validaciones_observaciones_check;
alter table public.pdm_validaciones add constraint pdm_validaciones_observaciones_check
  check (jsonb_typeof(observaciones) = 'array' and jsonb_array_length(observaciones) <= 30);

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. El número, donde debe y con los permisos de su gemela
  if pdm_privado.max_evidencias() <> 30 then raise exception 'PDM 075: la función del tope no dice 30'; end if;
  if has_function_privilege('anon', 'pdm_privado.max_evidencias()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'pdm_privado.max_evidencias()', 'EXECUTE')
     or not has_function_privilege('service_role', 'pdm_privado.max_evidencias()', 'EXECUTE') then
    raise exception 'PDM 075: la función del tope no tiene los permisos que debe';
  end if;

  -- 2. Las dos funciones usan la función y no un literal, y no mencionan el número en sus mensajes
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.oid in ('public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure,
                  'public.pdm_validar(uuid, text, text, jsonb)'::regprocedure)
    and (p.prosrc not like '%pdm_privado.max_evidencias()%'
         or p.prosrc ~ '(>|>=|<|<=) 5( |;|$)'
         or p.prosrc ~ 'máximo 5 (archivos|evidencias)');
  if v_malas is not null then raise exception 'PDM 075: % no consulta el tope o conserva el 5', v_malas; end if;

  -- 3. Siguen sin ser de definidor, con ruta de búsqueda fija y con los permisos de antes
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.oid in ('public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure,
                  'public.pdm_validar(uuid, text, text, jsonb)'::regprocedure)
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or not has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 075: % perdió su forma o sus permisos', v_malas; end if;

  -- 4. pdm_reportar sigue apoyada en la función de tipos de la 073
  if not exists (select 1 from pg_proc p where p.oid = 'public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure
                    and p.prosrc like '%pdm_privado.limite_de_evidencia%') then
    raise exception 'PDM 075: pdm_reportar dejó de consultar los tipos de evidencia';
  end if;

  -- 5. La restricción de la tabla
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_validaciones'::regclass and c.conname = 'pdm_validaciones_observaciones_check'
                    and pg_get_constraintdef(c.oid) ~ 'jsonb_array_length\(observaciones\) <= 30\)') then
    raise exception 'PDM 075: pdm_validaciones_observaciones_check no quedó en 30';
  end if;

  -- 6. Lo ya guardado cabe (una restricción nueva no se podría crear si no, pero se dice claro)
  if exists (select 1 from public.pdm_validaciones where jsonb_array_length(observaciones) > 30) then
    raise exception 'PDM 075: hay validaciones con más de 30 observaciones';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/075_pdm_evidencias_hasta_30.sql (vuelve al tope de 5; se NIEGA si ya hay reportes
-- con más de 5 archivos o validaciones con más de 5 observaciones, que dejarían de poder reabrirse).
