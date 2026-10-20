-- Migration 073: módulo Plan de Desarrollo — la evidencia admite PRESENTACIONES y VIDEOS, y cada tipo tiene su tope
--
-- POR QUÉ. Hasta aquí una evidencia era PDF, foto, Word o Excel, de hasta 10 MB. Las secretarías respaldan sus reportes también con
-- presentaciones (PowerPoint) y con video (un evento, una jornada), y un PDF escaneado de varias hojas ya pasa de 10 MB.
--
-- QUÉ CAMBIA
--
--   · Se admiten PowerPoint (.ppt y .pptx) y video MP4 y MOV (`video/mp4`, `video/quicktime`). Otros formatos de video no: los
--     teléfonos y las cámaras de oficina graban esos dos, y cada formato más es un tipo más que probar en cada navegador.
--   · El tope sube de 10 a 25 MB para todo lo que no es video, y los VIDEOS llegan a 200 MB. Los videos se suben por partes
--     (protocolo TUS, con una firma de UNA ruta que crea el servidor): una conexión que se cae no los empieza de cero.
--   · La lista de tipos y su tope viven en UN solo lugar: `pdm_privado.limite_de_evidencia(tipo)`, que devuelve el tope en bytes o
--     NULL si el tipo no se admite. `pdm_reportar` la consulta en vez de repetir la lista, así que el siguiente tipo que haya que
--     admitir cambia una función y no hay que volver a escribir `pdm_reportar` entera (como en 056, 057, 058 y 068).
--   · La tabla `pdm_evidencias` tenía su PROPIO tope de 10 MB (`pdm_evidencias_bytes_check`): el ensayo de esta migración lo encontró al
--     reportar un PowerPoint de 25 MB. Queda en 200 MB, el máximo de cualquier tipo, como red de seguridad; el tope de cada tipo lo
--     impone `pdm_reportar`.
--   · El espacio de archivos `pdm-evidencias` acepta los tipos nuevos y hasta 200 MB por archivo. (Ese tope es el MÁXIMO del espacio;
--     el de 25 MB para lo que no es video lo impone `pdm_reportar` y, antes, el servidor y la pantalla.)
--
-- LO QUE ESTA MIGRACIÓN NO PUEDE HACER. El almacenamiento de Supabase tiene además un límite GLOBAL por archivo, que es un ajuste del
-- proyecto (panel de Supabase → Storage → Settings → «Upload file size limit») y no una tabla: hoy está en 50 MB y el espacio no
-- puede dejar pasar más que eso. Mientras no se suba a 200 MB, un video de más de 50 MB lo rechaza el almacenamiento (413) aunque
-- esta migración y la aplicación lo admitan. Los demás tipos (25 MB) no dependen de ese ajuste.
--
-- NADA CAMBIA PARA LO YA REPORTADO: no se toca ninguna fila. Las evidencias de 10 MB o menos siguen siendo válidas.
--
-- La definición de `pdm_reportar` es la de la 068, palabra por palabra, salvo los dos controles del archivo (tipo y tamaño), que
-- ahora usan `pdm_privado.limite_de_evidencia`, y el largo máximo del número de bytes (12 cifras, para que un texto absurdo no
-- llegue a la conversión). Conserva sus permisos: `create or replace` no los toca.

begin;

-- ─── 1. La lista de tipos y su tope ───────────────────────────────────────────

create or replace function pdm_privado.limite_de_evidencia(p_tipo text)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $f$
  select case
    when p_tipo in (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) then 26214400::bigint        -- 25 MB
    when p_tipo in ('video/mp4', 'video/quicktime') then 209715200::bigint   -- 200 MB
    else null
  end
$f$;

comment on function pdm_privado.limite_de_evidencia(text) is
  'Cuánto puede pesar (en bytes) una evidencia de este tipo, o NULL si el tipo no se admite. Es la ÚNICA lista de tipos de evidencia de la base: pdm_reportar la consulta. La aplicación tiene su copia en lib/pdm/seguimiento-acciones.ts (TIPOS_EVIDENCIA); supabase/tests/pdm_evidencias_tipos.sql vigila que digan lo mismo.';

revoke all on function pdm_privado.limite_de_evidencia(text) from public, anon;
grant execute on function pdm_privado.limite_de_evidencia(text) to authenticated, service_role;

-- ─── 2. pdm_reportar: la misma de la 068, con los controles del archivo apoyados en la función ───

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

-- ─── 3. La tabla de evidencias: su propio tope ────────────────────────────────

-- Bloquea la tabla un instante (hoy no tiene filas, y las que haya pesan 10 MB o menos, así que la nueva restricción las acepta todas).
alter table public.pdm_evidencias drop constraint pdm_evidencias_bytes_check;
alter table public.pdm_evidencias add constraint pdm_evidencias_bytes_check check (bytes > 0 and bytes <= 209715200);

-- ─── 4. El espacio de archivos ────────────────────────────────────────────────

update storage.buckets
   set file_size_limit = 209715200,
       allowed_mime_types = array[
        'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'video/mp4', 'video/quicktime']
 where id = 'pdm-evidencias';

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
  v_mb constant bigint := 1048576;
begin
  -- 1. La función de límites: cada tipo con su tope, y lo desconocido, no
  if pdm_privado.limite_de_evidencia('application/pdf') <> 25 * v_mb
     or pdm_privado.limite_de_evidencia('application/vnd.openxmlformats-officedocument.presentationml.presentation') <> 25 * v_mb
     or pdm_privado.limite_de_evidencia('application/vnd.ms-powerpoint') <> 25 * v_mb
     or pdm_privado.limite_de_evidencia('image/heic') <> 25 * v_mb
     or pdm_privado.limite_de_evidencia('video/mp4') <> 200 * v_mb
     or pdm_privado.limite_de_evidencia('video/quicktime') <> 200 * v_mb then
    raise exception 'PDM 073: la función de límites no dice lo que debe';
  end if;
  if pdm_privado.limite_de_evidencia('video/webm') is not null or pdm_privado.limite_de_evidencia('video/x-msvideo') is not null
     or pdm_privado.limite_de_evidencia('application/zip') is not null or pdm_privado.limite_de_evidencia('text/html') is not null
     or pdm_privado.limite_de_evidencia('') is not null or pdm_privado.limite_de_evidencia(null) is not null then
    raise exception 'PDM 073: la función de límites admite un tipo que no debe';
  end if;
  if has_function_privilege('anon', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'pdm_privado.limite_de_evidencia(text)', 'EXECUTE') then
    raise exception 'PDM 073: la función de límites tiene mal sus permisos';
  end if;

  -- 2. El espacio de archivos: privado, hasta 200 MB, y exactamente los tipos de la función (ni uno más, ni uno menos)
  if not exists (select 1 from storage.buckets where id = 'pdm-evidencias' and not public and file_size_limit = 200 * v_mb) then
    raise exception 'PDM 073: el espacio pdm-evidencias no quedó privado y de 200 MB';
  end if;
  select string_agg(t, ', ') into v_malas
  from unnest((select allowed_mime_types from storage.buckets where id = 'pdm-evidencias')) t
  where pdm_privado.limite_de_evidencia(t) is null;
  if v_malas is not null then raise exception 'PDM 073: el espacio admite tipos que la función no: %', v_malas; end if;
  select string_agg(t, ', ') into v_malas
  from unnest(array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'video/mp4', 'video/quicktime']) t
  where t <> all (select unnest(allowed_mime_types) from storage.buckets where id = 'pdm-evidencias');
  if v_malas is not null then raise exception 'PDM 073: al espacio le faltan tipos: %', v_malas; end if;

  -- 3. La tabla: su tope es el máximo de cualquier tipo (200 MB), no los 10 MB de antes
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_evidencias'::regclass and c.conname = 'pdm_evidencias_bytes_check'
                    and pg_get_constraintdef(c.oid) like '%209715200%' and pg_get_constraintdef(c.oid) not like '%10485760%') then
    raise exception 'PDM 073: pdm_evidencias_bytes_check no quedó en 200 MB';
  end if;

  -- 4. pdm_reportar: usa la función, ya no lleva el tope de 10 MB, y conserva su ruta de búsqueda y sus permisos
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure
      and p.prosrc like '%pdm_privado.limite_de_evidencia%' and p.prosrc not like '%10485760%'
      and not p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')) then
    raise exception 'PDM 073: pdm_reportar no quedó como debe';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/073_pdm_evidencias_presentaciones_y_video.sql: se niega si ya hay evidencias de
-- los tipos nuevos o de más de 10 MB (no se pueden dejar archivos que el espacio ya no admitiría).
