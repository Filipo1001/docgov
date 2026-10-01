-- Migration 053: módulo Plan de Desarrollo — grupos con líder opcional y con descripción
--
-- DOS CAMBIOS PEDIDOS POR EL ADMINISTRADOR, sobre lo que añadió la 052:
--
--   1. DESCRIPCIÓN. `pdm_grupos.descripcion`: un texto de hasta 500 caracteres, opcional.
--      No hace falta tocar la bitácora: el disparador ya guarda la fila entera del grupo
--      (antes y después), así que un cambio de descripción queda anotado sin más.
--
--   2. LÍDER OPCIONAL. En la 052 el líder era obligatorio porque él era el responsable
--      principal de lo que el grupo llevara. Ahora un grupo puede no tenerlo, y entonces:
--        · al asignarlo a un indicador, el grupo entra solo como APOYO y el principal sigue
--          siendo quien ya era (por ejemplo, el secretario). No se le quita a nadie;
--        · por lo mismo, un grupo sin líder NO puede entrar a un indicador que no tenga ya un
--          principal: se rechaza con un mensaje claro. La regla de la 052 se mantiene —un
--          indicador con asignaciones tiene siempre UN principal—;
--        · si un grupo que sostenía el principal de un indicador se queda sin líder, ese
--          principal NO se mueve: sigue siendo quien era. Y si esa persona sale después del
--          grupo, conserva el principal pero deja de figurar «del grupo»: el indicador nunca se
--          queda sin principal por editar un grupo;
--        · con líder todo funciona exactamente como en la 052.
--      Lo que sí sigue siendo obligatorio es que un grupo tenga al menos una persona.
--
-- QUÉ SE REEMPLAZA. `pdm_asignar_grupo` y `pdm_privado.sincronizar_grupo` conservan su firma
-- (se reemplazan en su sitio, con sus permisos). `pdm_grupo_guardar` gana un parámetro
-- (`p_descripcion`), y una función con otra firma es otra función: se borra la de seis
-- argumentos y se crea la de siete, con los mismos permisos que la 052 (solo `authenticated`,
-- SECURITY INVOKER, `search_path` fijo). Dejar las dos haría ambigua la llamada por RPC.
--
-- LO QUE NO TOCA. Nada de Contratista Digital. Solo `pdm_grupos` (una columna nueva) y funciones
-- del módulo. La 052 sigue siendo la fuente del resto (bitácora, políticas, otras funciones).
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo
-- de lo prometido no queda cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. La descripción ──────────────────────────────────────────────────────

alter table public.pdm_grupos
  add column descripcion text check (descripcion is null or (btrim(descripcion) <> '' and char_length(descripcion) <= 500));

comment on column public.pdm_grupos.descripcion is 'Para qué existe el grupo (opcional, hasta 500 caracteres).';

-- ─── 2. Asignar un grupo, con o sin líder ───────────────────────────────────

create or replace function public.pdm_asignar_grupo(
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
  v_sin_principal int;
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
  if v_n_miembros = 0 then
    raise exception 'PDM: el grupo no tiene personas; no se le pueden asignar indicadores' using errcode = '23514';
  end if;
  select count(*) into v_fuera from public.pdm_indicadores where id = any(v_ids) and dependencia_id <> v_dep;
  if v_fuera > 0 then
    raise exception 'PDM: un grupo solo trabaja en los indicadores de su secretaría (% de otra)', v_fuera using errcode = '23514';
  end if;
  -- Sin líder el grupo entra como apoyo: cada indicador necesita ya a su principal.
  if v_lider is null then
    select count(*) into v_sin_principal from public.pdm_indicadores i
      where i.id = any(v_ids) and not exists (select 1 from public.pdm_asignaciones a where a.indicador_id = i.id and a.principal);
    if v_sin_principal > 0 then
      raise exception 'PDM: un grupo sin líder entra como apoyo y % indicador(es) no tienen responsable principal; asigna primero al principal', v_sin_principal using errcode = '23514';
    end if;
  end if;
  v_yo_nombre := pdm_privado.nombre_de(v_yo);

  foreach v_ind in array v_ids loop
    select * into v_actual from public.pdm_asignaciones where indicador_id = v_ind and principal;

    if v_lider is null then
      -- ¿Cada miembro ya está, con la marca del grupo o como el principal del indicador?
      select not exists (
        select 1 from public.pdm_grupo_miembros gm
        where gm.grupo_id = p_grupo
          and not exists (select 1 from public.pdm_asignaciones a
                          where a.indicador_id = v_ind and a.usuario_id = gm.usuario_id and (a.grupo_id = p_grupo or a.principal)))
        into v_ya_esta;
      if v_ya_esta then n_iguales := n_iguales + 1; continue; end if;

      for m in select usuario_id from public.pdm_grupo_miembros where grupo_id = p_grupo order by usuario_id loop
        select * into v_fila from public.pdm_asignaciones where indicador_id = v_ind and usuario_id = m.usuario_id;
        if v_fila.id is null then
          insert into public.pdm_asignaciones (indicador_id, usuario_id, principal, grupo_id, asignado_por, asignado_por_nombre)
          values (v_ind, m.usuario_id, false, p_grupo, v_yo, v_yo_nombre);
        elsif not v_fila.principal and v_fila.grupo_id is distinct from p_grupo then
          update public.pdm_asignaciones
            set grupo_id = p_grupo, asignado_por = v_yo, asignado_por_nombre = v_yo_nombre
            where id = v_fila.id;
        end if;  -- si es el principal no se toca: el grupo lo apoya, no lo sostiene
      end loop;
      n_cambiados := n_cambiados + 1;
      continue;
    end if;

    -- Con líder: como en la 052. El líder queda principal y los demás, de apoyo.
    select (v_actual.usuario_id = v_lider)
       and not exists (
         select 1 from public.pdm_grupo_miembros gm
         where gm.grupo_id = p_grupo
           and not exists (select 1 from public.pdm_asignaciones a
                           where a.indicador_id = v_ind and a.usuario_id = gm.usuario_id and a.grupo_id = p_grupo))
      into v_ya_esta;
    if coalesce(v_ya_esta, false) then n_iguales := n_iguales + 1; continue; end if;

    if v_actual.id is not null and v_actual.usuario_id <> v_lider then
      if exists (select 1 from public.pdm_grupo_miembros where grupo_id = p_grupo and usuario_id = v_actual.usuario_id) then
        update public.pdm_asignaciones set principal = false where id = v_actual.id;
        n_demotados := n_demotados + 1;
      elsif p_anterior = 'quitar' then
        delete from public.pdm_asignaciones where id = v_actual.id;
        n_quitados := n_quitados + 1;
      else
        update public.pdm_asignaciones set principal = false where id = v_actual.id;
        n_demotados := n_demotados + 1;
      end if;
    end if;

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

-- ─── 3. Sincronizar un grupo con sus indicadores ────────────────────────────
--
-- Igual que en la 052, más una regla: si el grupo NO tiene líder, quien sale del grupo siendo el
-- principal que el grupo sostenía conserva el principal, pero ya no «del grupo» (se le quita la
-- marca). Sin esto, editar un grupo dejaría indicadores sin principal.

create or replace function pdm_privado.sincronizar_grupo(p_grupo uuid) returns void
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

    if v_lider is null then
      update public.pdm_asignaciones a set grupo_id = null
        where a.indicador_id = v_ind and a.grupo_id = p_grupo and a.principal
          and not exists (select 1 from public.pdm_grupo_miembros m where m.grupo_id = p_grupo and m.usuario_id = a.usuario_id);
    end if;

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

-- ─── 4. Guardar un grupo: líder opcional y descripción ──────────────────────

drop function public.pdm_grupo_guardar(uuid, text, uuid, uuid, uuid[], text);

create function public.pdm_grupo_guardar(
  p_grupo        uuid,
  p_nombre       text,
  p_dependencia  uuid,
  p_lider        uuid,
  p_miembros     uuid[],
  p_motivo       text default null,
  p_descripcion  text default null
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
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_miembros uuid[];
  v_validos int;
  v_dep_actual uuid;
begin
  perform pdm_privado.abrir_operacion(case when p_grupo is null then 'grupo_crear' else 'grupo_editar' end, p_motivo);
  if v_nombre = '' then raise exception 'PDM: el grupo necesita un nombre' using errcode = '22023'; end if;
  if p_dependencia is null then raise exception 'PDM: el grupo necesita una secretaría' using errcode = '22023'; end if;
  if v_desc is not null and char_length(v_desc) > 500 then
    raise exception 'PDM: la descripción no puede pasar de 500 caracteres' using errcode = '22001';
  end if;

  -- El líder, si hay, se cuenta entre los miembros aunque no venga en la lista.
  select array_agg(distinct x) into v_miembros from unnest(coalesce(p_miembros, '{}'::uuid[]) || p_lider) x where x is not null;
  if v_miembros is null or cardinality(v_miembros) = 0 then
    raise exception 'PDM: el grupo necesita al menos una persona' using errcode = '22023';
  end if;
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
    insert into public.pdm_grupos (plan_id, dependencia_id, nombre, descripcion, creado_por, creado_por_nombre)
    values (v_plan, p_dependencia, v_nombre, v_desc, v_yo, v_yo_nombre)
    returning id into v_grupo;
  else
    select dependencia_id into v_dep_actual from public.pdm_grupos where id = v_grupo;
    if v_dep_actual is null then raise exception 'PDM: el grupo no existe o no tienes acceso a él' using errcode = '42501'; end if;
    if v_dep_actual <> p_dependencia and exists (select 1 from public.pdm_asignaciones where grupo_id = v_grupo) then
      raise exception 'PDM: el grupo ya tiene indicadores asignados; no se le puede cambiar de secretaría' using errcode = '23514';
    end if;
    update public.pdm_grupos set nombre = v_nombre, dependencia_id = p_dependencia, descripcion = v_desc
      where id = v_grupo
        and (nombre is distinct from v_nombre or dependencia_id is distinct from p_dependencia or descripcion is distinct from v_desc);
  end if;

  -- Membresía: salen los que ya no están, entran los nuevos, y el líder (si hay) se fija sin chocar con el índice.
  delete from public.pdm_grupo_miembros where grupo_id = v_grupo and not (usuario_id = any(v_miembros));
  insert into public.pdm_grupo_miembros (grupo_id, usuario_id, es_lider, agregado_por)
    select v_grupo, u, false, v_yo from unnest(v_miembros) u
    where not exists (select 1 from public.pdm_grupo_miembros m where m.grupo_id = v_grupo and m.usuario_id = u);
  update public.pdm_grupo_miembros set es_lider = false
    where grupo_id = v_grupo and es_lider and (p_lider is null or usuario_id <> p_lider);
  if p_lider is not null then
    update public.pdm_grupo_miembros set es_lider = true where grupo_id = v_grupo and usuario_id = p_lider and not es_lider;
  end if;

  if p_grupo is not null then perform pdm_privado.sincronizar_grupo(v_grupo); end if;
  return v_grupo;
end $$;

revoke all on function public.pdm_grupo_guardar(uuid, text, uuid, uuid, uuid[], text, text) from public, anon;
grant execute on function public.pdm_grupo_guardar(uuid, text, uuid, uuid, uuid[], text, text) to authenticated;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. La columna existe y es opcional
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'pdm_grupos' and column_name = 'descripcion' and is_nullable = 'YES') then
    raise exception 'PDM 053: falta la columna descripcion';
  end if;

  -- 2. Una sola versión de cada función, y todas bien protegidas
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'pdm_grupo_guardar') <> 1 then
    raise exception 'PDM 053: hay más de una versión de pdm_grupo_guardar';
  end if;
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in
        ('pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar')
    and (p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 053: función mal protegida: %', v_malas; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
        ('pdm_asignar', 'pdm_quitar', 'pdm_asignar_grupo', 'pdm_grupo_guardar', 'pdm_grupo_eliminar')) <> 5 then
    raise exception 'PDM 053: no quedan exactamente cinco funciones públicas';
  end if;

  -- 3. Las ayudas de `pdm_privado` siguen sin ser invocables por PUBLIC ni por anon
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pdm_privado'
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    );
  if v_malas is not null then raise exception 'PDM 053: ayuda invocable de más: %', v_malas; end if;

  -- 4. La bitácora sigue enchufada
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_asignaciones', 'pdm_asignaciones_auditar'), ('pdm_grupos', 'pdm_grupos_auditar'),
               ('pdm_grupos', 'pdm_grupos_auditar_borrado'), ('pdm_grupo_miembros', 'pdm_grupo_miembros_auditar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 053: bitácora sin enchufar: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Volver a la 052 es volver a crear sus tres funciones (están en 052_pdm_grupos_y_asignacion.sql) y
-- quitar la columna. Antes hay que asegurarse de que ningún grupo está sin líder, porque la 052 no
-- lo admite:
--
--   begin;
--   -- (comprobar) select count(*) from public.pdm_grupos g
--   --   where not exists (select 1 from public.pdm_grupo_miembros m where m.grupo_id = g.id and m.es_lider);  -- debe ser 0
--   drop function public.pdm_grupo_guardar(uuid, text, uuid, uuid, uuid[], text, text);
--   -- recrear pdm_grupo_guardar(uuid,text,uuid,uuid,uuid[],text), pdm_asignar_grupo y
--   -- pdm_privado.sincronizar_grupo con los cuerpos de la 052 + sus revoke/grant
--   alter table public.pdm_grupos drop column descripcion;
--   commit;
