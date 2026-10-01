-- Migration 056: módulo Plan de Desarrollo, Fase B — cortes, reportes con evidencia, validación y comentarios
--
-- QUÉ AÑADE. El ciclo de seguimiento, con las reglas que decidió la Alcaldía:
--
--   · AJUSTES DEL PLAN. `pdm_planes.avance_modo` («acumulado» o «anual»; NULL = por definir) y
--     `periodicidad` (texto informativo). Son datos que se definen a mano cuando Control Interno
--     decida, sin tocar código. Mientras `avance_modo` sea NULL el cumplimiento se muestra como
--     provisional.
--   · CORTES administrables. Se crean, se abren y se cierran cuando haga falta: no hay frecuencia
--     fija en el sistema. A lo sumo UN corte abierto a la vez.
--   · REPORTES de los responsables, en el corte abierto, con EVIDENCIA OBLIGATORIA. Un reporte es una
--     fila nueva y nunca se reescribe; corregir exige un motivo. La evidencia obligatoria la impone la
--     base (un disparador diferido), no solo la pantalla: un reporte sin evidencia no llega a existir.
--   · VALIDACIÓN por los supervisores (la secretaría de la dependencia del indicador): aprueban o
--     devuelven con un comentario. Nadie valida su propio reporte. Solo lo APROBADO cuenta en el
--     cumplimiento; mientras tanto se ve como «reportado, sin validar».
--   · COMENTARIOS de cualquiera con acceso al indicador; en particular, de Control Interno.
--   · EVIDENCIAS en el espacio privado `pdm-evidencias` (sin políticas: todo acceso pasa por el
--     servidor con enlaces temporales, como el resto de buckets de CD).
--
-- Cada cambio de ajustes, de cortes y de accesos queda en la bitácora automática (`pdm_historial`);
-- los reportes, validaciones y comentarios SON su propia historia: tablas de solo inserción.
--
-- LAS FUNCIONES (todas SECURITY INVOKER: mandan las políticas):
--   pdm_plan_configurar, pdm_corte_guardar, pdm_corte_estado, pdm_corte_eliminar   (administrador)
--   pdm_reportar, pdm_validar, pdm_comentar
--
-- LO QUE NO TOCA. Nada de Contratista Digital: ni tablas, ni columnas, ni políticas, ni funciones.
-- Solo se crea un bucket nuevo en el almacenamiento.
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo
-- prometido no queda cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── Ajustes del plan y cortes ──────────────────────────────────────────────

alter table public.pdm_planes
  add column avance_modo text check (avance_modo in ('acumulado', 'anual')),
  add column periodicidad text check (periodicidad is null or (btrim(periodicidad) <> '' and char_length(periodicidad) <= 120));

comment on column public.pdm_planes.avance_modo is
  'Qué significa el valor que se reporta: «anual» = avance del año (se mide contra la meta del año); «acumulado» = avance acumulado desde 2024 (contra la meta acumulada). NULL = por definir.';
comment on column public.pdm_planes.periodicidad is 'Cada cuánto se hacen los cortes, en palabras. Informativo: el sistema no la usa para nada.';

-- A lo sumo un corte abierto por plan: «el corte abierto» es un solo lugar donde se reporta.
create unique index pdm_cortes_uno_abierto on public.pdm_cortes (plan_id) where estado = 'abierto';

-- El nombre del corte no se repite ni cambiando mayúsculas: la 050 solo impedía el texto idéntico.
create unique index pdm_cortes_nombre_unico on public.pdm_cortes (plan_id, lower(btrim(nombre)));

-- ─── Reportes: una cadena lineal por indicador y corte ──────────────────────

-- Un único reporte original por indicador y corte; cada corrección apunta a la anterior y solo una.
create unique index pdm_reportes_un_original on public.pdm_reportes (indicador_id, corte_id) where corrige_a is null;
create unique index pdm_reportes_una_correccion on public.pdm_reportes (corrige_a) where corrige_a is not null;

-- ─── Tablas nuevas ──────────────────────────────────────────────────────────

create table public.pdm_evidencias (
  id          uuid primary key default gen_random_uuid(),
  reporte_id  uuid not null references public.pdm_reportes(id) on delete restrict,
  -- Ruta del objeto en el bucket `pdm-evidencias`: {plan}/{indicador}/{corte}/{uuid}.{ext}
  ruta        text not null unique check (btrim(ruta) <> '' and char_length(ruta) <= 300),
  nombre      text not null check (btrim(nombre) <> '' and char_length(nombre) <= 200),
  tipo        text not null,
  bytes       bigint not null check (bytes > 0 and bytes <= 10485760),
  subido_por  uuid references public.usuarios(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index pdm_evidencias_reporte_idx on public.pdm_evidencias (reporte_id);
create index pdm_evidencias_subido_idx on public.pdm_evidencias (subido_por);

create table public.pdm_validaciones (
  id                uuid primary key default gen_random_uuid(),
  reporte_id        uuid not null references public.pdm_reportes(id) on delete restrict,
  estado            text not null check (estado in ('aprobado', 'devuelto')),
  comentario        text check (comentario is null or (btrim(comentario) <> '' and char_length(comentario) <= 1000)),
  validador_id      uuid references public.usuarios(id) on delete set null,
  validador_nombre  text not null check (btrim(validador_nombre) <> ''),
  created_at        timestamptz not null default now(),
  -- Devolver sin decir qué falta no sirve de nada.
  check (estado = 'aprobado' or comentario is not null)
);
create index pdm_validaciones_reporte_idx on public.pdm_validaciones (reporte_id, created_at desc);
create index pdm_validaciones_validador_idx on public.pdm_validaciones (validador_id);

create table public.pdm_comentarios (
  id            uuid primary key default gen_random_uuid(),
  indicador_id  uuid not null references public.pdm_indicadores(id) on delete restrict,
  reporte_id    uuid,
  texto         text not null check (btrim(texto) <> '' and char_length(texto) <= 2000),
  autor_id      uuid references public.usuarios(id) on delete set null,
  autor_nombre  text not null check (btrim(autor_nombre) <> ''),
  autor_nivel   text not null check (autor_nivel in ('admin', 'coordinador', 'consulta', 'responsable')),
  created_at    timestamptz not null default now(),
  -- Un comentario sobre un reporte es sobre un reporte DE ESE indicador.
  foreign key (reporte_id, indicador_id) references public.pdm_reportes (id, indicador_id) on delete restrict
);
create index pdm_comentarios_indicador_idx on public.pdm_comentarios (indicador_id, created_at desc);
create index pdm_comentarios_reporte_idx on public.pdm_comentarios (reporte_id, indicador_id);
create index pdm_comentarios_autor_idx on public.pdm_comentarios (autor_id);

comment on table public.pdm_evidencias is 'Archivos que respaldan un reporte (bucket privado pdm-evidencias). Solo inserción.';
comment on table public.pdm_validaciones is 'Aprobaciones y devoluciones de los reportes por la secretaría. Solo inserción: la última manda.';
comment on table public.pdm_comentarios is 'Comentarios sobre un indicador o uno de sus reportes (p. ej. de Control Interno). Solo inserción.';

-- ─── Vistas: lo vigente y lo validado (con los permisos de quien pregunta) ──

-- El último reporte de cada cadena (indicador, corte), con su estado de validación y cuántas evidencias tiene.
create view public.pdm_reportes_vigentes with (security_invoker = true) as
select r.id as reporte_id, r.indicador_id, r.corte_id, r.valor, r.valor_anterior, r.texto,
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
where not exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id);

-- Lo que CUENTA: el reporte aprobado más reciente de cada indicador (el del corte con fecha más tardía).
create view public.pdm_avance_validado with (security_invoker = true) as
select distinct on (x.indicador_id)
       x.indicador_id, x.valor, x.corte_id, c.fecha_corte, c.nombre as corte_nombre, x.validado_en
from public.pdm_reportes_vigentes x
join public.pdm_cortes c on c.id = x.corte_id
where x.estado = 'aprobado'
order by x.indicador_id, c.fecha_corte desc, x.created_at desc;

-- La meta acumulada de cada año: la suma de las metas desde el primer año hasta ése.
create view public.pdm_metas_acumuladas with (security_invoker = true) as
select m.indicador_id, m.anio, sum(m.meta) over (partition by m.indicador_id order by m.anio) as meta_acumulada
from public.pdm_metas m;

revoke all on public.pdm_reportes_vigentes, public.pdm_avance_validado, public.pdm_metas_acumuladas from public, anon, authenticated;
grant select on public.pdm_reportes_vigentes, public.pdm_avance_validado, public.pdm_metas_acumuladas to authenticated;

-- ─── Permisos de tabla y políticas ──────────────────────────────────────────

alter table public.pdm_evidencias    enable row level security;
alter table public.pdm_validaciones  enable row level security;
alter table public.pdm_comentarios   enable row level security;

revoke all on public.pdm_evidencias, public.pdm_validaciones, public.pdm_comentarios from public, anon, authenticated;
grant select, insert on public.pdm_evidencias, public.pdm_validaciones, public.pdm_comentarios to authenticated;

-- Evidencias: se ven si se ve el reporte; las agrega quien escribió el reporte, mientras nadie lo ha validado.
create policy pdm_evidencias_select on public.pdm_evidencias for select to authenticated
  using (exists (select 1 from public.pdm_reportes r where r.id = pdm_evidencias.reporte_id));
create policy pdm_evidencias_insert on public.pdm_evidencias for insert to authenticated
  with check (
    subido_por = (select auth.uid())
    and exists (
      select 1 from public.pdm_reportes r
      where r.id = pdm_evidencias.reporte_id and r.autor_id = (select auth.uid())
        and not exists (select 1 from public.pdm_validaciones v where v.reporte_id = r.id)
    )
  );

-- Validaciones: se ven si se ve el reporte; las escribe el administrador o la secretaría de la dependencia
-- del indicador, y NUNCA sobre un reporte propio.
create policy pdm_validaciones_select on public.pdm_validaciones for select to authenticated
  using (exists (select 1 from public.pdm_reportes r where r.id = pdm_validaciones.reporte_id));
create policy pdm_validaciones_insert on public.pdm_validaciones for insert to authenticated
  with check (
    validador_id = (select auth.uid())
    and exists (
      select 1 from public.pdm_reportes r
      where r.id = pdm_validaciones.reporte_id
        and r.autor_id is distinct from (select auth.uid())
        and (
          (select public.get_user_rol()) = 'admin'
          or ((select pdm_privado.mi_nivel()) = 'coordinador'
              and pdm_privado.dependencia_del_indicador(r.indicador_id) = (select pdm_privado.mi_dependencia()))
        )
    )
  );

-- Comentarios: los ve quien ve el indicador; los escribe quien tiene acceso al módulo y ve el indicador.
create policy pdm_comentarios_select on public.pdm_comentarios for select to authenticated
  using (exists (select 1 from public.pdm_indicadores i where i.id = pdm_comentarios.indicador_id));
create policy pdm_comentarios_insert on public.pdm_comentarios for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and ((select public.get_user_rol()) = 'admin' or (select pdm_privado.mi_nivel()) is not null)
    and exists (select 1 from public.pdm_indicadores i where i.id = pdm_comentarios.indicador_id)
  );

-- Reportes: además de las correcciones del administrador (050), reporta quien tiene el indicador asignado Y
-- tiene acceso al módulo, en el corte abierto, y siempre a su nombre.
drop policy pdm_reportes_insert on public.pdm_reportes;
create policy pdm_reportes_insert on public.pdm_reportes for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and (
      ((select public.get_user_rol()) = 'admin' and corrige_a is not null)
      or (
        (select pdm_privado.mi_nivel()) is not null
        and pdm_privado.es_responsable(indicador_id)
        and exists (select 1 from public.pdm_cortes c where c.id = pdm_reportes.corte_id and c.estado = 'abierto')
      )
    )
  );

-- ─── Disparadores que protegen los datos aunque alguien se salte las funciones ──

-- Antes de insertar un reporte: el nombre del autor es SIEMPRE el real, la corrección es del mismo corte y de lo
-- último que se reportó, y lo ya aprobado no se corrige sin que antes lo devuelvan (salvo el administrador).
create function pdm_privado.preparar_reporte() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_prev public.pdm_reportes%rowtype;
  v_estado text;
begin
  NEW.autor_nombre := coalesce(pdm_privado.nombre_de(NEW.autor_id), NEW.autor_nombre);

  if NEW.corrige_a is not null then
    select * into v_prev from public.pdm_reportes where id = NEW.corrige_a;
    if v_prev.id is null or v_prev.corte_id <> NEW.corte_id then
      raise exception 'PDM: una corrección es de un reporte del mismo corte' using errcode = '23514';
    end if;
    NEW.valor_anterior := v_prev.valor;
    select estado into v_estado from public.pdm_validaciones where reporte_id = v_prev.id order by created_at desc, id desc limit 1;
    if v_estado = 'aprobado' and (select public.get_user_rol()) is distinct from 'admin' then
      raise exception 'PDM: este reporte ya fue aprobado; la secretaría tiene que devolverlo antes de corregirlo' using errcode = '23514';
    end if;
  else
    -- Lo último que se reportó en un corte anterior, para leer el avance como «antes → ahora».
    select r.valor into NEW.valor_anterior
    from public.pdm_reportes r join public.pdm_cortes c on c.id = r.corte_id
    where r.indicador_id = NEW.indicador_id
      and c.fecha_corte < (select fecha_corte from public.pdm_cortes where id = NEW.corte_id)
      and not exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id)
    order by c.fecha_corte desc limit 1;
  end if;
  return NEW;
end $$;

create trigger pdm_reportes_preparar before insert on public.pdm_reportes
  for each row execute function pdm_privado.preparar_reporte();

-- Un reporte sin evidencia no llega a existir: se comprueba al cerrar la transacción (diferido), porque la
-- evidencia se inserta DESPUÉS del reporte, en la misma operación. Un insert directo, que no puede traer las
-- dos cosas a la vez, queda rechazado. La única excepción es la corrección del administrador, que lleva motivo y
-- queda en la bitácora.
create function pdm_privado.exigir_evidencia() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if NEW.corrige_a is not null and (select public.get_user_rol()) = 'admin' then return null; end if;
  if not exists (select 1 from public.pdm_evidencias where reporte_id = NEW.id) then
    raise exception 'PDM: un reporte necesita al menos una evidencia' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger pdm_reportes_exige_evidencia after insert on public.pdm_reportes
  deferrable initially deferred for each row execute function pdm_privado.exigir_evidencia();

-- Antes de insertar una validación: el nombre es el real, y solo se valida el último reporte de la cadena.
create function pdm_privado.preparar_validacion() returns trigger
language plpgsql set search_path = ''
as $$
begin
  NEW.validador_nombre := coalesce(pdm_privado.nombre_de(NEW.validador_id), NEW.validador_nombre);
  if exists (select 1 from public.pdm_reportes where corrige_a = NEW.reporte_id) then
    raise exception 'PDM: este reporte ya fue corregido; valida la versión más reciente' using errcode = '23514';
  end if;
  return NEW;
end $$;

create trigger pdm_validaciones_preparar before insert on public.pdm_validaciones
  for each row execute function pdm_privado.preparar_validacion();

-- Antes de insertar un comentario: nombre y nivel REALES de quien comenta.
create function pdm_privado.preparar_comentario() returns trigger
language plpgsql set search_path = ''
as $$
begin
  NEW.autor_nombre := coalesce(pdm_privado.nombre_de(NEW.autor_id), NEW.autor_nombre);
  NEW.autor_nivel := case when (select public.get_user_rol()) = 'admin' then 'admin' else coalesce((select pdm_privado.mi_nivel()), NEW.autor_nivel) end;
  return NEW;
end $$;

create trigger pdm_comentarios_preparar before insert on public.pdm_comentarios
  for each row execute function pdm_privado.preparar_comentario();

-- ─── La bitácora automática, ahora también para cortes y ajustes del plan ───

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

    elsif TG_TABLE_NAME = 'pdm_cortes' then
      v_entidad := 'corte';
      v_entidad_id := (v_base->>'id')::uuid;
      v_plan := (v_base->>'plan_id')::uuid;
      v_accion := case TG_OP when 'INSERT' then 'corte_creado' when 'UPDATE' then 'corte_editado' else 'corte_eliminado' end;
      v_detalle := jsonb_build_object('antes', v_old, 'despues', v_new);

    elsif TG_TABLE_NAME = 'pdm_planes' then
      v_entidad := 'plan';
      v_entidad_id := (v_base->>'id')::uuid;
      v_plan := v_entidad_id;
      v_accion := 'plan_configurado';
      v_detalle := jsonb_build_object(
        'avance_modo_antes',   v_old->'avance_modo',  'avance_modo_despues',   v_new->'avance_modo',
        'periodicidad_antes',  v_old->'periodicidad', 'periodicidad_despues',  v_new->'periodicidad');

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

create trigger pdm_cortes_auditar after insert or update or delete on public.pdm_cortes
  for each row execute function pdm_privado.auditar();
-- Solo cuando cambian los AJUSTES del plan (no cuando solo se toca `updated_at`).
create trigger pdm_planes_auditar after update on public.pdm_planes
  for each row when (old.avance_modo is distinct from new.avance_modo or old.periodicidad is distinct from new.periodicidad)
  execute function pdm_privado.auditar();

-- ─── Las funciones del administrador: ajustes y cortes ──────────────────────

create function public.pdm_plan_configurar(
  p_avance_modo  text,
  p_periodicidad text default null,
  p_motivo       text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_lote uuid;
  v_plan uuid;
  v_per text := nullif(btrim(coalesce(p_periodicidad, '')), '');
begin
  v_lote := pdm_privado.abrir_operacion('configurar_plan', p_motivo);
  if (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador cambia los ajustes del plan' using errcode = '42501';
  end if;
  if p_avance_modo is not null and p_avance_modo not in ('acumulado', 'anual') then
    raise exception 'PDM: el criterio de avance debe ser acumulado, anual o quedar por definir' using errcode = '22023';
  end if;
  if v_per is not null and char_length(v_per) > 120 then
    raise exception 'PDM: la periodicidad no puede pasar de 120 caracteres' using errcode = '22001';
  end if;
  if (select count(*) from public.pdm_planes where activo) <> 1 then
    raise exception 'PDM: no hay un único plan activo' using errcode = '55000';
  end if;
  select id into v_plan from public.pdm_planes where activo;

  update public.pdm_planes set avance_modo = p_avance_modo, periodicidad = v_per where id = v_plan;
  return jsonb_build_object('lote', v_lote, 'avance_modo', p_avance_modo, 'periodicidad', v_per);
end $$;

create function public.pdm_corte_guardar(
  p_corte  uuid,
  p_nombre text,
  p_fecha  date,
  p_abrir  boolean default false,
  p_motivo text default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_plan uuid;
  v_corte uuid := p_corte;
  v_abierto text;
begin
  perform pdm_privado.abrir_operacion(case when p_corte is null then 'corte_crear' else 'corte_editar' end, p_motivo);
  if (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador crea o edita cortes' using errcode = '42501';
  end if;
  if v_nombre = '' then raise exception 'PDM: el corte necesita un nombre' using errcode = '22023'; end if;
  if char_length(v_nombre) > 80 then raise exception 'PDM: el nombre del corte no puede pasar de 80 caracteres' using errcode = '22001'; end if;
  if p_fecha is null then raise exception 'PDM: el corte necesita una fecha' using errcode = '22023'; end if;
  if (select count(*) from public.pdm_planes where activo) <> 1 then
    raise exception 'PDM: no hay un único plan activo' using errcode = '55000';
  end if;
  select id into v_plan from public.pdm_planes where activo;

  if coalesce(p_abrir, false) then
    select nombre into v_abierto from public.pdm_cortes where plan_id = v_plan and estado = 'abierto' and id is distinct from p_corte;
    if v_abierto is not null then
      raise exception 'PDM: ya hay un corte abierto («%»); ciérralo antes de abrir otro', v_abierto using errcode = '23514';
    end if;
  end if;

  if v_corte is null then
    insert into public.pdm_cortes (plan_id, nombre, fecha_corte, estado)
    values (v_plan, v_nombre, p_fecha, case when coalesce(p_abrir, false) then 'abierto' else 'cerrado' end)
    returning id into v_corte;
  else
    update public.pdm_cortes
      set nombre = v_nombre, fecha_corte = p_fecha,
          estado = case when coalesce(p_abrir, false) then 'abierto' else estado end
      where id = v_corte and plan_id = v_plan
        and (nombre is distinct from v_nombre or fecha_corte is distinct from p_fecha or (coalesce(p_abrir, false) and estado <> 'abierto'));
    if not exists (select 1 from public.pdm_cortes where id = v_corte) then
      raise exception 'PDM: el corte no existe' using errcode = '42501';
    end if;
  end if;
  return v_corte;
end $$;

create function public.pdm_corte_estado(
  p_corte  uuid,
  p_estado text,
  p_motivo text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_lote uuid;
  v_plan uuid;
  v_actual text;
  v_otro text;
begin
  v_lote := pdm_privado.abrir_operacion('corte_estado', p_motivo);
  if (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador abre o cierra cortes' using errcode = '42501';
  end if;
  if p_estado not in ('abierto', 'cerrado') then raise exception 'PDM: el estado debe ser abierto o cerrado' using errcode = '22023'; end if;
  select plan_id, estado into v_plan, v_actual from public.pdm_cortes where id = p_corte;
  if v_plan is null then raise exception 'PDM: el corte no existe' using errcode = '42501'; end if;
  if v_actual = p_estado then return jsonb_build_object('lote', v_lote, 'cambio', 'ninguno'); end if;
  if p_estado = 'abierto' then
    select nombre into v_otro from public.pdm_cortes where plan_id = v_plan and estado = 'abierto' and id <> p_corte;
    if v_otro is not null then
      raise exception 'PDM: ya hay un corte abierto («%»); ciérralo antes de abrir otro', v_otro using errcode = '23514';
    end if;
  end if;
  update public.pdm_cortes set estado = p_estado where id = p_corte;
  return jsonb_build_object('lote', v_lote, 'cambio', p_estado);
end $$;

create function public.pdm_corte_eliminar(
  p_corte  uuid,
  p_motivo text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_lote uuid;
begin
  v_lote := pdm_privado.abrir_operacion('corte_eliminar', p_motivo);
  if (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador elimina cortes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pdm_cortes where id = p_corte) then
    raise exception 'PDM: el corte no existe' using errcode = '42501';
  end if;
  if exists (select 1 from public.pdm_reportes where corte_id = p_corte) then
    raise exception 'PDM: el corte ya tiene reportes; no se puede eliminar (ciérralo)' using errcode = '23514';
  end if;
  delete from public.pdm_cortes where id = p_corte;
  return jsonb_build_object('lote', v_lote, 'cambio', 'eliminado');
end $$;

-- ─── Reportar, validar y comentar ───────────────────────────────────────────

-- Reporta (o corrige) el avance de un indicador en el corte abierto, con sus evidencias, de una pieza.
--   p_evidencias: lista de {ruta, nombre, tipo, bytes}; entre 1 y 5; las rutas deben ser de ESTE indicador y ESTE corte.
--   p_motivo: solo si ya hay un reporte en el corte (entonces esto es una corrección y el motivo es obligatorio).
create function public.pdm_reportar(
  p_indicador  uuid,
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
  v_corte uuid;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_previo uuid;
  v_id uuid;
  v_prefijo text;
  e jsonb;
begin
  perform pdm_privado.abrir_operacion('reportar', null);
  select plan_id into v_plan from public.pdm_indicadores where id = p_indicador and activo;
  if v_plan is null then raise exception 'PDM: el indicador no existe o no tienes acceso a él' using errcode = '42501'; end if;
  -- Quién puede reportar se dice ANTES de validar nada: sin esto, quien no puede recibe el error de
  -- «falta el motivo» o «no hay corte» en vez del de permisos. La política de la tabla sigue siendo la barrera real.
  if (select pdm_privado.mi_nivel()) is null or not pdm_privado.es_responsable(p_indicador) then
    raise exception 'PDM: este indicador no está a tu cargo' using errcode = '42501';
  end if;
  select id into v_corte from public.pdm_cortes where plan_id = v_plan and estado = 'abierto';
  if v_corte is null then raise exception 'PDM: no hay un corte abierto para reportar' using errcode = '23514'; end if;

  if p_valor is null or p_valor < 0 then raise exception 'PDM: el valor debe ser un número igual o mayor que cero' using errcode = '22023'; end if;
  if char_length(v_texto) < 10 then raise exception 'PDM: cuenta qué se hizo (al menos 10 caracteres)' using errcode = '22023'; end if;
  if char_length(v_texto) > 1000 then raise exception 'PDM: la descripción no puede pasar de 1.000 caracteres' using errcode = '22001'; end if;
  if jsonb_typeof(p_evidencias) is distinct from 'array' or jsonb_array_length(p_evidencias) = 0 then
    raise exception 'PDM: un reporte necesita al menos una evidencia' using errcode = '23514';
  end if;
  if jsonb_array_length(p_evidencias) > 5 then raise exception 'PDM: un reporte admite como máximo 5 evidencias' using errcode = '22023'; end if;

  v_prefijo := v_plan::text || '/' || p_indicador::text || '/' || v_corte::text || '/';
  for e in select value from jsonb_array_elements(p_evidencias) loop
    if jsonb_typeof(e) is distinct from 'object'
       or coalesce(e->>'ruta', '') = '' or left(e->>'ruta', char_length(v_prefijo)) <> v_prefijo
       or (e->>'ruta') like '%..%' or char_length(e->>'ruta') > 300 then
      raise exception 'PDM: una evidencia no corresponde a este indicador y este corte' using errcode = '22023';
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
      raise exception 'PDM: cada evidencia puede pesar hasta 10 MB' using errcode = '22023';
    end if;
  end loop;

  -- El último reporte de este indicador en este corte, si lo hay: esto sería una corrección.
  select r.id into v_previo from public.pdm_reportes r
   where r.indicador_id = p_indicador and r.corte_id = v_corte
     and not exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id);

  if v_previo is null then
    insert into public.pdm_reportes (indicador_id, corte_id, valor, texto, autor_id, autor_nombre)
    values (p_indicador, v_corte, p_valor, v_texto, v_yo, pdm_privado.nombre_de(v_yo))
    returning id into v_id;
  else
    if v_motivo is null or char_length(v_motivo) < 10 then
      raise exception 'PDM: di qué corriges (al menos 10 caracteres)' using errcode = '22023';
    end if;
    if char_length(v_motivo) > 500 then raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001'; end if;
    insert into public.pdm_reportes (indicador_id, corte_id, valor, texto, autor_id, autor_nombre, corrige_a, motivo_correccion)
    values (p_indicador, v_corte, p_valor, v_texto, v_yo, pdm_privado.nombre_de(v_yo), v_previo, v_motivo)
    returning id into v_id;
  end if;

  insert into public.pdm_evidencias (reporte_id, ruta, nombre, tipo, bytes, subido_por)
  select v_id, x->>'ruta', btrim(x->>'nombre'), x->>'tipo', (x->>'bytes')::bigint, v_yo
  from jsonb_array_elements(p_evidencias) x;

  return jsonb_build_object('reporte', v_id, 'correccion', v_previo is not null, 'corte', v_corte);
end $$;

create function public.pdm_validar(
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

  select estado into v_ultimo from public.pdm_validaciones where reporte_id = p_reporte order by created_at desc, id desc limit 1;
  if v_ultimo = p_estado and (p_estado = 'aprobado' or v_c is null) then
    return jsonb_build_object('lote', v_lote, 'cambio', 'ninguno', 'estado', p_estado);
  end if;

  insert into public.pdm_validaciones (reporte_id, estado, comentario, validador_id, validador_nombre)
  values (p_reporte, p_estado, v_c, v_yo, pdm_privado.nombre_de(v_yo));
  return jsonb_build_object('lote', v_lote, 'cambio', p_estado, 'estado', p_estado);
end $$;

create function public.pdm_comentar(
  p_indicador uuid,
  p_texto     text,
  p_reporte   uuid default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_texto text := btrim(coalesce(p_texto, ''));
  v_id uuid;
begin
  if v_yo is null then raise exception 'PDM: se requiere una sesión' using errcode = '28000'; end if;
  if v_texto = '' then raise exception 'PDM: escribe el comentario' using errcode = '22023'; end if;
  if char_length(v_texto) > 2000 then raise exception 'PDM: el comentario no puede pasar de 2.000 caracteres' using errcode = '22001'; end if;
  if not exists (select 1 from public.pdm_indicadores where id = p_indicador and activo) then
    raise exception 'PDM: el indicador no existe o no tienes acceso a él' using errcode = '42501';
  end if;
  insert into public.pdm_comentarios (indicador_id, reporte_id, texto, autor_id, autor_nombre, autor_nivel)
  values (p_indicador, p_reporte, v_texto, v_yo, pdm_privado.nombre_de(v_yo), 'responsable')
  returning id into v_id;
  return v_id;
end $$;

revoke all on function
  public.pdm_plan_configurar(text, text, text),
  public.pdm_corte_guardar(uuid, text, date, boolean, text),
  public.pdm_corte_estado(uuid, text, text),
  public.pdm_corte_eliminar(uuid, text),
  public.pdm_reportar(uuid, numeric, text, jsonb, text),
  public.pdm_validar(uuid, text, text),
  public.pdm_comentar(uuid, text, uuid)
from public, anon;
grant execute on function
  public.pdm_plan_configurar(text, text, text),
  public.pdm_corte_guardar(uuid, text, date, boolean, text),
  public.pdm_corte_estado(uuid, text, text),
  public.pdm_corte_eliminar(uuid, text),
  public.pdm_reportar(uuid, numeric, text, jsonb, text),
  public.pdm_validar(uuid, text, text),
  public.pdm_comentar(uuid, text, uuid)
to authenticated;

-- Los disparadores se ejecutan sin que nadie tenga EXECUTE sobre sus funciones.
revoke all on function
  pdm_privado.preparar_reporte(), pdm_privado.exigir_evidencia(), pdm_privado.preparar_validacion(), pdm_privado.preparar_comentario()
from public;

-- ─── El espacio de archivos: privado, sin políticas (todo acceso pasa por el servidor) ──

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pdm-evidencias', 'pdm-evidencias', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
  v_publicas constant text[] := array[
    'pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar', 'pdm_habilitar', 'pdm_deshabilitar',
    'pdm_plan_configurar', 'pdm_corte_guardar', 'pdm_corte_estado', 'pdm_corte_eliminar', 'pdm_reportar', 'pdm_validar', 'pdm_comentar'];
begin
  -- 1. RLS en las tablas nuevas; `anon` sin nada; `authenticated` sin UPDATE, DELETE, TRUNCATE, REFERENCES ni TRIGGER
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relname in ('pdm_evidencias', 'pdm_validaciones', 'pdm_comentarios') and not c.relrowsecurity;
  if v_malas is not null then raise exception 'PDM 056: sin RLS: %', v_malas; end if;

  select string_agg(c.relname || ':' || p, ', ') into v_malas
  from pg_class c, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_evidencias', 'pdm_validaciones', 'pdm_comentarios')
    and (has_table_privilege('anon', c.oid, p)
         or (p in ('UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER') and has_table_privilege('authenticated', c.oid, p)));
  if v_malas is not null then raise exception 'PDM 056: permisos de sobra: %', v_malas; end if;

  -- 2. Dos políticas por tabla nueva (select e insert), solo para `authenticated`; y una sola de insert en reportes
  select string_agg(tablename || ':' || n::text, ', ') into v_malas
  from (select tablename, count(*) n from pg_policies
        where schemaname = 'public' and tablename in ('pdm_evidencias', 'pdm_validaciones', 'pdm_comentarios') group by tablename) x
  where n <> 2;
  if v_malas is not null then raise exception 'PDM 056: número de políticas inesperado: %', v_malas; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pdm_reportes' and cmd = 'INSERT') <> 1 then
    raise exception 'PDM 056: pdm_reportes debe tener exactamente una política de insert';
  end if;
  select string_agg(tablename || '.' || policyname, ', ') into v_malas
  from pg_policies where schemaname = 'public' and tablename like 'pdm\_%' and roles <> '{authenticated}';
  if v_malas is not null then raise exception 'PDM 056: políticas fuera de authenticated: %', v_malas; end if;

  -- 3. Nunca NO ACTION ni RESTRICT hacia `usuarios`; toda clave foránea cubierta entera por un índice
  select string_agg(conrelid::regclass::text || '.' || conname, ', ') into v_malas
  from pg_constraint
  where contype = 'f' and confrelid = 'public.usuarios'::regclass
    and conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and confdeltype not in ('c', 'n');
  if v_malas is not null then raise exception 'PDM 056: bloquearía el borrado de usuarios: %', v_malas; end if;
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v_malas
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and array_to_string((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1], ',') = array_to_string(c.conkey, ','));
  if v_malas is not null then raise exception 'PDM 056: clave foránea sin índice que la cubra entera: %', v_malas; end if;

  -- 4. Las catorce funciones públicas: SECURITY INVOKER, search_path fijo, sin `anon` ni PUBLIC, con `authenticated`
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(v_publicas)
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 056: función mal protegida: %', v_malas; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(v_publicas)) <> 14 then
    raise exception 'PDM 056: no quedan exactamente catorce funciones públicas';
  end if;

  -- 5. Las ayudas de `pdm_privado` no son invocables por PUBLIC ni por anon
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pdm_privado'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 056: ayuda invocable de más: %', v_malas; end if;

  -- 6. Los disparadores están enchufados y activos (incluido el de la evidencia obligatoria, que es diferido)
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_asignaciones', 'pdm_asignaciones_auditar'), ('pdm_grupos', 'pdm_grupos_auditar'),
               ('pdm_grupo_miembros', 'pdm_grupo_miembros_auditar'), ('pdm_permisos', 'pdm_permisos_auditar'),
               ('pdm_cortes', 'pdm_cortes_auditar'), ('pdm_planes', 'pdm_planes_auditar'),
               ('pdm_reportes', 'pdm_reportes_preparar'), ('pdm_reportes', 'pdm_reportes_exige_evidencia'),
               ('pdm_validaciones', 'pdm_validaciones_preparar'), ('pdm_comentarios', 'pdm_comentarios_preparar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 056: disparador sin enchufar: %', v_malas; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'pdm_reportes_exige_evidencia' and g.tgdeferrable and g.tginitdeferred) then
    raise exception 'PDM 056: la evidencia obligatoria debe ser un disparador diferido';
  end if;

  -- 7. Las vistas corren con los permisos de quien pregunta (no con los del dueño)
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_reportes_vigentes', 'pdm_avance_validado', 'pdm_metas_acumuladas')
    and not coalesce('security_invoker=true' = any(c.reloptions), false);
  if v_malas is not null then raise exception 'PDM 056: vista que no respeta los permisos de quien pregunta: %', v_malas; end if;
  select string_agg(c.relname || ':' || p, ', ') into v_malas
  from pg_class c, unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
  where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_reportes_vigentes', 'pdm_avance_validado', 'pdm_metas_acumuladas')
    and (has_table_privilege('anon', c.oid, p) or (p <> 'SELECT' and has_table_privilege('authenticated', c.oid, p)));
  if v_malas is not null then raise exception 'PDM 056: permisos de sobra en vistas: %', v_malas; end if;

  -- 7b. Las reglas de unicidad que sostienen el modelo están y son válidas
  select string_agg(x.i, ', ') into v_malas
  from (values ('pdm_cortes_uno_abierto'), ('pdm_cortes_nombre_unico'), ('pdm_reportes_un_original'), ('pdm_reportes_una_correccion')) x(i)
  where not exists (
    select 1 from pg_class c join pg_index i on i.indexrelid = c.oid
    where c.relnamespace = 'public'::regnamespace and c.relname = x.i and i.indisvalid and i.indisunique);
  if v_malas is not null then raise exception 'PDM 056: falta un índice único: %', v_malas; end if;

  -- 8. El espacio de archivos existe y es privado
  if not exists (select 1 from storage.buckets where id = 'pdm-evidencias' and not public and file_size_limit = 10485760) then
    raise exception 'PDM 056: el espacio pdm-evidencias no existe o no es privado';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Antes: confirmar que no hay datos que perder (`select count(*) from public.pdm_reportes;` etc.), porque
-- borrar las tablas borra los reportes, validaciones y comentarios. Y vaciar el bucket desde el panel.
--
--   begin;
--   drop view public.pdm_reportes_vigentes, public.pdm_avance_validado, public.pdm_metas_acumuladas;
--   drop function public.pdm_plan_configurar(text, text, text), public.pdm_corte_guardar(uuid, text, date, boolean, text),
--                 public.pdm_corte_estado(uuid, text, text), public.pdm_corte_eliminar(uuid, text),
--                 public.pdm_reportar(uuid, numeric, text, jsonb, text), public.pdm_validar(uuid, text, text),
--                 public.pdm_comentar(uuid, text, uuid);
--   drop table public.pdm_comentarios, public.pdm_validaciones, public.pdm_evidencias;
--   drop trigger pdm_reportes_exige_evidencia on public.pdm_reportes;
--   drop trigger pdm_reportes_preparar on public.pdm_reportes;
--   drop function pdm_privado.preparar_reporte(), pdm_privado.exigir_evidencia(), pdm_privado.preparar_validacion(), pdm_privado.preparar_comentario();
--   drop trigger pdm_cortes_auditar on public.pdm_cortes;  drop trigger pdm_planes_auditar on public.pdm_planes;
--   drop index public.pdm_reportes_un_original, public.pdm_reportes_una_correccion, public.pdm_cortes_uno_abierto, public.pdm_cortes_nombre_unico;
--   alter table public.pdm_planes drop column avance_modo, drop column periodicidad;
--   -- recrear la política pdm_reportes_insert de la 050 y pdm_privado.auditar() de la 055
--   delete from storage.buckets where id = 'pdm-evidencias';
--   commit;
