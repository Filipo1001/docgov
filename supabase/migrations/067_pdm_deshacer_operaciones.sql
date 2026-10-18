-- Migration 067: módulo Plan de Desarrollo — el administrador deshace una operación, con trazabilidad
--
-- POR QUÉ. Hoy cada cambio de reparto, de grupo o de acceso tiene su «inverso» a mano (quitar lo asignado, volver a dar
-- el acceso…), pero nadie sabe cuál es el inverso EXACTO de lo que se hizo ni si lo hecho después lo vuelve a tocar. Y
-- esa pregunta —«¿qué fue lo último que pasó y cómo vuelvo a como estaba?»— es la del administrador cuando alguien se
-- equivoca. La bitácora (`pdm_historial`) ya guarda el ANTES y el DESPUÉS de cada fila que cambia, agrupado por
-- operación (el «lote»): con eso se puede deshacer, sin inventar nada.
--
-- LA REGLA (decidida con Felipe, 18-oct-2026):
--   · Deshacer NO borra el pasado: es una operación NUEVA que compensa, con motivo obligatorio (≥ 10 caracteres), y
--     queda en la bitácora enlazada a la original (`lote_deshacer`, con `deshace` = el lote original). Cada fila que
--     cambia al deshacer queda anotada por el mismo disparador de siempre, con el motivo.
--   · Solo el administrador.
--   · Solo se deshace lo MÁS RECIENTE de cada cosa: si lo que la operación tocó volvió a cambiar después (otra
--     operación sobre la misma asignación, el mismo acceso o el mismo grupo), se niega y dice por qué. Eso evita
--     dejar cadenas incoherentes. Deshacer una operación ya deshecha se niega; deshacer la reversión («rehacer») sí.
--
-- QUÉ SE PUEDE DESHACER: asignar (principal o apoyo), quitar, asignar un grupo, crear / editar / eliminar un grupo, dar o
-- quitar un acceso. NO (todavía): reportes, validaciones, evidencias, cortes ni ajustes del plan.
--
-- QUÉ CAMBIA
--   · `public.pdm_operaciones(p_limite)`  : las operaciones recientes (más nuevas primero) con su estado: se puede
--     deshacer, está bloqueada (y por qué) o ya se deshizo. La lee la pantalla del historial.
--   · `public.pdm_deshacer(p_lote, p_motivo)` : deshace una operación entera, o ninguna.
--   · `pdm_privado.*` : ayudas (qué operaciones se pueden, la clave de «lo mismo», los bloqueos).
--
-- LO QUE NO TOCA. Nada de Contratista Digital; ninguna tabla ni política ni disparador existente; no cambia ninguna fila
-- de ninguna tabla (solo se añaden funciones). SECURITY INVOKER como las demás: todo pasa por las políticas de siempre.
--
-- UNA NOTA SOBRE QUIÉN FIGURA. Las políticas de inserción exigen que `asignado_por`, `habilitado_por`, `creado_por` y
-- `agregado_por` sean quien escribe. Así que lo que se RESTAURA (una asignación o un acceso quitados, un grupo
-- eliminado) figura como creado por el administrador que deshizo, no por quien lo hizo originalmente. La autoría
-- original no se pierde: está en la fila de la bitácora de la operación que se deshizo.
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no queda
-- cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── Ayudas (esquema no expuesto por la API) ────────────────────────────────

-- Las operaciones que se pueden deshacer: las del administrador sobre repartos, grupos y accesos, y la propia reversión.
create function pdm_privado.operaciones_deshacibles() returns text[]
language sql immutable set search_path = ''
as $$
  select array['asignar_principal', 'asignar_apoyo', 'quitar_apoyo', 'quitar', 'asignar_grupo',
               'grupo_crear', 'grupo_editar', 'grupo_eliminar', 'habilitar', 'deshabilitar', 'deshacer']
$$;

-- «Lo mismo»: dos filas de la bitácora hablan de lo mismo si comparten esta clave. Una asignación es el par
-- indicador-persona; un acceso, la persona; un grupo (y sus miembros), el grupo.
create function pdm_privado.clave_historial(p_entidad text, p_entidad_id uuid, p_detalle jsonb) returns text
language sql immutable set search_path = ''
as $$
  select case p_entidad
    when 'indicador' then 'indicador:' || coalesce(p_entidad_id::text, '') || ':' || coalesce(p_detalle->>'usuario_id', '')
    else coalesce(p_entidad, '') || ':' || coalesce(p_entidad_id::text, '')
  end
$$;

-- Por qué NO se puede deshacer una operación (una frase por motivo); sin filas, se puede.
create function pdm_privado.bloqueos_de_lote(p_lote uuid) returns setof text
language plpgsql stable set search_path = ''
as $$
declare
  v_filas int;
  v_op text;
  v_neutros text[];
begin
  select count(*), min(h.detalle->>'operacion') into v_filas, v_op
  from public.pdm_historial h
  where h.detalle->>'lote' = p_lote::text and h.accion not like 'lote\_%';

  if v_filas = 0 then
    return next 'No hay nada que deshacer en esa operación.';
    return;
  end if;
  if v_op is null or not (v_op = any (pdm_privado.operaciones_deshacibles())) then
    return next 'Este tipo de operación no se deshace desde aquí.';
    return;
  end if;

  -- Ya se deshizo (y esa reversión sigue en pie).
  if exists (
    select 1 from public.pdm_historial u
    where u.accion = 'lote_deshacer' and u.detalle->>'deshace' = p_lote::text
      and not exists (select 1 from public.pdm_historial v
                      where v.accion = 'lote_deshacer' and v.detalle->>'deshace' = u.detalle->>'lote')
  ) then
    return next 'Esta operación ya se deshizo.';
    return;
  end if;

  -- Una operación deshecha y su reversión se anulan entre sí: a efectos de «¿cambió después?» es como si no hubieran
  -- ocurrido. Gracias a eso se pueden deshacer varias operaciones seguidas, de la más nueva a la más vieja. (Una reversión
  -- que a su vez se deshizo —«rehacer»— deja de contar como reversión en pie, y la operación original vuelve a contar.)
  select coalesce(array_agg(x.lote), '{}') into v_neutros
  from (
    select u.detalle->>'lote' as lote from public.pdm_historial u
    where u.accion = 'lote_deshacer'
      and not exists (select 1 from public.pdm_historial v where v.accion = 'lote_deshacer' and v.detalle->>'deshace' = u.detalle->>'lote')
    union
    select u.detalle->>'deshace' from public.pdm_historial u
    where u.accion = 'lote_deshacer'
      and not exists (select 1 from public.pdm_historial v where v.accion = 'lote_deshacer' and v.detalle->>'deshace' = u.detalle->>'lote')
  ) x;

  -- Lo que tocó volvió a cambiar después: solo se deshace lo más reciente de cada cosa.
  if exists (
    select 1
    from public.pdm_historial f
    join public.pdm_historial h
      on h.id > f.id
     and h.accion not like 'lote\_%'
     and coalesce(h.detalle->>'lote', '') <> p_lote::text
     and not (coalesce(h.detalle->>'lote', '') = any (v_neutros))
     and pdm_privado.clave_historial(h.entidad, h.entidad_id, h.detalle) = pdm_privado.clave_historial(f.entidad, f.entidad_id, f.detalle)
    where f.detalle->>'lote' = p_lote::text and f.accion not like 'lote\_%'
  ) then
    return next 'Lo que esa operación cambió ya volvió a cambiar después. Solo se deshace lo más reciente.';
  end if;

  -- Un grupo que esa operación tocó se usó después en otros indicadores.
  if exists (
    select 1
    from public.pdm_historial f
    join public.pdm_historial h
      on h.id > f.id and h.entidad = 'indicador' and h.accion not like 'lote\_%'
     and coalesce(h.detalle->>'lote', '') <> p_lote::text
     and not (coalesce(h.detalle->>'lote', '') = any (v_neutros))
     and f.entidad_id::text in (coalesce(h.detalle->>'grupo_antes', ''), coalesce(h.detalle->>'grupo_despues', ''))
    where f.detalle->>'lote' = p_lote::text and f.entidad = 'grupo' and f.accion not like 'lote\_%'
  ) then
    return next 'Ese grupo se usó después en otros indicadores.';
  end if;

  -- Volver a crear un grupo eliminado chocaría con otro que hoy se llama igual.
  if exists (
    select 1
    from public.pdm_historial f
    join public.pdm_grupos g
      on g.plan_id = (f.detalle->'antes'->>'plan_id')::uuid
     and lower(btrim(g.nombre)) = lower(btrim(f.detalle->'antes'->>'nombre'))
    where f.detalle->>'lote' = p_lote::text and f.accion = 'grupo_eliminado'
  ) then
    return next 'Ya existe otro grupo con ese nombre.';
  end if;
end $$;

-- ─── Deshacer una operación ─────────────────────────────────────────────────
--
-- Recorre las filas de la bitácora de ese lote del final al principio y hace lo contrario de cada una, comprobando
-- primero que lo afectado sigue como la operación lo dejó (si no, aborta TODO: o se deshace entera o no se toca nada).
-- Orden: primero vuelven los grupos eliminados (lo demás puede apuntar a ellos), después se invierte el resto fila por
-- fila, y al final se borran los grupos que la operación había creado.

create function public.pdm_deshacer(
  p_lote   uuid,
  p_motivo text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_yo_nombre text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_lote uuid;
  v_razones text;
  v_op text;
  v_plan uuid;
  v_n int := 0;
  r record;
  m jsonb;
  v_antes jsonb;
  v_grupo uuid;
  v_ga uuid;
  v_gd uuid;
begin
  if (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador puede deshacer una operación' using errcode = '42501';
  end if;
  if p_lote is null then raise exception 'PDM: falta la operación' using errcode = '22023'; end if;
  if v_motivo is null or char_length(v_motivo) < 10 then
    raise exception 'PDM: explica por qué la deshaces (al menos 10 caracteres)' using errcode = '22023';
  end if;

  v_lote := pdm_privado.abrir_operacion('deshacer', v_motivo);
  v_yo_nombre := pdm_privado.nombre_de(v_yo);

  select string_agg(b, ' ') into v_razones from pdm_privado.bloqueos_de_lote(p_lote) b;
  if v_razones is not null then
    raise exception 'PDM: no se puede deshacer. %', v_razones using errcode = '23514';
  end if;

  select h.detalle->>'operacion', h.plan_id into v_op, v_plan
  from public.pdm_historial h
  where h.detalle->>'lote' = p_lote::text and h.accion not like 'lote\_%'
  order by h.id limit 1;

  -- Fase 0: los grupos eliminados vuelven primero (las asignaciones y miembros que se restauren pueden apuntar a ellos).
  for r in
    select h.* from public.pdm_historial h
    where h.detalle->>'lote' = p_lote::text and h.accion = 'grupo_eliminado'
    order by h.id desc
  loop
    v_antes := r.detalle->'antes';
    v_grupo := (v_antes->>'id')::uuid;
    insert into public.pdm_grupos (id, plan_id, dependencia_id, nombre, descripcion, creado_por, creado_por_nombre, created_at)
    values (v_grupo, (v_antes->>'plan_id')::uuid, (v_antes->>'dependencia_id')::uuid, v_antes->>'nombre',
            v_antes->>'descripcion', v_yo, v_yo_nombre, (v_antes->>'created_at')::timestamptz);
    for m in select value from jsonb_array_elements(coalesce(r.detalle->'miembros', '[]'::jsonb)) loop
      -- Quien ya no existe en el sistema no vuelve.
      if exists (select 1 from public.usuarios u where u.id = (m->>'usuario_id')::uuid) then
        insert into public.pdm_grupo_miembros (grupo_id, usuario_id, es_lider, agregado_por)
        values (v_grupo, (m->>'usuario_id')::uuid, coalesce((m->>'es_lider')::boolean, false), v_yo);
      end if;
    end loop;
    v_n := v_n + 1;
  end loop;

  -- Fase 1: el resto, fila por fila, de la última a la primera.
  for r in
    select h.* from public.pdm_historial h
    where h.detalle->>'lote' = p_lote::text and h.accion not like 'lote\_%'
      and h.accion not in ('grupo_eliminado', 'grupo_creado')
    order by h.id desc
  loop
    v_ga := nullif(r.detalle->>'grupo_antes', '')::uuid;
    v_gd := nullif(r.detalle->>'grupo_despues', '')::uuid;

    if r.accion = 'asignacion_creada' then
      delete from public.pdm_asignaciones
      where indicador_id = r.entidad_id and usuario_id = (r.detalle->>'usuario_id')::uuid
        and principal is not distinct from (r.detalle->>'principal_despues')::boolean
        and grupo_id is not distinct from v_gd;
      if not found then raise exception 'PDM: una asignación que esta operación creó ya no está como quedó' using errcode = '23514'; end if;

    elsif r.accion = 'asignacion_cambiada' then
      update public.pdm_asignaciones
        set principal = coalesce((r.detalle->>'principal_antes')::boolean, principal),
            grupo_id = case when v_ga is not null and exists (select 1 from public.pdm_grupos g where g.id = v_ga) then v_ga else null end
      where indicador_id = r.entidad_id and usuario_id = (r.detalle->>'usuario_id')::uuid
        and principal is not distinct from (r.detalle->>'principal_despues')::boolean
        and grupo_id is not distinct from v_gd;
      if not found then raise exception 'PDM: una asignación que esta operación cambió ya no está como quedó' using errcode = '23514'; end if;

    elsif r.accion = 'asignacion_quitada' then
      if exists (select 1 from public.pdm_asignaciones where indicador_id = r.entidad_id and usuario_id = (r.detalle->>'usuario_id')::uuid) then
        raise exception 'PDM: una asignación que esta operación quitó ya existe de nuevo' using errcode = '23514';
      end if;
      insert into public.pdm_asignaciones (indicador_id, usuario_id, principal, asignado_por, asignado_por_nombre, grupo_id)
      values (r.entidad_id, (r.detalle->>'usuario_id')::uuid, coalesce((r.detalle->>'principal_antes')::boolean, false), v_yo, v_yo_nombre,
              case when v_ga is not null and exists (select 1 from public.pdm_grupos g where g.id = v_ga) then v_ga else null end);

    elsif r.accion = 'miembro_agregado' then
      delete from public.pdm_grupo_miembros where grupo_id = r.entidad_id and usuario_id = (r.detalle->>'usuario_id')::uuid;
      if not found then raise exception 'PDM: un miembro que esta operación agregó ya no está en el grupo' using errcode = '23514'; end if;

    elsif r.accion = 'miembro_cambiado' then
      update public.pdm_grupo_miembros set es_lider = coalesce((r.detalle->>'lider_antes')::boolean, es_lider)
      where grupo_id = r.entidad_id and usuario_id = (r.detalle->>'usuario_id')::uuid
        and es_lider is not distinct from (r.detalle->>'lider_despues')::boolean;
      if not found then raise exception 'PDM: un miembro que esta operación cambió ya no está como quedó' using errcode = '23514'; end if;

    elsif r.accion = 'miembro_quitado' then
      if exists (select 1 from public.pdm_grupo_miembros where grupo_id = r.entidad_id and usuario_id = (r.detalle->>'usuario_id')::uuid) then
        raise exception 'PDM: un miembro que esta operación quitó ya está en el grupo de nuevo' using errcode = '23514';
      end if;
      insert into public.pdm_grupo_miembros (grupo_id, usuario_id, es_lider, agregado_por)
      values (r.entidad_id, (r.detalle->>'usuario_id')::uuid, coalesce((r.detalle->>'lider_antes')::boolean, false), v_yo);

    elsif r.accion = 'grupo_editado' then
      v_antes := r.detalle->'antes';
      update public.pdm_grupos
        set nombre = v_antes->>'nombre', dependencia_id = (v_antes->>'dependencia_id')::uuid, descripcion = v_antes->>'descripcion'
      where id = r.entidad_id;
      if not found then raise exception 'PDM: un grupo que esta operación editó ya no existe' using errcode = '23514'; end if;

    elsif r.accion = 'acceso_habilitado' then
      delete from public.pdm_permisos where usuario_id = r.entidad_id and nivel = r.detalle->>'nivel_despues';
      if not found then raise exception 'PDM: un acceso que esta operación dio ya no está como quedó' using errcode = '23514'; end if;

    elsif r.accion = 'acceso_cambiado' then
      update public.pdm_permisos
        set nivel = r.detalle->>'nivel_antes', habilitado_por = v_yo, habilitado_por_nombre = v_yo_nombre
      where usuario_id = r.entidad_id and nivel = r.detalle->>'nivel_despues';
      if not found then raise exception 'PDM: un acceso que esta operación cambió ya no está como quedó' using errcode = '23514'; end if;

    elsif r.accion = 'acceso_quitado' then
      if exists (select 1 from public.pdm_permisos where usuario_id = r.entidad_id) then
        raise exception 'PDM: un acceso que esta operación quitó ya existe de nuevo' using errcode = '23514';
      end if;
      insert into public.pdm_permisos (usuario_id, nivel, habilitado_por, habilitado_por_nombre)
      values (r.entidad_id, r.detalle->>'nivel_antes', v_yo, v_yo_nombre);

    else
      raise exception 'PDM: no sé deshacer un cambio de tipo «%»', r.accion using errcode = '22023';
    end if;
    v_n := v_n + 1;
  end loop;

  -- Fase 2: los grupos que la operación creó se van al final (ya sin miembros ni asignaciones).
  for r in
    select h.* from public.pdm_historial h
    where h.detalle->>'lote' = p_lote::text and h.accion = 'grupo_creado'
    order by h.id desc
  loop
    delete from public.pdm_grupos where id = r.entidad_id;
    if not found then raise exception 'PDM: un grupo que esta operación creó ya no existe' using errcode = '23514'; end if;
    v_n := v_n + 1;
  end loop;

  insert into public.pdm_historial (plan_id, actor_id, actor_nombre, accion, entidad, entidad_id, detalle)
  values (v_plan, v_yo, v_yo_nombre, 'lote_deshacer', 'plan', v_plan,
          jsonb_build_object('lote', v_lote, 'deshace', p_lote, 'operacion_original', v_op, 'motivo', v_motivo, 'filas', v_n));

  return jsonb_build_object('lote', v_lote, 'deshace', p_lote, 'operacion', v_op, 'filas', v_n);
end $$;

-- ─── Las operaciones recientes y su estado ──────────────────────────────────

create function public.pdm_operaciones(p_limite integer default 40)
returns table (
  lote          uuid,
  operacion     text,
  actor_nombre  text,
  creado        timestamptz,
  motivo        text,
  filas         integer,
  resumen       jsonb,
  deshace       uuid,
  estado        text,
  razon         text
)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v record;
  v_razon text;
begin
  if (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador ve las operaciones' using errcode = '42501';
  end if;

  for v in
    select (h.detalle->>'lote')::uuid as id_lote, max(h.id) as ultimo
    from public.pdm_historial h
    where h.detalle ? 'lote' and h.accion not like 'lote\_%'
      and h.detalle->>'operacion' = any (pdm_privado.operaciones_deshacibles())
    group by 1
    order by ultimo desc
    limit greatest(least(coalesce(p_limite, 40), 100), 1)
  loop
    lote := v.id_lote;
    select min(h.detalle->>'operacion'),
           (array_agg(h.actor_nombre order by h.id))[1],
           min(h.created_at),
           min(h.detalle->>'motivo'),
           count(*)::int,
           jsonb_build_object(
             'indicadores', count(distinct h.entidad_id) filter (where h.entidad = 'indicador'),
             'personas', coalesce(jsonb_agg(distinct h.detalle->>'usuario_nombre') filter (where h.detalle->>'usuario_nombre' is not null), '[]'::jsonb),
             'grupo', max(coalesce(h.detalle->>'grupo_nombre', h.detalle->'despues'->>'nombre', h.detalle->'antes'->>'nombre')),
             'nivel', max(coalesce(h.detalle->>'nivel_despues', h.detalle->>'nivel_antes')))
      into operacion, actor_nombre, creado, motivo, filas, resumen
    from public.pdm_historial h
    where h.detalle->>'lote' = v.id_lote::text and h.accion not like 'lote\_%';

    -- Si es una reversión, qué operación deshizo y cómo se llamaba.
    select (s.detalle->>'deshace')::uuid, s.detalle->>'operacion_original'
      into deshace, v_razon
    from public.pdm_historial s
    where s.accion = 'lote_deshacer' and s.detalle->>'lote' = v.id_lote::text
    limit 1;
    if deshace is not null then
      resumen := resumen || jsonb_build_object('operacion_original', v_razon);
    end if;

    select string_agg(b, ' ') into v_razon from pdm_privado.bloqueos_de_lote(v.id_lote) b;
    razon := v_razon;
    estado := case when v_razon is null then 'se_puede'
                   when v_razon = 'Esta operación ya se deshizo.' then 'deshecha'
                   else 'bloqueada' end;
    return next;
  end loop;
end $$;

-- ─── Quién puede llamar ─────────────────────────────────────────────────────

revoke all on function
  public.pdm_deshacer(uuid, text),
  public.pdm_operaciones(integer),
  pdm_privado.operaciones_deshacibles(),
  pdm_privado.clave_historial(text, uuid, jsonb),
  pdm_privado.bloqueos_de_lote(uuid)
from public, anon;

grant execute on function
  public.pdm_deshacer(uuid, text),
  public.pdm_operaciones(integer),
  pdm_privado.operaciones_deshacibles(),
  pdm_privado.clave_historial(text, uuid, jsonb),
  pdm_privado.bloqueos_de_lote(uuid)
to authenticated;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. Las dos funciones públicas: SECURITY INVOKER, search_path fijo, sin `anon` ni PUBLIC, con `authenticated`
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in ('pdm_deshacer', 'pdm_operaciones')
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 067: función mal protegida: %', v_malas; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('pdm_deshacer', 'pdm_operaciones')) <> 2 then
    raise exception 'PDM 067: no quedan exactamente las dos funciones públicas';
  end if;

  -- 2. Las ayudas de `pdm_privado` no son invocables por PUBLIC ni por anon
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pdm_privado' and p.proname in ('operaciones_deshacibles', 'clave_historial', 'bloqueos_de_lote')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 067: ayuda invocable de más: %', v_malas; end if;

  -- 3. Quien no es administrador no puede ni mirar ni deshacer
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('pdm_deshacer', 'pdm_operaciones')
             and p.prosrc not like '%get_user_rol()%') then
    raise exception 'PDM 067: una función no comprueba que quien llama sea administrador';
  end if;

  -- 4. No se tocó nada de lo existente: las funciones anteriores siguen y los disparadores siguen enchufados
  if to_regprocedure('public.pdm_asignar(uuid[],uuid,boolean,text,text)') is null
     or to_regprocedure('public.pdm_validar(uuid,text,text,jsonb)') is null then
    raise exception 'PDM 067: falta una función anterior';
  end if;
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_asignaciones', 'pdm_asignaciones_auditar'), ('pdm_grupos', 'pdm_grupos_auditar'),
               ('pdm_grupo_miembros', 'pdm_grupo_miembros_auditar'), ('pdm_permisos', 'pdm_permisos_auditar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 067: disparador sin enchufar: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Solo se añadieron funciones; no cambió ninguna fila. Las filas `lote_deshacer` y las de las reversiones ya escritas en
-- `pdm_historial` se quedan (son historia). Para quitar la función:
--   drop function public.pdm_deshacer(uuid, text), public.pdm_operaciones(integer),
--                 pdm_privado.bloqueos_de_lote(uuid), pdm_privado.clave_historial(text, uuid, jsonb),
--                 pdm_privado.operaciones_deshacibles();
-- (hay una copia ejecutable en supabase/reversiones/067_pdm_deshacer_operaciones.sql)
