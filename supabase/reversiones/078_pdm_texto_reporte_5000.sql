-- REVERSIÓN de la migración 078 («¿Qué se hizo?» hasta 5.000 caracteres). NO forma parte de la cadena de migraciones: se pega a mano.
-- Vuelve a `pdm_borrador_guardar` y `pdm_reportar` de la 076 (palabra por palabra), a la restricción del borrador en 1.000 y borra
-- `pdm_privado.max_texto_reporte()`.
-- OJO: SE NIEGA si hay un borrador con más de 1.000 caracteres (la restricción vieja no se podría crear). Los REPORTES ya enviados con más
-- de 1.000 siguen siendo válidos (la tabla no limita el largo), pero corregirlos obligaría a recortar el texto: decidir antes de revertir.
-- Si solo hace falta deshacer el CÓDIGO, no hace falta esto: con la 078 aplicada, el código anterior funciona igual (solo admite 1.000).

begin;

do $$
begin
  if exists (select 1 from public.pdm_borradores where char_length(texto) > 1000) then
    raise exception 'Reversión 078: hay borradores con más de 1.000 caracteres; no se revierte';
  end if;
end $$;

create or replace function public.pdm_borrador_guardar(
  p_indicador uuid, p_anio integer, p_version integer, p_valor numeric, p_texto text, p_motivo text,
  p_conservar uuid[], p_archivos jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $f$
declare
  v_plan uuid;
  v_inicio int;
  v_fin int;
  v_texto text := coalesce(p_texto, '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_conservar uuid[] := coalesce(p_conservar, '{}');
  v_archivos jsonb := coalesce(p_archivos, '[]'::jsonb);
  v_prefijo text;
  v_limite bigint;
  v_actual integer;
  e jsonb;
begin
  select i.plan_id, p.anio_inicio, p.anio_fin into v_plan, v_inicio, v_fin
    from public.pdm_indicadores i join public.pdm_planes p on p.id = i.plan_id
   where i.id = p_indicador and i.activo;
  if v_plan is null then raise exception 'PDM: el indicador no existe o no tienes acceso a él' using errcode = '42501'; end if;
  if (select pdm_privado.mi_nivel()) is null or not pdm_privado.es_responsable(p_indicador) then
    raise exception 'PDM: este indicador no está a tu cargo' using errcode = '42501';
  end if;
  if p_anio is null or p_anio < v_inicio or p_anio > v_fin then
    raise exception 'PDM: elige un año del plan (% a %)', v_inicio, v_fin using errcode = '22023';
  end if;
  if p_anio > extract(year from (now() at time zone 'America/Bogota'))::int then
    raise exception 'PDM: el año % empieza el 1 de enero; todavía no se puede reportar', p_anio using errcode = '23514';
  end if;

  -- Un borrador puede estar incompleto, pero lo que trae tiene que servir.
  if p_valor is not null and (p_valor < 0 or p_valor > 1000000000000) then
    raise exception 'PDM: el valor debe ser un número igual o mayor que cero' using errcode = '22023';
  end if;
  if char_length(v_texto) > 1000 then raise exception 'PDM: la descripción no puede pasar de 1.000 caracteres' using errcode = '22001'; end if;
  if v_motivo is not null and char_length(v_motivo) > 500 then raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001'; end if;
  if jsonb_typeof(v_archivos) is distinct from 'array' then
    raise exception 'PDM: la lista de archivos del borrador no es válida' using errcode = '22023';
  end if;
  if jsonb_array_length(v_archivos) + cardinality(v_conservar) > pdm_privado.max_evidencias() then
    raise exception 'PDM: este reporte tiene más archivos de los que admite' using errcode = '22023';
  end if;
  if (select count(distinct c) from unnest(v_conservar) c) <> cardinality(v_conservar) then
    raise exception 'PDM: un archivo está repetido entre los que conservas' using errcode = '22023';
  end if;
  if cardinality(v_conservar) > 0 and (
       select count(*) from public.pdm_evidencias ev join public.pdm_reportes r on r.id = ev.reporte_id
        where ev.id = any(v_conservar) and r.indicador_id = p_indicador and r.anio = p_anio) <> cardinality(v_conservar) then
    raise exception 'PDM: un archivo que quieres conservar no es de este indicador y este año' using errcode = '22023';
  end if;
  if p_valor is null and btrim(v_texto) = '' and v_motivo is null and jsonb_array_length(v_archivos) = 0 and cardinality(v_conservar) = 0 then
    raise exception 'PDM: no hay nada que guardar en el borrador' using errcode = '22023';
  end if;

  v_prefijo := v_plan::text || '/' || p_indicador::text || '/' || p_anio::text || '/';
  for e in select value from jsonb_array_elements(v_archivos) loop
    if jsonb_typeof(e) is distinct from 'object'
       or coalesce(e->>'ruta', '') = '' or left(e->>'ruta', char_length(v_prefijo)) <> v_prefijo
       or (e->>'ruta') like '%..%' or char_length(e->>'ruta') > 300 then
      raise exception 'PDM: una evidencia no corresponde a este indicador y este año' using errcode = '22023';
    end if;
    if coalesce(btrim(e->>'nombre'), '') = '' or char_length(e->>'nombre') > 200 then
      raise exception 'PDM: una evidencia no tiene un nombre válido' using errcode = '22023';
    end if;
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
  if (select count(distinct x->>'ruta') from jsonb_array_elements(v_archivos) x) <> jsonb_array_length(v_archivos) then
    raise exception 'PDM: un mismo archivo está repetido' using errcode = '22023';
  end if;

  -- Un guardado a la vez por indicador y año.
  perform pg_advisory_xact_lock(hashtextextended('borrador:' || p_indicador::text || ':' || p_anio::text, 0));

  select b.version into v_actual from public.pdm_borradores b where b.indicador_id = p_indicador and b.anio = p_anio;
  if v_actual is distinct from nullif(p_version, 0) then
    raise exception 'PDM: el borrador cambió mientras lo editabas (o ya se envió o se descartó). Recarga la página para ver lo último' using errcode = '40001';
  end if;

  -- Un archivo ya registrado como evidencia de un reporte, o en el borrador de otro indicador o año, no puede entrar aquí.
  if exists (select 1 from public.pdm_evidencias ev where ev.ruta in (select x->>'ruta' from jsonb_array_elements(v_archivos) x)) then
    raise exception 'PDM: uno de esos archivos ya está en un reporte. Súbelo de nuevo' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.pdm_borrador_archivos a join public.pdm_borradores b on b.id = a.borrador_id
     where a.ruta in (select x->>'ruta' from jsonb_array_elements(v_archivos) x)
       and not (b.indicador_id = p_indicador and b.anio = p_anio)) then
    raise exception 'PDM: uno de esos archivos ya está en otro borrador. Súbelo de nuevo' using errcode = '23505';
  end if;

  return pdm_privado.escribir_borrador(p_indicador, p_anio, p_valor, v_texto, v_motivo, v_conservar, v_archivos);
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

  -- El reporte enviado borra el borrador de ese indicador y año, en esta misma transacción (migración 076). Los archivos del borrador
  -- que van en este reporte ya son evidencias suyas; el servidor quita del almacenamiento los que no entraron.
  perform pdm_privado.quitar_borrador(p_indicador, p_anio);

  return jsonb_build_object(
    'reporte', v_id, 'correccion', v_ultimo is not null and v_estado <> 'aprobado', 'anio', p_anio,
    'conservadas', cardinality(v_conservar));
end $f$;

alter table public.pdm_borradores drop constraint pdm_borradores_texto_check;
alter table public.pdm_borradores add constraint pdm_borradores_texto_check check (char_length(texto) <= 1000);

drop function pdm_privado.max_texto_reporte();

commit;
