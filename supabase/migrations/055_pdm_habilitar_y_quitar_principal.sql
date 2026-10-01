-- Migration 055: módulo Plan de Desarrollo — habilitar personas, bitácora de accesos y quitar al principal único
--
-- TRES COSAS PARA QUE EL ADMINISTRADOR Y LOS SECRETARIOS PUEDAN REPARTIR Y DAR ACCESO:
--
--   1. HABILITAR Y QUITAR EL ACCESO. `pdm_habilitar(usuario, nivel)` y `pdm_deshabilitar(usuario)`:
--      escriben en `pdm_permisos` (quién entra al módulo y con qué alcance). SECURITY INVOKER, así
--      que mandan las políticas de la 050: el administrador habilita a cualquiera con cualquier nivel;
--      una secretaría (`coordinador`) solo habilita como `responsable` a gente de SU dependencia, y
--      solo les quita ese acceso. Subir o bajar de nivel es del administrador.
--      Nadie cambia su propio acceso, y al administrador no se le habilita (ya lo tiene por su rol).
--      Quien no es administrador ni secretaría recibe una negativa clara al inicio; sin esa comprobación
--      la política le ocultaría las filas y la función le contestaría «sin cambios», que engaña.
--
--   2. LA BITÁCORA TAMBIÉN ANOTA LOS ACCESOS. El disparador `pdm_privado.auditar` de la 052 cubría
--      asignaciones, grupos y miembros; ahora cubre además `pdm_permisos`: quién habilitó a quién, con
--      qué nivel, y cuándo se quitó o cambió. La regla del administrador fue «toda acción debe quedar
--      guardada»; dar acceso es una de las más importantes.
--
--   3. QUITAR AL PRINCIPAL ÚNICO. En la 052, `pdm_quitar` solo quitaba apoyos: al principal se le
--      reemplazaba. Eso dejaba sin salida un caso real: una persona que sale y era la ÚNICA a cargo de
--      un indicador. Ahora se le puede quitar si no hay apoyos: el indicador vuelve a «sin responsable».
--      Si hay apoyos se sigue pidiendo reemplazarlo (así un indicador con asignaciones tiene siempre
--      UN principal). Si el principal viene de un grupo, se quita del grupo.
--
-- LO QUE NO TOCA. Nada de Contratista Digital. La función `pdm_privado.auditar` se reemplaza en su
-- sitio (misma firma, mismos permisos) y `pdm_quitar` también.
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo
-- prometido no queda cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. La bitácora automática, ahora también para los accesos ──────────────

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
      -- Los permisos no cuelgan de un plan: se anotan en el plan activo (si no hay uno, no hay dónde anotar).
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

create trigger pdm_permisos_auditar after insert or update or delete on public.pdm_permisos
  for each row execute function pdm_privado.auditar();

-- ─── 2. Habilitar y quitar el acceso ────────────────────────────────────────

create function public.pdm_habilitar(
  p_usuario uuid,
  p_nivel   text,
  p_motivo  text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_yo_nombre text;
  v_lote uuid;
  v_rol text;
  v_actual text;
begin
  v_lote := pdm_privado.abrir_operacion('habilitar', p_motivo);
  if (select public.get_user_rol()) is distinct from 'admin' and (select pdm_privado.mi_nivel()) is distinct from 'coordinador' then
    raise exception 'PDM: solo el administrador o una secretaría pueden dar o quitar accesos' using errcode = '42501';
  end if;
  if p_nivel is null or p_nivel not in ('consulta', 'responsable', 'coordinador') then
    raise exception 'PDM: el nivel debe ser consulta, responsable o coordinador' using errcode = '22023';
  end if;
  select rol::text into v_rol from public.usuarios where id = p_usuario and activo;
  if v_rol is null then raise exception 'PDM: la persona no existe o está inactiva' using errcode = '22023'; end if;
  if v_rol = 'admin' then
    raise exception 'PDM: el administrador no necesita acceso: ya lo tiene por su rol' using errcode = '23514';
  end if;
  if p_usuario = v_yo then raise exception 'PDM: no puedes cambiar tu propio acceso' using errcode = '23514'; end if;
  v_yo_nombre := pdm_privado.nombre_de(v_yo);

  select nivel into v_actual from public.pdm_permisos where usuario_id = p_usuario;
  if v_actual = p_nivel then
    return jsonb_build_object('lote', v_lote, 'cambio', 'ninguno', 'nivel', p_nivel);
  end if;

  if v_actual is null then
    insert into public.pdm_permisos (usuario_id, nivel, habilitado_por, habilitado_por_nombre)
    values (p_usuario, p_nivel, v_yo, v_yo_nombre);
    return jsonb_build_object('lote', v_lote, 'cambio', 'habilitado', 'nivel', p_nivel);
  end if;

  update public.pdm_permisos
    set nivel = p_nivel, habilitado_por = v_yo, habilitado_por_nombre = v_yo_nombre
    where usuario_id = p_usuario;
  -- La política de la 050 deja actualizar solo al administrador: si no se tocó nada, no había permiso.
  if not found then raise exception 'PDM: no tienes permiso para cambiar su nivel de acceso' using errcode = '42501'; end if;
  return jsonb_build_object('lote', v_lote, 'cambio', 'cambiado', 'nivel', p_nivel, 'antes', v_actual);
end $$;

create function public.pdm_deshabilitar(
  p_usuario uuid,
  p_motivo  text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_lote uuid;
  v_actual text;
begin
  v_lote := pdm_privado.abrir_operacion('deshabilitar', p_motivo);
  if (select public.get_user_rol()) is distinct from 'admin' and (select pdm_privado.mi_nivel()) is distinct from 'coordinador' then
    raise exception 'PDM: solo el administrador o una secretaría pueden dar o quitar accesos' using errcode = '42501';
  end if;
  if p_usuario is null then raise exception 'PDM: falta la persona' using errcode = '22023'; end if;
  if p_usuario = v_yo then raise exception 'PDM: no puedes quitarte tu propio acceso' using errcode = '23514'; end if;

  select nivel into v_actual from public.pdm_permisos where usuario_id = p_usuario;
  if v_actual is null then
    return jsonb_build_object('lote', v_lote, 'cambio', 'ninguno');
  end if;

  delete from public.pdm_permisos where usuario_id = p_usuario;
  -- Una secretaría solo quita el acceso de nivel `responsable` de su gente; si no se borró nada, no había permiso.
  if not found then raise exception 'PDM: no tienes permiso para quitar este acceso' using errcode = '42501'; end if;
  return jsonb_build_object('lote', v_lote, 'cambio', 'quitado', 'antes', v_actual);
end $$;

revoke all on function public.pdm_habilitar(uuid, text, text), public.pdm_deshabilitar(uuid, text) from public, anon;
grant execute on function public.pdm_habilitar(uuid, text, text), public.pdm_deshabilitar(uuid, text) to authenticated;

-- ─── 3. Quitar al principal cuando es la única asignación ───────────────────

create or replace function public.pdm_quitar(
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
  v_lote := pdm_privado.abrir_operacion('quitar', p_motivo);
  v_ids := pdm_privado.validar_indicadores(p_indicadores);
  if p_usuario is null then raise exception 'PDM: falta la persona' using errcode = '22023'; end if;

  foreach v_ind in array v_ids loop
    select * into v_fila from public.pdm_asignaciones where indicador_id = v_ind and usuario_id = p_usuario;
    if v_fila.id is null then n_iguales := n_iguales + 1; continue; end if;
    -- Al principal solo se le quita si es la ÚNICA asignación (el indicador vuelve a quedar sin responsable);
    -- si hay apoyos, se le reemplaza: así un indicador con asignaciones tiene siempre UN principal.
    if v_fila.principal and exists (select 1 from public.pdm_asignaciones where indicador_id = v_ind and usuario_id <> p_usuario) then
      raise exception 'PDM: no se quita al responsable principal mientras haya apoyos; asigna a otra persona como principal y esta pasará a apoyo' using errcode = '23514';
    end if;
    if v_fila.grupo_id is not null then
      raise exception 'PDM: esta persona viene de un grupo; quítala del grupo' using errcode = '23514';
    end if;
    delete from public.pdm_asignaciones where id = v_fila.id;
    n_quitados := n_quitados + 1;
  end loop;

  if n_quitados > 0 then
    perform pdm_privado.anotar_lote(v_lote, 'quitar', v_ids,
      jsonb_build_object('usuario_id', p_usuario, 'usuario_nombre', pdm_privado.nombre_de(p_usuario),
                         'quitados', n_quitados, 'sin_cambio', n_iguales));
  end if;
  return jsonb_build_object('lote', v_lote, 'quitados', n_quitados, 'sin_cambio', n_iguales);
end $$;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. Las siete funciones públicas: SECURITY INVOKER, search_path fijo, sin `anon` ni PUBLIC, con `authenticated`
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in
        ('pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar', 'pdm_habilitar', 'pdm_deshabilitar')
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 055: función mal protegida: %', v_malas; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
        ('pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar', 'pdm_habilitar', 'pdm_deshabilitar')) <> 7 then
    raise exception 'PDM 055: no quedan exactamente siete funciones públicas';
  end if;

  -- 2. Las ayudas de `pdm_privado` siguen sin ser invocables por PUBLIC ni por anon
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pdm_privado'
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    );
  if v_malas is not null then raise exception 'PDM 055: ayuda invocable de más: %', v_malas; end if;

  -- 3. La bitácora está enchufada en las cuatro tablas
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_asignaciones', 'pdm_asignaciones_auditar'), ('pdm_grupos', 'pdm_grupos_auditar'),
               ('pdm_grupos', 'pdm_grupos_auditar_borrado'), ('pdm_grupo_miembros', 'pdm_grupo_miembros_auditar'),
               ('pdm_permisos', 'pdm_permisos_auditar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 055: bitácora sin enchufar: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
--   begin;
--   drop trigger pdm_permisos_auditar on public.pdm_permisos;
--   drop function public.pdm_habilitar(uuid, text, text), public.pdm_deshabilitar(uuid, text);
--   -- recrear pdm_privado.auditar() y public.pdm_quitar con los cuerpos de la 052 (están en
--   -- 052_pdm_grupos_y_asignacion.sql)
--   commit;
--
-- Los permisos ya escritos se conservan: `pdm_permisos` no se toca.
