-- Migration 052: módulo Plan de Desarrollo — grupos y asignación, con historia completa
--
-- QUÉ AÑADE. Lo necesario para que el administrador reparta los indicadores:
--
--   1. GRUPOS de personas (`pdm_grupos`, `pdm_grupo_miembros`): un nombre, una
--      secretaría, un LÍDER obligatorio y sus miembros.
--   2. `pdm_asignaciones.grupo_id`: marca de qué grupo vino una asignación.
--   3. CINCO FUNCIONES que cambian asignaciones y grupos, cada una de una pieza
--      (o se aplica todo o no se aplica nada):
--        pdm_asignar          una persona como principal o como apoyo, en varios indicadores
--        pdm_quitar           quita a un apoyo
--        pdm_asignar_grupo    un grupo: el líder queda principal y los demás, de apoyo
--        pdm_grupo_guardar    crea o edita un grupo y su membresía (y la sincroniza)
--        pdm_grupo_eliminar   disuelve un grupo; sus asignaciones quedan como individuales
--   4. LA BITÁCORA AUTOMÁTICA: un disparador sobre `pdm_asignaciones`, `pdm_grupos`
--      y `pdm_grupo_miembros` que deja una fila en `pdm_historial` por CADA cambio.
--
-- POR QUÉ LA BITÁCORA ES UN DISPARADOR Y NO CÓDIGO DE LAS FUNCIONES. El usuario pidió
-- garantizar que todo reemplazo quede guardado. Si cada función escribiera su propia
-- bitácora, bastaría una función olvidada (o una escritura directa a la tabla) para
-- tener un cambio sin rastro. Con el disparador no hay manera de cambiar una
-- asignación sin que quede: quién (`auth.uid()`), cuándo, qué indicador, a quién,
-- y el valor ANTERIOR y el NUEVO. Las funciones solo añaden contexto (el lote y el
-- motivo) para que las filas de una misma operación se puedan agrupar.
--
-- LO QUE LAS FUNCIONES NO HACEN. No son SECURITY DEFINER: corren con los permisos de
-- quien las llama, así que mandan las políticas de la migración 050 (el
-- administrador todo; una secretaría solo lo de la suya). Una función SECURITY
-- DEFINER en `public` quedaría invocable por RPC con permisos elevados.
--
-- REGLAS QUE SE MANTIENEN. Un indicador con asignaciones tiene siempre UN principal:
--   · el principal nuevo reemplaza al anterior, que pasa a apoyo (o se quita, si se pide);
--   · no se quita al principal: se REEMPLAZA asignando a otra persona;
--   · un apoyo no se añade a un indicador sin principal.
--
-- LO QUE NO TOCA. Nada de Contratista Digital: ni tablas, ni columnas, ni políticas,
-- ni funciones. Todo lo nuevo lleva el prefijo `pdm_`. Un disparador nuevo vive
-- en una tabla del módulo; si CD borra a un usuario con asignaciones, el disparador
-- lo anota y NUNCA hace fallar ese borrado (si no pudiera anotar, avisa y sigue:
-- ver `pdm_privado.auditar`).
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta
-- si algo de lo prometido no queda cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── Tablas ─────────────────────────────────────────────────────────────────

create table public.pdm_grupos (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.pdm_planes(id) on delete restrict,
  dependencia_id     uuid not null references public.dependencias(id) on delete restrict,
  nombre             text not null check (btrim(nombre) <> '' and char_length(nombre) <= 120),
  creado_por         uuid references public.usuarios(id) on delete set null,
  creado_por_nombre  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- Dos grupos del mismo plan no pueden llamarse igual (sin importar mayúsculas ni espacios de los bordes).
create unique index pdm_grupos_nombre_uq on public.pdm_grupos (plan_id, lower(btrim(nombre)));
create index pdm_grupos_dependencia_idx on public.pdm_grupos (dependencia_id);
create index pdm_grupos_creador_idx on public.pdm_grupos (creado_por);

create table public.pdm_grupo_miembros (
  grupo_id      uuid not null references public.pdm_grupos(id) on delete cascade,
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  es_lider      boolean not null default false,
  agregado_por  uuid references public.usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (grupo_id, usuario_id)
);
-- A lo sumo un líder por grupo. (Que haya UNO lo exige la función que guarda el grupo.)
create unique index pdm_grupo_miembros_un_lider on public.pdm_grupo_miembros (grupo_id) where es_lider;
create index pdm_grupo_miembros_usuario_idx on public.pdm_grupo_miembros (usuario_id);
create index pdm_grupo_miembros_agregador_idx on public.pdm_grupo_miembros (agregado_por);

-- De qué grupo vino una asignación (null = individual). Si el grupo se borra, la asignación queda.
alter table public.pdm_asignaciones
  add column grupo_id uuid references public.pdm_grupos(id) on delete set null;
create index pdm_asignaciones_grupo_idx on public.pdm_asignaciones (grupo_id);

create trigger pdm_grupos_updated_at before update on public.pdm_grupos
  for each row execute function public.update_updated_at();

comment on table  public.pdm_grupos is 'Grupos de personas que responden juntas por indicadores. Tienen un líder obligatorio y pertenecen a una secretaría.';
comment on table  public.pdm_grupo_miembros is 'Miembros de un grupo. Exactamente uno es el líder (lo exige pdm_grupo_guardar).';
comment on column public.pdm_asignaciones.grupo_id is 'Grupo del que vino esta asignación; null si es individual. Quitar el grupo no quita la asignación.';

-- ─── Ayudas de las políticas (esquema NO expuesto por la API) ───────────────

create function pdm_privado.dependencia_del_grupo(p_grupo uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select dependencia_id from public.pdm_grupos where id = p_grupo $$;

create function pdm_privado.es_miembro(p_grupo uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.pdm_grupo_miembros
  where grupo_id = p_grupo and usuario_id = (select auth.uid())
) $$;

revoke all on function pdm_privado.dependencia_del_grupo(uuid), pdm_privado.es_miembro(uuid) from public;
grant execute on function pdm_privado.dependencia_del_grupo(uuid), pdm_privado.es_miembro(uuid) to authenticated;

-- ─── Permisos y políticas de las tablas nuevas ──────────────────────────────

alter table public.pdm_grupos         enable row level security;
alter table public.pdm_grupo_miembros enable row level security;

revoke all on public.pdm_grupos, public.pdm_grupo_miembros from public, anon, authenticated;
grant select, insert, update, delete on public.pdm_grupos, public.pdm_grupo_miembros to authenticated;

-- El administrador todo; una secretaría, los grupos de SU dependencia; Control Interno los mira;
-- y cada miembro ve su grupo (y a sus compañeros).
create policy pdm_grupos_select on public.pdm_grupos for select to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or (select pdm_privado.mi_nivel()) = 'consulta'
    or ((select pdm_privado.mi_nivel()) = 'coordinador' and dependencia_id = (select pdm_privado.mi_dependencia()))
    or pdm_privado.es_miembro(id)
  );
create policy pdm_grupos_insert on public.pdm_grupos for insert to authenticated
  with check (
    creado_por = (select auth.uid())
    and (
      (select public.get_user_rol()) = 'admin'
      or ((select pdm_privado.mi_nivel()) = 'coordinador' and dependencia_id = (select pdm_privado.mi_dependencia()))
    )
  );
create policy pdm_grupos_update on public.pdm_grupos for update to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador' and dependencia_id = (select pdm_privado.mi_dependencia()))
  )
  with check (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador' and dependencia_id = (select pdm_privado.mi_dependencia()))
  );
create policy pdm_grupos_delete on public.pdm_grupos for delete to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador' and dependencia_id = (select pdm_privado.mi_dependencia()))
  );

create policy pdm_grupo_miembros_select on public.pdm_grupo_miembros for select to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or (select pdm_privado.mi_nivel()) = 'consulta'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_del_grupo(grupo_id) = (select pdm_privado.mi_dependencia()))
    or pdm_privado.es_miembro(grupo_id)
  );
create policy pdm_grupo_miembros_insert on public.pdm_grupo_miembros for insert to authenticated
  with check (
    agregado_por = (select auth.uid())
    and (
      (select public.get_user_rol()) = 'admin'
      or ((select pdm_privado.mi_nivel()) = 'coordinador'
          and pdm_privado.dependencia_del_grupo(grupo_id) = (select pdm_privado.mi_dependencia()))
    )
  );
create policy pdm_grupo_miembros_update on public.pdm_grupo_miembros for update to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_del_grupo(grupo_id) = (select pdm_privado.mi_dependencia()))
  )
  with check (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_del_grupo(grupo_id) = (select pdm_privado.mi_dependencia()))
  );
create policy pdm_grupo_miembros_delete on public.pdm_grupo_miembros for delete to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or ((select pdm_privado.mi_nivel()) = 'coordinador'
        and pdm_privado.dependencia_del_grupo(grupo_id) = (select pdm_privado.mi_dependencia()))
  );

-- ─── La bitácora automática ─────────────────────────────────────────────────
--
-- SECURITY DEFINER a propósito y solo para esto: escribe en `pdm_historial` aunque quien
-- cambia no tenga permiso de escribir ahí (por ejemplo, una cascada al borrar un usuario),
-- pero el AUTOR siempre es `auth.uid()`: nadie puede anotar a nombre de otro. Vive en
-- `pdm_privado`, que la API no expone, y nadie tiene EXECUTE sobre ella: los disparadores
-- no lo necesitan para ejecutarse.
--
-- Cada fila de `pdm_historial` queda así:
--   entidad = 'indicador' (entidad_id = el indicador) para cambios de asignaciones,
--   entidad = 'grupo'     (entidad_id = el grupo)     para cambios del grupo y sus miembros.
--   detalle = quién / a quién / valor anterior y nuevo, y, si vino de una función, `lote`,
--             `operacion` y `motivo` (para agrupar las filas de una misma operación).
--
-- SI LA BITÁCORA FALLA: cuando hay una persona con sesión, el cambio entero se deshace
-- (jamás un cambio sin rastro). Cuando NO la hay (el sistema borrando a un usuario por
-- cascada, un script), se avisa con un WARNING y se sigue: el módulo nunca debe impedir
-- que Contratista Digital haga lo suyo.

create function pdm_privado.auditar() returns trigger
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
        -- Al borrar el grupo se anota también quiénes lo formaban (el disparador es BEFORE: aún existen).
        v_detalle := v_detalle || jsonb_build_object('miembros', (
          select coalesce(jsonb_agg(jsonb_build_object('usuario_id', m.usuario_id, 'usuario_nombre', u.nombre_completo, 'es_lider', m.es_lider) order by m.es_lider desc, u.nombre_completo), '[]'::jsonb)
          from public.pdm_grupo_miembros m left join public.usuarios u on u.id = m.usuario_id
          where m.grupo_id = (v_old->>'id')::uuid));
      end if;

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

    -- Sin plan no hay dónde anotar (p. ej. el grupo ya se borró por cascada): se deja pasar.
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

revoke all on function pdm_privado.auditar() from public;

create trigger pdm_asignaciones_auditar after insert or update or delete on public.pdm_asignaciones
  for each row execute function pdm_privado.auditar();
create trigger pdm_grupos_auditar after insert or update on public.pdm_grupos
  for each row execute function pdm_privado.auditar();
create trigger pdm_grupos_auditar_borrado before delete on public.pdm_grupos
  for each row execute function pdm_privado.auditar();
create trigger pdm_grupo_miembros_auditar after insert or update or delete on public.pdm_grupo_miembros
  for each row execute function pdm_privado.auditar();

-- ─── Ayudas de las funciones (corren como quien llama; mandan las políticas) ─

-- Abre el contexto de una operación: el disparador lo lee para anotar `lote`, `operacion` y `motivo`.
-- `set_config(..., true)` vale solo dentro de la transacción en curso.
create function pdm_privado.abrir_operacion(p_operacion text, p_motivo text) returns uuid
language plpgsql set search_path = ''
as $$
declare v_lote uuid := gen_random_uuid(); v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if (select auth.uid()) is null then raise exception 'PDM: se requiere una sesión' using errcode = '28000'; end if;
  if v_motivo is not null and char_length(v_motivo) > 500 then
    raise exception 'PDM: el motivo no puede pasar de 500 caracteres' using errcode = '22001';
  end if;
  perform set_config('pdm.lote', v_lote::text, true);
  perform set_config('pdm.operacion', p_operacion, true);
  perform set_config('pdm.motivo', coalesce(v_motivo, ''), true);
  return v_lote;
end $$;

-- Valida una lista de indicadores: no vacía, sin repetidos, no demasiado larga y TODOS visibles
-- para quien llama (la política de pdm_indicadores decide qué ve cada quien).
create function pdm_privado.validar_indicadores(p_indicadores uuid[]) returns uuid[]
language plpgsql set search_path = ''
as $$
declare v_ids uuid[]; v_visibles int;
begin
  select array_agg(distinct x order by x) into v_ids from unnest(p_indicadores) x where x is not null;
  if v_ids is null or cardinality(v_ids) = 0 then raise exception 'PDM: no se indicó ningún indicador' using errcode = '22023'; end if;
  if cardinality(v_ids) > 300 then raise exception 'PDM: demasiados indicadores en una sola operación (máximo 300)' using errcode = '22023'; end if;
  select count(*) into v_visibles from public.pdm_indicadores where id = any(v_ids) and activo;
  if v_visibles <> cardinality(v_ids) then
    raise exception 'PDM: algún indicador no existe o no tienes acceso a él' using errcode = '42501';
  end if;
  return v_ids;
end $$;

create function pdm_privado.nombre_de(p_usuario uuid) returns text
language sql stable set search_path = ''
as $$ select coalesce(nullif(btrim(nombre_completo), ''), 'Usuario sin nombre') from public.usuarios where id = p_usuario $$;

-- Deja una fila-resumen de la operación (la bitácora por cambio la pone el disparador).
create function pdm_privado.anotar_lote(p_lote uuid, p_operacion text, p_indicadores uuid[], p_resumen jsonb) returns void
language plpgsql set search_path = ''
as $$
declare v_plan uuid;
begin
  select plan_id into v_plan from public.pdm_indicadores where id = p_indicadores[1];
  insert into public.pdm_historial (plan_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle)
  values (v_plan, (select auth.uid()), pdm_privado.nombre_de((select auth.uid())), 'lote_' || p_operacion, 'plan', v_plan,
          jsonb_strip_nulls(jsonb_build_object(
            'lote', p_lote, 'indicadores', cardinality(p_indicadores),
            'motivo', nullif(current_setting('pdm.motivo', true), '')) || p_resumen));
end $$;

-- ─── pdm_asignar ────────────────────────────────────────────────────────────
--
-- Asigna UNA persona a varios indicadores.
--   p_principal = true : queda como responsable principal. Quien lo era pasa a apoyo
--                        (p_anterior = 'apoyo', lo normal) o se quita (p_anterior = 'quitar').
--   p_principal = false: se añade como apoyo (el indicador debe tener ya un principal).
-- Lo que ya está como se pide no se toca (y por tanto no deja rastro).

create function public.pdm_asignar(
  p_indicadores uuid[],
  p_usuario     uuid,
  p_principal   boolean default true,
  p_anterior    text    default 'apoyo',
  p_motivo      text    default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_yo_nombre text;
  v_ids uuid[];
  v_lote uuid;
  v_ind uuid;
  v_actual public.pdm_asignaciones%rowtype;
  v_propia public.pdm_asignaciones%rowtype;
  n_cambiados int := 0; n_iguales int := 0; n_demotados int := 0; n_quitados int := 0;
begin
  if p_anterior not in ('apoyo', 'quitar') then
    raise exception 'PDM: «anterior» debe ser apoyo o quitar' using errcode = '22023';
  end if;
  v_lote := pdm_privado.abrir_operacion(case when p_principal then 'asignar_principal' else 'asignar_apoyo' end, p_motivo);
  v_ids := pdm_privado.validar_indicadores(p_indicadores);
  if p_usuario is null or not exists (select 1 from public.usuarios where id = p_usuario and activo) then
    raise exception 'PDM: la persona no existe o está inactiva' using errcode = '22023';
  end if;
  v_yo_nombre := pdm_privado.nombre_de(v_yo);

  foreach v_ind in array v_ids loop
    select * into v_propia from public.pdm_asignaciones where indicador_id = v_ind and usuario_id = p_usuario;
    select * into v_actual from public.pdm_asignaciones where indicador_id = v_ind and principal;

    if p_principal then
      if v_propia.id is not null and v_propia.principal then n_iguales := n_iguales + 1; continue; end if;
      -- Primero se aparta al principal anterior (el índice solo admite uno).
      if v_actual.id is not null then
        if p_anterior = 'quitar' then
          delete from public.pdm_asignaciones where id = v_actual.id;
          n_quitados := n_quitados + 1;
        else
          update public.pdm_asignaciones set principal = false where id = v_actual.id;
          n_demotados := n_demotados + 1;
        end if;
      end if;
      if v_propia.id is not null then
        update public.pdm_asignaciones
          set principal = true, asignado_por = v_yo, asignado_por_nombre = v_yo_nombre
          where id = v_propia.id;
      else
        insert into public.pdm_asignaciones (indicador_id, usuario_id, principal, asignado_por, asignado_por_nombre)
        values (v_ind, p_usuario, true, v_yo, v_yo_nombre);
      end if;
      n_cambiados := n_cambiados + 1;
    else
      if v_propia.id is not null then n_iguales := n_iguales + 1; continue; end if;
      if v_actual.id is null then
        raise exception 'PDM: un indicador sin responsable principal no puede recibir un apoyo; asigna primero al principal' using errcode = '23514';
      end if;
      insert into public.pdm_asignaciones (indicador_id, usuario_id, principal, asignado_por, asignado_por_nombre)
      values (v_ind, p_usuario, false, v_yo, v_yo_nombre);
      n_cambiados := n_cambiados + 1;
    end if;
  end loop;

  -- Una operación que no cambió nada no deja fila-resumen (los cambios ya dejaron la suya, uno a uno).
  if n_cambiados > 0 then
    perform pdm_privado.anotar_lote(v_lote, case when p_principal then 'asignar_principal' else 'asignar_apoyo' end, v_ids,
      jsonb_build_object('usuario_id', p_usuario, 'usuario_nombre', pdm_privado.nombre_de(p_usuario),
                         'anterior', p_anterior, 'cambiados', n_cambiados, 'sin_cambio', n_iguales,
                         'principales_pasados_a_apoyo', n_demotados, 'principales_quitados', n_quitados));
  end if;
  return jsonb_build_object('lote', v_lote, 'cambiados', n_cambiados, 'sin_cambio', n_iguales,
                            'pasados_a_apoyo', n_demotados, 'quitados', n_quitados);
end $$;

-- ─── pdm_quitar ─────────────────────────────────────────────────────────────
--
-- Quita a una persona como APOYO. Al principal no se le quita: se le reemplaza (pdm_asignar).
-- Un apoyo que viene de un grupo se quita del grupo, no del indicador.

create function public.pdm_quitar(
  p_indicadores uuid[],
  p_usuario     uuid,
  p_motivo      text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_lote uuid;
  v_ids uuid[];
  v_ind uuid;
  v_fila public.pdm_asignaciones%rowtype;
  n_quitados int := 0; n_iguales int := 0;
begin
  v_lote := pdm_privado.abrir_operacion('quitar_apoyo', p_motivo);
  v_ids := pdm_privado.validar_indicadores(p_indicadores);
  if p_usuario is null then raise exception 'PDM: falta la persona' using errcode = '22023'; end if;

  foreach v_ind in array v_ids loop
    select * into v_fila from public.pdm_asignaciones where indicador_id = v_ind and usuario_id = p_usuario;
    if v_fila.id is null then n_iguales := n_iguales + 1; continue; end if;
    if v_fila.principal then
      raise exception 'PDM: no se quita al responsable principal; asigna a otra persona y esta pasará a apoyo' using errcode = '23514';
    end if;
    if v_fila.grupo_id is not null then
      raise exception 'PDM: este apoyo viene de un grupo; quítalo del grupo' using errcode = '23514';
    end if;
    delete from public.pdm_asignaciones where id = v_fila.id;
    n_quitados := n_quitados + 1;
  end loop;

  if n_quitados > 0 then
    perform pdm_privado.anotar_lote(v_lote, 'quitar_apoyo', v_ids,
      jsonb_build_object('usuario_id', p_usuario, 'usuario_nombre', pdm_privado.nombre_de(p_usuario),
                         'quitados', n_quitados, 'sin_cambio', n_iguales));
  end if;
  return jsonb_build_object('lote', v_lote, 'quitados', n_quitados, 'sin_cambio', n_iguales);
end $$;

-- ─── pdm_asignar_grupo ──────────────────────────────────────────────────────
--
-- Asigna un GRUPO a varios indicadores: el líder queda como principal y los demás miembros,
-- como apoyo, cada fila marcada con el grupo. Quien era principal y no es del grupo pasa a
-- apoyo o se quita (p_anterior); si es del grupo, pasa a apoyo. Un grupo trabaja en los
-- indicadores de SU secretaría.

create function public.pdm_asignar_grupo(
  p_indicadores uuid[],
  p_grupo       uuid,
  p_anterior    text default 'apoyo',
  p_motivo      text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_yo_nombre text;
  v_lote uuid;
  v_ids uuid[];
  v_ind uuid;
  v_dep uuid;
  v_lider uuid;
  v_n_miembros int;
  v_actual public.pdm_asignaciones%rowtype;
  v_fila public.pdm_asignaciones%rowtype;
  m record;
  v_ya_esta boolean;
  v_fuera int;
  n_cambiados int := 0; n_iguales int := 0; n_demotados int := 0; n_quitados int := 0;
begin
  if p_anterior not in ('apoyo', 'quitar') then
    raise exception 'PDM: «anterior» debe ser apoyo o quitar' using errcode = '22023';
  end if;
  v_lote := pdm_privado.abrir_operacion('asignar_grupo', p_motivo);
  v_ids := pdm_privado.validar_indicadores(p_indicadores);

  select dependencia_id into v_dep from public.pdm_grupos where id = p_grupo;
  if v_dep is null then raise exception 'PDM: el grupo no existe o no tienes acceso a él' using errcode = '42501'; end if;
  select usuario_id into v_lider from public.pdm_grupo_miembros where grupo_id = p_grupo and es_lider;
  select count(*) into v_n_miembros from public.pdm_grupo_miembros where grupo_id = p_grupo;
  if v_lider is null or v_n_miembros = 0 then
    raise exception 'PDM: el grupo no tiene líder; no se le pueden asignar indicadores' using errcode = '23514';
  end if;
  select count(*) into v_fuera from public.pdm_indicadores where id = any(v_ids) and dependencia_id <> v_dep;
  if v_fuera > 0 then
    raise exception 'PDM: un grupo solo trabaja en los indicadores de su secretaría (% de otra)', v_fuera using errcode = '23514';
  end if;
  v_yo_nombre := pdm_privado.nombre_de(v_yo);

  foreach v_ind in array v_ids loop
    select * into v_actual from public.pdm_asignaciones where indicador_id = v_ind and principal;

    -- ¿Ya está exactamente así? El líder es principal y todos los miembros llevan la marca del grupo.
    select (v_actual.usuario_id = v_lider)
       and not exists (
         select 1 from public.pdm_grupo_miembros gm
         where gm.grupo_id = p_grupo
           and not exists (select 1 from public.pdm_asignaciones a
                           where a.indicador_id = v_ind and a.usuario_id = gm.usuario_id and a.grupo_id = p_grupo))
      into v_ya_esta;
    if coalesce(v_ya_esta, false) then n_iguales := n_iguales + 1; continue; end if;

    -- 1. Se aparta al principal anterior, si no es el líder.
    if v_actual.id is not null and v_actual.usuario_id <> v_lider then
      if exists (select 1 from public.pdm_grupo_miembros where grupo_id = p_grupo and usuario_id = v_actual.usuario_id) then
        update public.pdm_asignaciones set principal = false where id = v_actual.id;   -- es del grupo: sigue, como apoyo
        n_demotados := n_demotados + 1;
      elsif p_anterior = 'quitar' then
        delete from public.pdm_asignaciones where id = v_actual.id;
        n_quitados := n_quitados + 1;
      else
        update public.pdm_asignaciones set principal = false where id = v_actual.id;
        n_demotados := n_demotados + 1;
      end if;
    end if;

    -- 2. Cada miembro tiene su fila, con la marca del grupo; el líder, de principal.
    for m in select usuario_id from public.pdm_grupo_miembros where grupo_id = p_grupo order by (usuario_id = v_lider) desc, usuario_id loop
      select * into v_fila from public.pdm_asignaciones where indicador_id = v_ind and usuario_id = m.usuario_id;
      if v_fila.id is null then
        insert into public.pdm_asignaciones (indicador_id, usuario_id, principal, grupo_id, asignado_por, asignado_por_nombre)
        values (v_ind, m.usuario_id, m.usuario_id = v_lider, p_grupo, v_yo, v_yo_nombre);
      elsif v_fila.grupo_id is distinct from p_grupo or (m.usuario_id = v_lider and not v_fila.principal) then
        update public.pdm_asignaciones
          set grupo_id = p_grupo,
              principal = (m.usuario_id = v_lider),
              asignado_por = v_yo, asignado_por_nombre = v_yo_nombre
          where id = v_fila.id;
      end if;
    end loop;
    n_cambiados := n_cambiados + 1;
  end loop;

  if n_cambiados > 0 then
    perform pdm_privado.anotar_lote(v_lote, 'asignar_grupo', v_ids,
      jsonb_build_object('grupo_id', p_grupo, 'grupo_nombre', (select nombre from public.pdm_grupos where id = p_grupo),
                         'lider_id', v_lider, 'lider_nombre', pdm_privado.nombre_de(v_lider), 'miembros', v_n_miembros,
                         'anterior', p_anterior, 'cambiados', n_cambiados, 'sin_cambio', n_iguales,
                         'principales_pasados_a_apoyo', n_demotados, 'principales_quitados', n_quitados));
  end if;
  return jsonb_build_object('lote', v_lote, 'cambiados', n_cambiados, 'sin_cambio', n_iguales,
                            'pasados_a_apoyo', n_demotados, 'quitados', n_quitados);
end $$;

-- ─── Sincronizar un grupo con sus indicadores ───────────────────────────────
--
-- Cuando cambia la membresía o el líder, lo asignado al grupo se pone al día:
--   · quien ya no es miembro pierde sus filas de ese grupo,
--   · todo miembro tiene su fila en cada indicador del grupo,
--   · si el grupo SOSTENÍA el principal del indicador, el principal es el líder de hoy.
-- Si alguien reemplazó a mano al principal de un indicador, ese indicador no se toca el principal.

create function pdm_privado.sincronizar_grupo(p_grupo uuid) returns void
language plpgsql set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_yo_nombre text := pdm_privado.nombre_de((select auth.uid()));
  v_lider uuid;
  v_ind uuid;
  v_sostiene boolean;
begin
  select usuario_id into v_lider from public.pdm_grupo_miembros where grupo_id = p_grupo and es_lider;

  for v_ind in select distinct indicador_id from public.pdm_asignaciones where grupo_id = p_grupo order by 1 loop
    v_sostiene := exists (select 1 from public.pdm_asignaciones where indicador_id = v_ind and grupo_id = p_grupo and principal);

    delete from public.pdm_asignaciones a
      where a.indicador_id = v_ind and a.grupo_id = p_grupo
        and not exists (select 1 from public.pdm_grupo_miembros m where m.grupo_id = p_grupo and m.usuario_id = a.usuario_id);

    insert into public.pdm_asignaciones (indicador_id, usuario_id, principal, grupo_id, asignado_por, asignado_por_nombre)
      select v_ind, m.usuario_id, false, p_grupo, v_yo, v_yo_nombre
      from public.pdm_grupo_miembros m
      where m.grupo_id = p_grupo
        and not exists (select 1 from public.pdm_asignaciones a where a.indicador_id = v_ind and a.usuario_id = m.usuario_id);

    if v_sostiene and v_lider is not null then
      update public.pdm_asignaciones set principal = false
        where indicador_id = v_ind and principal and grupo_id = p_grupo and usuario_id <> v_lider;
      update public.pdm_asignaciones set principal = true, asignado_por = v_yo, asignado_por_nombre = v_yo_nombre
        where indicador_id = v_ind and usuario_id = v_lider and not principal;
    end if;
  end loop;
end $$;

-- ─── pdm_grupo_guardar ──────────────────────────────────────────────────────
--
-- Crea (p_grupo null) o edita un grupo y deja su membresía exactamente como se pide. El líder
-- es obligatorio y se cuenta entre los miembros aunque no venga en la lista. Al editar, lo que
-- el grupo ya tenía asignado se sincroniza (ver arriba). Devuelve el id del grupo.

create function public.pdm_grupo_guardar(
  p_grupo       uuid,
  p_nombre      text,
  p_dependencia uuid,
  p_lider       uuid,
  p_miembros    uuid[],
  p_motivo      text default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_yo_nombre text;
  v_plan uuid;
  v_n_planes int;
  v_grupo uuid := p_grupo;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_miembros uuid[];
  v_validos int;
  v_dep_actual uuid;
begin
  perform pdm_privado.abrir_operacion(case when p_grupo is null then 'grupo_crear' else 'grupo_editar' end, p_motivo);
  if v_nombre = '' then raise exception 'PDM: el grupo necesita un nombre' using errcode = '22023'; end if;
  if p_lider is null then raise exception 'PDM: el grupo necesita un líder' using errcode = '23514'; end if;
  if p_dependencia is null then raise exception 'PDM: el grupo necesita una secretaría' using errcode = '22023'; end if;

  select array_agg(distinct x) into v_miembros from unnest(coalesce(p_miembros, '{}'::uuid[]) || p_lider) x where x is not null;
  if cardinality(v_miembros) > 100 then raise exception 'PDM: un grupo no puede pasar de 100 miembros' using errcode = '22023'; end if;
  select count(*) into v_validos from public.usuarios where id = any(v_miembros) and activo;
  if v_validos <> cardinality(v_miembros) then
    raise exception 'PDM: alguien de la lista no existe o está inactivo' using errcode = '22023';
  end if;
  v_yo_nombre := pdm_privado.nombre_de(v_yo);

  if v_grupo is null then
    select count(*) into v_n_planes from public.pdm_planes where activo;
    if v_n_planes = 0 then raise exception 'PDM: no tienes acceso al plan' using errcode = '42501'; end if;
    if v_n_planes > 1 then raise exception 'PDM: hay más de un plan activo' using errcode = '55000'; end if;
    select id into v_plan from public.pdm_planes where activo;
    insert into public.pdm_grupos (plan_id, dependencia_id, nombre, creado_por, creado_por_nombre)
    values (v_plan, p_dependencia, v_nombre, v_yo, v_yo_nombre)
    returning id into v_grupo;
  else
    select dependencia_id into v_dep_actual from public.pdm_grupos where id = v_grupo;
    if v_dep_actual is null then raise exception 'PDM: el grupo no existe o no tienes acceso a él' using errcode = '42501'; end if;
    if v_dep_actual <> p_dependencia and exists (select 1 from public.pdm_asignaciones where grupo_id = v_grupo) then
      raise exception 'PDM: el grupo ya tiene indicadores asignados; no se le puede cambiar de secretaría' using errcode = '23514';
    end if;
    update public.pdm_grupos set nombre = v_nombre, dependencia_id = p_dependencia
      where id = v_grupo and (nombre is distinct from v_nombre or dependencia_id is distinct from p_dependencia);
  end if;

  -- Membresía: salen los que ya no están, entran los nuevos, y el líder se fija sin chocar con el índice (uno solo).
  delete from public.pdm_grupo_miembros where grupo_id = v_grupo and not (usuario_id = any(v_miembros));
  insert into public.pdm_grupo_miembros (grupo_id, usuario_id, es_lider, agregado_por)
    select v_grupo, u, false, v_yo from unnest(v_miembros) u
    where not exists (select 1 from public.pdm_grupo_miembros m where m.grupo_id = v_grupo and m.usuario_id = u);
  update public.pdm_grupo_miembros set es_lider = false where grupo_id = v_grupo and es_lider and usuario_id <> p_lider;
  update public.pdm_grupo_miembros set es_lider = true  where grupo_id = v_grupo and usuario_id = p_lider and not es_lider;

  if p_grupo is not null then perform pdm_privado.sincronizar_grupo(v_grupo); end if;
  return v_grupo;
end $$;

-- ─── pdm_grupo_eliminar ─────────────────────────────────────────────────────
--
-- Disuelve un grupo. Lo que tenía asignado NO se desasigna: las filas quedan como individuales,
-- con los mismos principal y apoyos (cada una anotada en la bitácora). Los miembros se van con el
-- grupo por cascada: por eso la bitácora anota el borrado del grupo con la lista de quiénes lo
-- formaban (`pdm_grupos_auditar_borrado` es BEFORE DELETE, cuando aún existen).

create function public.pdm_grupo_eliminar(
  p_grupo  uuid,
  p_motivo text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_lote uuid;
  n_asignaciones int; n_miembros int;
begin
  v_lote := pdm_privado.abrir_operacion('grupo_eliminar', p_motivo);
  if not exists (select 1 from public.pdm_grupos where id = p_grupo) then
    raise exception 'PDM: el grupo no existe o no tienes acceso a él' using errcode = '42501';
  end if;

  update public.pdm_asignaciones set grupo_id = null where grupo_id = p_grupo;
  get diagnostics n_asignaciones = row_count;
  select count(*) into n_miembros from public.pdm_grupo_miembros where grupo_id = p_grupo;
  delete from public.pdm_grupos where id = p_grupo;

  return jsonb_build_object('lote', v_lote, 'asignaciones_que_quedan_como_individuales', n_asignaciones, 'miembros', n_miembros);
end $$;

-- ─── Quién puede llamar a las funciones ─────────────────────────────────────
--
-- Supabase da EXECUTE a `anon`, `authenticated` y PUBLIC sobre toda función nueva de `public`.
-- Aquí solo lo conserva `authenticated`; y, aun así, cada función exige sesión y manda la RLS.

revoke all on function
  public.pdm_asignar(uuid[], uuid, boolean, text, text),
  public.pdm_quitar(uuid[], uuid, text),
  public.pdm_asignar_grupo(uuid[], uuid, text, text),
  public.pdm_grupo_guardar(uuid, text, uuid, uuid, uuid[], text),
  public.pdm_grupo_eliminar(uuid, text),
  pdm_privado.abrir_operacion(text, text),
  pdm_privado.validar_indicadores(uuid[]),
  pdm_privado.nombre_de(uuid),
  pdm_privado.anotar_lote(uuid, text, uuid[], jsonb),
  pdm_privado.sincronizar_grupo(uuid)
from public, anon;

grant execute on function
  public.pdm_asignar(uuid[], uuid, boolean, text, text),
  public.pdm_quitar(uuid[], uuid, text),
  public.pdm_asignar_grupo(uuid[], uuid, text, text),
  public.pdm_grupo_guardar(uuid, text, uuid, uuid, uuid[], text),
  public.pdm_grupo_eliminar(uuid, text),
  pdm_privado.abrir_operacion(text, text),
  pdm_privado.validar_indicadores(uuid[]),
  pdm_privado.nombre_de(uuid),
  pdm_privado.anotar_lote(uuid, text, uuid[], jsonb),
  pdm_privado.sincronizar_grupo(uuid)
to authenticated;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. RLS en las tablas nuevas
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_grupos', 'pdm_grupo_miembros') and not c.relrowsecurity;
  if v_malas is not null then raise exception 'PDM 052: sin RLS: %', v_malas; end if;

  -- 2. `anon` no puede nada sobre ellas; `authenticated` no puede TRUNCATE, REFERENCES ni TRIGGER
  select string_agg(c.relname || ':' || p, ', ') into v_malas
  from pg_class c, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where c.relnamespace = 'public'::regnamespace and c.relname in ('pdm_grupos', 'pdm_grupo_miembros')
    and (has_table_privilege('anon', c.oid, p)
         or (p in ('TRUNCATE','REFERENCES','TRIGGER') and has_table_privilege('authenticated', c.oid, p)));
  if v_malas is not null then raise exception 'PDM 052: permisos de sobra: %', v_malas; end if;

  -- 3. Cuatro políticas por tabla nueva (una por acción), todas solo para `authenticated`
  select string_agg(tablename || ':' || n::text, ', ') into v_malas
  from (select tablename, count(*) n from pg_policies
        where schemaname = 'public' and tablename in ('pdm_grupos', 'pdm_grupo_miembros') group by tablename) x
  where n <> 4;
  if v_malas is not null then raise exception 'PDM 052: número de políticas inesperado: %', v_malas; end if;
  select string_agg(tablename || '.' || policyname, ', ') into v_malas
  from pg_policies
  where schemaname = 'public' and tablename in ('pdm_grupos', 'pdm_grupo_miembros') and roles <> '{authenticated}';
  if v_malas is not null then raise exception 'PDM 052: políticas fuera de authenticated: %', v_malas; end if;

  -- 4. Nunca NO ACTION ni RESTRICT hacia `usuarios`: solo CASCADE o SET NULL (CD borra usuarios a mano)
  select string_agg(conrelid::regclass::text || '.' || conname, ', ') into v_malas
  from pg_constraint
  where contype = 'f' and confrelid = 'public.usuarios'::regclass
    and conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and confdeltype not in ('c', 'n');
  if v_malas is not null then raise exception 'PDM 052: bloquearía el borrado de usuarios: %', v_malas; end if;

  -- 5. Toda clave foránea del módulo queda cubierta ENTERA, en orden, por algún índice
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v_malas
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and array_to_string((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1], ',') = array_to_string(c.conkey, ',')
    );
  if v_malas is not null then raise exception 'PDM 052: clave foránea sin índice que la cubra entera: %', v_malas; end if;

  -- 6. Las funciones públicas del módulo: SECURITY INVOKER, con search_path fijo, sin `anon` ni PUBLIC, con `authenticated`
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in
        ('pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar')
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 052: función mal protegida: %', v_malas; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
        ('pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar')) <> 5 then
    raise exception 'PDM 052: faltan funciones públicas';
  end if;

  -- 7. Las ayudas de `pdm_privado` no son invocables por PUBLIC ni por anon
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pdm_privado'
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    );
  if v_malas is not null then raise exception 'PDM 052: ayuda invocable de más: %', v_malas; end if;

  -- 8. La bitácora está enchufada y activa en las tres tablas
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_asignaciones', 'pdm_asignaciones_auditar'), ('pdm_grupos', 'pdm_grupos_auditar'),
               ('pdm_grupos', 'pdm_grupos_auditar_borrado'), ('pdm_grupo_miembros', 'pdm_grupo_miembros_auditar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 052: bitácora sin enchufar: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
--   begin;
--   set local lock_timeout = '3s';
--   drop function public.pdm_asignar(uuid[], uuid, boolean, text, text),
--                 public.pdm_quitar(uuid[], uuid, text),
--                 public.pdm_asignar_grupo(uuid[], uuid, text, text),
--                 public.pdm_grupo_guardar(uuid, text, uuid, uuid, uuid[], text),
--                 public.pdm_grupo_eliminar(uuid, text);
--   drop trigger pdm_asignaciones_auditar on public.pdm_asignaciones;
--   alter table public.pdm_asignaciones drop column grupo_id;
--   drop table public.pdm_grupo_miembros, public.pdm_grupos;
--   drop function pdm_privado.auditar(), pdm_privado.abrir_operacion(text, text),
--                 pdm_privado.validar_indicadores(uuid[]), pdm_privado.nombre_de(uuid),
--                 pdm_privado.anotar_lote(uuid, text, uuid[], jsonb), pdm_privado.sincronizar_grupo(uuid),
--                 pdm_privado.dependencia_del_grupo(uuid), pdm_privado.es_miembro(uuid);
--   commit;
--
-- (El historial ya escrito se conserva: `pdm_historial` no se toca.)
