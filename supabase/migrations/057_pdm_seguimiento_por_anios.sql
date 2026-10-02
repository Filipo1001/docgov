-- Migration 057: módulo Plan de Desarrollo — el seguimiento pasa de CORTES a AÑOS
--
-- POR QUÉ. Los cortes obligaban a que alguien (el administrador) abriera una ventana para que los
-- responsables pudieran reportar. El plan ya está organizado por años —cada indicador tiene una meta para
-- 2024, 2025, 2026 y 2027— y esa es la unidad natural: cada responsable ve cuatro tarjetas, una por año, y
-- reporta cuando haya algo que reportar, sin que nadie lo habilite.
--
-- QUÉ CAMBIA
--
--   · Un REPORTE es de un indicador en un AÑO (`pdm_reportes.anio`), ya no de un corte. Se puede reportar varias
--     veces en el año (cada reporte lleva su fecha); lo vigente del año es el último.
--       - Si el último está sin cerrar (pendiente o devuelto), el siguiente es su CORRECCIÓN (lleva motivo).
--       - Si el último está aprobado, el siguiente es un avance NUEVO (sin motivo): el responsable sigue sumando.
--       - Un reporte aprobado no se corrige (salvo el administrador); se suma otro.
--   · Reportar no necesita que nadie abra nada: el año 2027 no se puede reportar hasta el 1 de enero de 2027 (la
--     base lo impone, hora de Colombia); 2024 y 2025 quedan abiertos para cargar el histórico. Reportar sigue sin
--     ser contar: solo cuenta lo que la secretaría aprueba.
--   · Cada año se mide contra la meta de ese año. Desaparece la pregunta «¿avance del año o acumulado?»: lo que
--     se reporta es el avance de ESE año. Se retiran `pdm_planes.avance_modo` y `periodicidad` y la vista de metas
--     acumuladas.
--   · Se retiran los cortes: la tabla `pdm_cortes` y las funciones `pdm_corte_*` y `pdm_plan_configurar`. «Cómo
--     íbamos al 30 de septiembre» se saca de las fechas de los reportes, sin que nadie abra ni cierre nada.
--   · `pdm_reportar` recibe el año. Los reportes y las validaciones llevan siempre la hora real de la base
--     (`clock_timestamp()`): nadie puede fechar un reporte hacia atrás ni empatar el orden con otro.
--   · Solo se valida el reporte más reciente del indicador en el año.
--
-- LO QUE NO TOCA. Nada de Contratista Digital. Las evidencias, las validaciones, los comentarios, el espacio de
-- archivos `pdm-evidencias` y la evidencia obligatoria siguen como en la 056.
--
-- SEGURIDAD DE LA MIGRACIÓN. Se niega a correr si ya hay cortes o reportes (aquí no hay nada que migrar y no se
-- debe perder nada). Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de
-- lo prometido no queda cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── Solo sobre un seguimiento vacío ────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.pdm_reportes) or exists (select 1 from public.pdm_cortes) then
    raise exception 'PDM 057: ya hay cortes o reportes; esta migración solo es segura sobre un seguimiento vacío';
  end if;
end $$;

-- ─── Lo que se retira ───────────────────────────────────────────────────────

drop view public.pdm_avance_validado;
drop view public.pdm_reportes_vigentes;
drop view public.pdm_metas_acumuladas;

drop function public.pdm_plan_configurar(text, text, text);
drop function public.pdm_corte_guardar(uuid, text, date, boolean, text);
drop function public.pdm_corte_estado(uuid, text, text);
drop function public.pdm_corte_eliminar(uuid, text);
drop function public.pdm_reportar(uuid, numeric, text, jsonb, text);

drop trigger pdm_planes_auditar on public.pdm_planes;
drop trigger pdm_cortes_auditar on public.pdm_cortes;

-- La política de inserción de reportes nombra el corte: se quita antes de quitar la columna y se vuelve a crear abajo.
drop policy pdm_reportes_insert on public.pdm_reportes;

-- ─── Reportes: del corte al año ─────────────────────────────────────────────

alter table public.pdm_reportes add column anio integer not null check (anio between 2000 and 2100);
-- Quitar la columna se lleva su clave foránea y los índices que la nombraban (un original por corte, el del corte, el de vigente).
alter table public.pdm_reportes drop column corte_id;

drop table public.pdm_cortes;

alter table public.pdm_planes drop column avance_modo, drop column periodicidad;

create index pdm_reportes_vigente_idx on public.pdm_reportes (indicador_id, anio, created_at desc);

comment on column public.pdm_reportes.anio is 'El año del plan al que pertenece el avance reportado (se mide contra la meta de ESE año). Un indicador puede tener varios reportes en un año.';

-- Reportes: además de las correcciones del administrador (050), reporta quien tiene el indicador asignado Y tiene
-- acceso al módulo, siempre a su nombre. El año lo vigila el disparador.
create policy pdm_reportes_insert on public.pdm_reportes for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and (
      ((select public.get_user_rol()) = 'admin' and corrige_a is not null)
      or (
        (select pdm_privado.mi_nivel()) is not null
        and pdm_privado.es_responsable(indicador_id)
      )
    )
  );

-- ─── Vistas: lo vigente de cada año y lo que cuenta ─────────────────────────

-- El último reporte de cada indicador en cada año (lo que hay hoy en ese año), con su estado de validación y
-- cuántas evidencias tiene. Una fila por indicador y año: como mucho 257 × 4.
create view public.pdm_reportes_vigentes with (security_invoker = true) as
select distinct on (r.indicador_id, r.anio)
       r.id as reporte_id, r.indicador_id, r.anio, r.valor, r.valor_anterior, r.texto,
       r.autor_id, r.autor_nombre, r.created_at, r.corrige_a, r.motivo_correccion,
       coalesce(v.estado, 'pendiente') as estado,
       v.comentario as validacion_comentario, v.validador_nombre, v.created_at as validado_en,
       (select count(*) from public.pdm_evidencias e where e.reporte_id = r.id)::int as n_evidencias
from public.pdm_reportes r
left join lateral (
  select x.estado, x.comentario, x.validador_nombre, x.created_at
  from public.pdm_validaciones x where x.reporte_id = r.id
  order by x.created_at desc, x.id desc limit 1
) v on true
order by r.indicador_id, r.anio, r.created_at desc, r.id desc;

-- Lo que CUENTA: por indicador y año, el reporte aprobado más reciente que no fue reemplazado por una corrección.
create view public.pdm_avance_validado with (security_invoker = true) as
select distinct on (r.indicador_id, r.anio)
       r.indicador_id, r.anio, r.valor, v.created_at as validado_en, r.created_at as reportado_en
from public.pdm_reportes r
join lateral (
  select x.estado, x.created_at
  from public.pdm_validaciones x where x.reporte_id = r.id
  order by x.created_at desc, x.id desc limit 1
) v on v.estado = 'aprobado'
where not exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id)
order by r.indicador_id, r.anio, r.created_at desc, r.id desc;

revoke all on public.pdm_reportes_vigentes, public.pdm_avance_validado from public, anon, authenticated;
grant select on public.pdm_reportes_vigentes, public.pdm_avance_validado to authenticated;

-- ─── Disparadores ───────────────────────────────────────────────────────────

-- Antes de insertar un reporte: el nombre del autor es SIEMPRE el real; la hora es la real; el año es del plan y ya
-- empezó; y el reporte encaja en la cadena del año (corrección de lo último sin cerrar, o avance nuevo tras uno aprobado).
create or replace function pdm_privado.preparar_reporte() returns trigger
language plpgsql set search_path = ''
as $$
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
end $$;

-- Antes de insertar una validación: el nombre es el real, la hora es la real, y solo se valida lo ÚLTIMO que se reportó
-- del indicador en el año (lo corregido o superado es historia).
create or replace function pdm_privado.preparar_validacion() returns trigger
language plpgsql set search_path = ''
as $$
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
  return NEW;
end $$;

-- ─── La bitácora automática, sin cortes ni ajustes del plan ─────────────────

create or replace function pdm_privado.auditar() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor        uuid := (select auth.uid());
  v_actor_nombre text;
  v_plan         uuid;
  v_entidad      text;
  v_entidad_id   uuid;
  v_accion       text;
  v_detalle      jsonb;
  v_old          jsonb;
  v_new          jsonb;
  v_base         jsonb;
  v_usuario      uuid;
  v_usuario_nom  text;
  v_ctx          jsonb;
begin
  begin
    if TG_OP = 'INSERT' then v_new := to_jsonb(NEW);
    elsif TG_OP = 'DELETE' then v_old := to_jsonb(OLD);
    else v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    end if;
    v_base := coalesce(v_new, v_old);

    select coalesce(nullif(btrim(nombre_completo), ''), 'Usuario sin nombre') into v_actor_nombre
      from public.usuarios where id = v_actor;
    v_actor_nombre := coalesce(v_actor_nombre, case when v_actor is null then 'Sistema' else 'Usuario ' || v_actor::text end);

    v_ctx := jsonb_strip_nulls(jsonb_build_object(
      'lote',      nullif(current_setting('pdm.lote', true), ''),
      'operacion', nullif(current_setting('pdm.operacion', true), ''),
      'motivo',    nullif(current_setting('pdm.motivo', true), '')));

    if TG_TABLE_NAME = 'pdm_asignaciones' then
      v_entidad := 'indicador';
      v_entidad_id := (v_base->>'indicador_id')::uuid;
      select plan_id into v_plan from public.pdm_indicadores where id = v_entidad_id;
      v_usuario := (v_base->>'usuario_id')::uuid;
      select nombre_completo into v_usuario_nom from public.usuarios where id = v_usuario;
      v_accion := case TG_OP when 'INSERT' then 'asignacion_creada' when 'UPDATE' then 'asignacion_cambiada' else 'asignacion_quitada' end;
      v_detalle := jsonb_build_object(
        'usuario_id',        v_usuario,
        'usuario_nombre',    v_usuario_nom,
        'principal_antes',   v_old->'principal',
        'principal_despues', v_new->'principal',
        'grupo_antes',       v_old->'grupo_id',
        'grupo_despues',     v_new->'grupo_id',
        'grupo_nombre',      (select g.nombre from public.pdm_grupos g
                              where g.id = coalesce((v_new->>'grupo_id')::uuid, (v_old->>'grupo_id')::uuid)));

    elsif TG_TABLE_NAME = 'pdm_grupos' then
      v_entidad := 'grupo';
      v_entidad_id := (v_base->>'id')::uuid;
      v_plan := (v_base->>'plan_id')::uuid;
      v_accion := case TG_OP when 'INSERT' then 'grupo_creado' when 'UPDATE' then 'grupo_editado' else 'grupo_eliminado' end;
      v_detalle := jsonb_build_object(
        'antes',   v_old - 'updated_at',
        'despues', v_new - 'updated_at');
      if TG_OP = 'DELETE' then
        v_detalle := v_detalle || jsonb_build_object('miembros', (
          select coalesce(jsonb_agg(jsonb_build_object('usuario_id', m.usuario_id, 'usuario_nombre', u.nombre_completo, 'es_lider', m.es_lider) order by m.es_lider desc, u.nombre_completo), '[]'::jsonb)
          from public.pdm_grupo_miembros m left join public.usuarios u on u.id = m.usuario_id
          where m.grupo_id = (v_old->>'id')::uuid));
      end if;

    elsif TG_TABLE_NAME = 'pdm_permisos' then
      v_entidad := 'usuario';
      v_entidad_id := (v_base->>'usuario_id')::uuid;
      select id into v_plan from public.pdm_planes where activo order by created_at limit 1;
      select nombre_completo into v_usuario_nom from public.usuarios where id = v_entidad_id;
      v_accion := case TG_OP when 'INSERT' then 'acceso_habilitado' when 'UPDATE' then 'acceso_cambiado' else 'acceso_quitado' end;
      v_detalle := jsonb_build_object(
        'usuario_id',       v_entidad_id,
        'usuario_nombre',   v_usuario_nom,
        'nivel_antes',      v_old->'nivel',
        'nivel_despues',    v_new->'nivel');

    else  -- pdm_grupo_miembros
      v_entidad := 'grupo';
      v_entidad_id := (v_base->>'grupo_id')::uuid;
      select plan_id into v_plan from public.pdm_grupos where id = v_entidad_id;
      v_usuario := (v_base->>'usuario_id')::uuid;
      select nombre_completo into v_usuario_nom from public.usuarios where id = v_usuario;
      v_accion := case TG_OP when 'INSERT' then 'miembro_agregado' when 'UPDATE' then 'miembro_cambiado' else 'miembro_quitado' end;
      v_detalle := jsonb_build_object(
        'usuario_id',     v_usuario,
        'usuario_nombre', v_usuario_nom,
        'lider_antes',    v_old->'es_lider',
        'lider_despues',  v_new->'es_lider');
    end if;

    if v_plan is not null then
      insert into public.pdm_historial (plan_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle)
      values (v_plan, v_actor, v_actor_nombre, v_accion, v_entidad, v_entidad_id, v_detalle || v_ctx);
    end if;
  exception when others then
    if v_actor is not null then raise; end if;
    raise warning 'PDM: no se pudo anotar el cambio de % (%): %', TG_TABLE_NAME, TG_OP, SQLERRM;
  end;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;

-- ─── Reportar y validar ─────────────────────────────────────────────────────

-- Reporta el avance de un indicador en un AÑO, con sus evidencias, de una pieza.
--   p_anio: un año del plan que ya empezó (2024 y 2025 sirven para cargar el histórico).
--   p_evidencias: lista de {ruta, nombre, tipo, bytes}; entre 1 y 5; las rutas deben ser de ESTE indicador y ESTE año.
--   p_motivo: solo si el último reporte del año está sin cerrar (pendiente o devuelto): entonces esto es una
--             corrección y el motivo es obligatorio. Tras un reporte aprobado, el siguiente es un avance nuevo.
create function public.pdm_reportar(
  p_indicador  uuid,
  p_anio       integer,
  p_valor      numeric,
  p_texto      text,
  p_evidencias jsonb,
  p_motivo     text default null
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
  if jsonb_typeof(p_evidencias) is distinct from 'array' or jsonb_array_length(p_evidencias) = 0 then
    raise exception 'PDM: un reporte necesita al menos una evidencia' using errcode = '23514';
  end if;
  if jsonb_array_length(p_evidencias) > 5 then raise exception 'PDM: un reporte admite como máximo 5 evidencias' using errcode = '22023'; end if;

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
    insert into public.pdm_reportes (indicador_id, anio, valor, texto, autor_id, autor_nombre)
    values (p_indicador, p_anio, p_valor, v_texto, v_yo, pdm_privado.nombre_de(v_yo))
    returning id into v_id;
  else
    if v_motivo is null or char_length(v_motivo) < 10 then
      raise exception 'PDM: di qué corriges (al menos 10 caracteres)' using errcode = '22023';
    end if;
    if char_length(v_motivo) > 500 then raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001'; end if;
    insert into public.pdm_reportes (indicador_id, anio, valor, texto, autor_id, autor_nombre, corrige_a, motivo_correccion)
    values (p_indicador, p_anio, p_valor, v_texto, v_yo, pdm_privado.nombre_de(v_yo), v_ultimo, v_motivo)
    returning id into v_id;
  end if;

  insert into public.pdm_evidencias (reporte_id, ruta, nombre, tipo, bytes, subido_por)
  select v_id, x->>'ruta', btrim(x->>'nombre'), x->>'tipo', (x->>'bytes')::bigint, v_yo
  from jsonb_array_elements(p_evidencias) x;

  return jsonb_build_object('reporte', v_id, 'correccion', v_ultimo is not null and v_estado <> 'aprobado', 'anio', p_anio);
end $$;

create or replace function public.pdm_validar(
  p_reporte    uuid,
  p_estado     text,
  p_comentario text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_lote uuid;
  v_rep public.pdm_reportes%rowtype;
  v_c text := nullif(btrim(coalesce(p_comentario, '')), '');
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
  if v_ultimo = p_estado and (p_estado = 'aprobado' or v_c is null) then
    return jsonb_build_object('lote', v_lote, 'cambio', 'ninguno', 'estado', p_estado);
  end if;

  insert into public.pdm_validaciones (reporte_id, estado, comentario, validador_id, validador_nombre)
  values (p_reporte, p_estado, v_c, v_yo, pdm_privado.nombre_de(v_yo));
  return jsonb_build_object('lote', v_lote, 'cambio', p_estado, 'estado', p_estado);
end $$;

revoke all on function public.pdm_reportar(uuid, integer, numeric, text, jsonb, text) from public, anon;
grant execute on function public.pdm_reportar(uuid, integer, numeric, text, jsonb, text) to authenticated;

-- Reemplazar una función conserva sus permisos, pero se reafirman por si acaso.
revoke all on function public.pdm_validar(uuid, text, text) from public, anon;
grant execute on function public.pdm_validar(uuid, text, text) to authenticated;
revoke all on function pdm_privado.preparar_reporte(), pdm_privado.preparar_validacion() from public;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
  v_publicas constant text[] := array[
    'pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar', 'pdm_habilitar', 'pdm_deshabilitar',
    'pdm_reportar', 'pdm_validar', 'pdm_comentar'];
begin
  -- 1. Lo retirado ya no existe
  if to_regclass('public.pdm_cortes') is not null or to_regclass('public.pdm_metas_acumuladas') is not null then
    raise exception 'PDM 057: quedan los cortes o la vista de metas acumuladas';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and ((table_name = 'pdm_planes' and column_name in ('avance_modo', 'periodicidad'))
               or (table_name = 'pdm_reportes' and column_name = 'corte_id'))) then
    raise exception 'PDM 057: quedan columnas de cortes o de ajustes del plan';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pdm_reportes'
                 and column_name = 'anio' and is_nullable = 'NO') then
    raise exception 'PDM 057: pdm_reportes no tiene su año (obligatorio)';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
             and proname in ('pdm_plan_configurar', 'pdm_corte_guardar', 'pdm_corte_estado', 'pdm_corte_eliminar')) then
    raise exception 'PDM 057: quedan funciones de cortes';
  end if;

  -- 2. RLS en las tablas de seguimiento; `anon` sin nada; `authenticated` sin UPDATE, DELETE, TRUNCATE, REFERENCES ni TRIGGER
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relname in ('pdm_reportes', 'pdm_evidencias', 'pdm_validaciones', 'pdm_comentarios') and not c.relrowsecurity;
  if v_malas is not null then raise exception 'PDM 057: sin RLS: %', v_malas; end if;

  select string_agg(c.relname || ':' || p, ', ') into v_malas
  from pg_class c, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_reportes', 'pdm_evidencias', 'pdm_validaciones', 'pdm_comentarios')
    and (has_table_privilege('anon', c.oid, p)
         or (p in ('UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER') and has_table_privilege('authenticated', c.oid, p)));
  if v_malas is not null then raise exception 'PDM 057: permisos de sobra: %', v_malas; end if;

  -- 3. Políticas: una sola de insert en reportes; dos en evidencias, validaciones y comentarios; todas solo para authenticated
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pdm_reportes' and cmd = 'INSERT') <> 1 then
    raise exception 'PDM 057: pdm_reportes debe tener exactamente una política de insert';
  end if;
  select string_agg(tablename || ':' || n::text, ', ') into v_malas
  from (select tablename, count(*) n from pg_policies
        where schemaname = 'public' and tablename in ('pdm_evidencias', 'pdm_validaciones', 'pdm_comentarios') group by tablename) x
  where n <> 2;
  if v_malas is not null then raise exception 'PDM 057: número de políticas inesperado: %', v_malas; end if;
  select string_agg(tablename || '.' || policyname, ', ') into v_malas
  from pg_policies where schemaname = 'public' and tablename like 'pdm\_%' and roles <> '{authenticated}';
  if v_malas is not null then raise exception 'PDM 057: políticas fuera de authenticated: %', v_malas; end if;

  -- 4. Nunca NO ACTION ni RESTRICT hacia `usuarios`; toda clave foránea cubierta entera por un índice
  select string_agg(conrelid::regclass::text || '.' || conname, ', ') into v_malas
  from pg_constraint
  where contype = 'f' and confrelid = 'public.usuarios'::regclass
    and conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and confdeltype not in ('c', 'n');
  if v_malas is not null then raise exception 'PDM 057: bloquearía el borrado de usuarios: %', v_malas; end if;
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v_malas
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and array_to_string((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1], ',') = array_to_string(c.conkey, ','));
  if v_malas is not null then raise exception 'PDM 057: clave foránea sin índice que la cubra entera: %', v_malas; end if;

  -- 5. Las diez funciones públicas: SECURITY INVOKER, search_path fijo, sin `anon` ni PUBLIC, con `authenticated`
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(v_publicas)
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 057: función mal protegida: %', v_malas; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(v_publicas)) <> 10 then
    raise exception 'PDM 057: no quedan exactamente diez funciones públicas';
  end if;

  -- 6. Las ayudas de `pdm_privado` no son invocables por PUBLIC ni por anon
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pdm_privado'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 057: ayuda invocable de más: %', v_malas; end if;

  -- 7. Los disparadores están enchufados y activos (incluido el de la evidencia obligatoria, que es diferido)
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_asignaciones', 'pdm_asignaciones_auditar'), ('pdm_grupos', 'pdm_grupos_auditar'),
               ('pdm_grupo_miembros', 'pdm_grupo_miembros_auditar'), ('pdm_permisos', 'pdm_permisos_auditar'),
               ('pdm_reportes', 'pdm_reportes_preparar'), ('pdm_reportes', 'pdm_reportes_exige_evidencia'),
               ('pdm_validaciones', 'pdm_validaciones_preparar'), ('pdm_comentarios', 'pdm_comentarios_preparar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 057: disparador sin enchufar: %', v_malas; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'pdm_reportes_exige_evidencia' and g.tgdeferrable and g.tginitdeferred) then
    raise exception 'PDM 057: la evidencia obligatoria debe ser un disparador diferido';
  end if;

  -- 8. Las dos vistas corren con los permisos de quien pregunta, y nadie puede escribir en ellas
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_reportes_vigentes', 'pdm_avance_validado')
    and not coalesce('security_invoker=true' = any(c.reloptions), false);
  if v_malas is not null then raise exception 'PDM 057: vista que no respeta los permisos de quien pregunta: %', v_malas; end if;
  select string_agg(c.relname || ':' || p, ', ') into v_malas
  from pg_class c, unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
  where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_reportes_vigentes', 'pdm_avance_validado')
    and (has_table_privilege('anon', c.oid, p) or (p <> 'SELECT' and has_table_privilege('authenticated', c.oid, p)));
  if v_malas is not null then raise exception 'PDM 057: permisos de sobra en vistas: %', v_malas; end if;

  -- 9. Las reglas de unicidad que sostienen el modelo están y son válidas
  if not exists (
    select 1 from pg_class c join pg_index i on i.indexrelid = c.oid
    where c.relnamespace = 'public'::regnamespace and c.relname = 'pdm_reportes_una_correccion' and i.indisvalid and i.indisunique) then
    raise exception 'PDM 057: falta el índice único de una corrección por reporte';
  end if;
  if exists (
    select 1 from pg_class c where c.relnamespace = 'public'::regnamespace
      and c.relname in ('pdm_reportes_un_original', 'pdm_cortes_uno_abierto', 'pdm_cortes_nombre_unico')) then
    raise exception 'PDM 057: quedan índices de cortes';
  end if;

  -- 10. El espacio de archivos sigue existiendo y es privado
  if not exists (select 1 from storage.buckets where id = 'pdm-evidencias' and not public and file_size_limit = 10485760) then
    raise exception 'PDM 057: el espacio pdm-evidencias no existe o no es privado';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Volver a los cortes es volver a ejecutar la 056 sobre un seguimiento vacío: la 057 se negaría a revertirse
-- sola con datos, y los reportes por año no tienen corte al que volver. Antes: `select count(*) from public.pdm_reportes;`
-- debe dar 0. Después: recrear `pdm_cortes`, la columna `pdm_reportes.corte_id`, las funciones `pdm_corte_*`,
-- `pdm_plan_configurar` y la versión de la 056 de `pdm_reportar`, `pdm_validar` y de los disparadores
-- `preparar_reporte` y `preparar_validacion`, y `pdm_privado.auditar()` de la 056 (con los ramales de cortes y ajustes).
