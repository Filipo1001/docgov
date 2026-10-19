-- Migration 071: módulo Plan de Desarrollo — cifras AGREGADAS por secretaría y ritmo semanal (solo lectura)
--
-- POR QUÉ. El tablero del secretario de despacho (inicio del módulo para el nivel «secretaría») responde tres preguntas:
-- cómo va SU secretaría, cómo va el plan de la Alcaldía y cómo va su secretaría frente a las otras. Las dos últimas
-- necesitan cifras de indicadores que él no ve: por diseño (migración 050) una secretaría solo lee los indicadores de su
-- dependencia. Felipe decidió el 18-oct-2026 que se compartan CIFRAS AGREGADAS entre secretarías (nunca filas).
--
-- QUÉ SE AÑADE (nada de tablas, columnas, políticas ni permisos de tablas: solo lectura)
--
--   · `pdm_privado.cifras_por_secretaria()` (SECURITY DEFINER, esquema privado): una fila por secretaría y año del plan con
--     SOLO NÚMEROS: cuántos indicadores con meta, y de ellos cuántos están aprobados, sin validar, devueltos, por reportar,
--     sin responsable, cuántos alcanzaron la meta y cuántos van en avance. Ve toda la base (por eso es definer) y por eso
--     nunca se expone: no devuelve ni un nombre de indicador, de persona, de reporte ni de archivo.
--   · `public.pdm_cifras_por_secretaria()` (SECURITY INVOKER): la envoltura que sí se llama desde la aplicación. Exige ser
--     administrador, secretaría o Control Interno; quien solo responde por indicadores (nivel «responsable») no la recibe.
--   · `public.pdm_ritmo_semanal(desde)` (SECURITY INVOKER): cuántos reportes se enviaron y cuántos se aprobaron cada semana
--     (hora de Colombia, la semana empieza el lunes). Al ser invoker manda la seguridad por filas: una secretaría cuenta lo
--     de su dependencia; el administrador y Control Interno, todo.
--
-- LA REGLA: las cifras son LAS MISMAS que las del tablero del módulo (`cuentaDeAnio` en `lib/pdm/graficos.ts`), no otras.
-- Para un indicador con meta mayor que cero en un año que ya empezó (hora de Colombia):
--   · el reporte VIGENTE manda sobre todo: su estado (pendiente → sin validar, aprobado, devuelto) es el del indicador;
--   · sin reporte: «falta» si alguien lo lleva a cargo; si nadie, «sin responsable»;
--   · «alcanzó la meta»: su avance validado (el último aprobado) es igual o mayor que la meta; «en avance»: mayor que cero
--     y menor que la meta; «con avance»: tiene alguno validado (aunque sea cero). El avance validado cuenta aunque el último
--     reporte esté sin validar o devuelto. Sin ningún «con avance» el tablero dice «—» y no «0 %».
--   · Un año que no ha empezado cuenta sus indicadores con meta y nada más.
-- Lo anulado (migración 068) ya lo saltan las vistas `pdm_reportes_vigentes` y `pdm_avance_validado`.
--
-- NO TOCA nada de Contratista Digital. No cambia ninguna fila, columna, política ni permiso de tabla; no añade columnas
-- (regla 2 de CLAUDE.md: sin columnas nuevas no hay `GRANT` por columna que pensar).
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no queda
-- cumplido. Copia para revertir: supabase/reversiones/071_pdm_cifras_por_secretaria.sql. Prueba de punta a punta:
-- supabase/tests/pdm_cifras.sql.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. El cálculo, con permisos del dueño ────────────────────────────────────

create function pdm_privado.cifras_por_secretaria()
returns table (
  dependencia      text,
  anio             integer,
  con_meta         integer,
  aprobados        integer,
  por_validar      integer,
  devueltos        integer,
  faltan           integer,
  sin_responsable  integer,
  alcanzaron       integer,
  parciales        integer,
  con_avance       integer
)
language sql stable security definer set search_path = ''
as $$
  with plan as (
    select anio_inicio, anio_fin from public.pdm_planes where activo
  ),
  hoy as (
    select extract(year from (now() at time zone 'America/Bogota'))::integer as anio
  ),
  base as (
    select d.nombre as dependencia, i.id as indicador_id, m.anio, m.meta
    from public.pdm_indicadores i
    join public.dependencias d on d.id = i.dependencia_id
    join public.pdm_metas m on m.indicador_id = i.id and m.meta > 0
    cross join plan
    where i.activo and m.anio between plan.anio_inicio and plan.anio_fin
  ),
  calc as (
    select b.dependencia, b.anio, b.meta,
           b.anio <= (select anio from hoy) as iniciado,
           exists (select 1 from public.pdm_asignaciones a where a.indicador_id = b.indicador_id) as asignado,
           v.estado as vigente,
           av.valor as avance
    from base b
    left join public.pdm_reportes_vigentes v on v.indicador_id = b.indicador_id and v.anio = b.anio
    left join public.pdm_avance_validado av on av.indicador_id = b.indicador_id and av.anio = b.anio
  )
  select c.dependencia,
         c.anio,
         count(*)::integer,
         (count(*) filter (where c.iniciado and c.vigente = 'aprobado'))::integer,
         (count(*) filter (where c.iniciado and c.vigente = 'pendiente'))::integer,
         (count(*) filter (where c.iniciado and c.vigente = 'devuelto'))::integer,
         (count(*) filter (where c.iniciado and c.vigente is null and c.asignado))::integer,
         (count(*) filter (where c.iniciado and c.vigente is null and not c.asignado))::integer,
         (count(*) filter (where c.iniciado and c.avance is not null and c.avance >= c.meta))::integer,
         (count(*) filter (where c.iniciado and c.avance is not null and c.avance < c.meta and c.avance > 0))::integer,
         (count(*) filter (where c.iniciado and c.avance is not null))::integer
  from calc c
  group by c.dependencia, c.anio
  order by c.dependencia, c.anio
$$;

comment on function pdm_privado.cifras_por_secretaria() is
  'Cifras agregadas (solo números) por secretaría y año del plan, con las definiciones del tablero. Ve toda la base: no se expone; la llama public.pdm_cifras_por_secretaria().';

-- ─── 2. La envoltura que llama la aplicación ──────────────────────────────────

create function public.pdm_cifras_por_secretaria()
returns table (
  dependencia      text,
  anio             integer,
  con_meta         integer,
  aprobados        integer,
  por_validar      integer,
  devueltos        integer,
  faltan           integer,
  sin_responsable  integer,
  alcanzaron       integer,
  parciales        integer,
  con_avance       integer
)
language plpgsql stable security invoker set search_path = ''
as $f$
begin
  -- Quién la recibe: el administrador y los niveles que gestionan o consultan. Quien solo responde por indicadores, no.
  if not (
    coalesce((select public.get_user_rol()) = 'admin', false)
    or coalesce((select pdm_privado.mi_nivel()) in ('coordinador', 'consulta'), false)
  ) then
    raise exception 'PDM: no tienes acceso a la comparación entre secretarías' using errcode = '42501';
  end if;
  return query select * from pdm_privado.cifras_por_secretaria();
end $f$;

comment on function public.pdm_cifras_por_secretaria() is
  'Cifras agregadas por secretaría y año para el tablero del secretario. Solo números. Administrador, secretaría y Control Interno.';

-- ─── 3. El ritmo semanal, con la seguridad de quien pregunta ──────────────────

create function public.pdm_ritmo_semanal(p_desde date)
returns table (semana date, enviados integer, aprobados integer)
language sql stable security invoker set search_path = ''
as $$
  with e as (
    select date_trunc('week', r.created_at at time zone 'America/Bogota')::date as semana, count(*)::integer as n
    from public.pdm_reportes r
    where not pdm_privado.anulado(r.id)
      and (p_desde is null or (r.created_at at time zone 'America/Bogota')::date >= p_desde)
    group by 1
  ),
  a as (
    select date_trunc('week', v.created_at at time zone 'America/Bogota')::date as semana, count(*)::integer as n
    from public.pdm_validaciones v
    join public.pdm_reportes r on r.id = v.reporte_id
    where v.estado = 'aprobado' and not pdm_privado.anulado(r.id)
      and (p_desde is null or (v.created_at at time zone 'America/Bogota')::date >= p_desde)
    group by 1
  )
  select coalesce(e.semana, a.semana), coalesce(e.n, 0), coalesce(a.n, 0)
  from e full join a on a.semana = e.semana
  order by 1
$$;

comment on function public.pdm_ritmo_semanal(date) is
  'Reportes enviados y aprobados por semana (hora de Colombia, desde el lunes). Invoker: cada quien cuenta lo que la seguridad por filas le deja ver.';

-- ─── 4. Quién puede llamar ────────────────────────────────────────────────────

revoke all on function pdm_privado.cifras_por_secretaria() from public, anon;
revoke all on function public.pdm_cifras_por_secretaria() from public, anon;
revoke all on function public.pdm_ritmo_semanal(date) from public, anon;

-- La envoltura corre con la sesión de quien llama y entra al cálculo: necesita poder ejecutarlo (el esquema privado no se
-- expone por la API, así que esto no lo vuelve llamable desde fuera).
grant execute on function pdm_privado.cifras_por_secretaria() to authenticated;
grant execute on function public.pdm_cifras_por_secretaria() to authenticated;
grant execute on function public.pdm_ritmo_semanal(date) to authenticated;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. Las tres funciones existen, con ruta de búsqueda fija, sin PUBLIC ni anon, y con authenticated
  select string_agg(x.f, ', ') into v_malas
  from (values ('pdm_privado', 'cifras_por_secretaria'), ('public', 'pdm_cifras_por_secretaria'), ('public', 'pdm_ritmo_semanal')) x(s, f)
  where not exists (
    select 1 from pg_proc p
    where p.pronamespace = x.s::regnamespace and p.proname = x.f
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 071: función ausente o mal protegida: %', v_malas; end if;

  -- 2. Solo el cálculo es SECURITY DEFINER; las dos que llama la aplicación son INVOKER
  if not (select prosecdef from pg_proc where pronamespace = 'pdm_privado'::regnamespace and proname = 'cifras_por_secretaria') then
    raise exception 'PDM 071: el cálculo debe correr con permisos del dueño';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('pdm_cifras_por_secretaria', 'pdm_ritmo_semanal') and prosecdef) then
    raise exception 'PDM 071: las funciones públicas deben ser SECURITY INVOKER';
  end if;

  -- 3. La envoltura pide ser administrador o tener nivel de gestión/consulta
  if (select prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname = 'pdm_cifras_por_secretaria') not like '%get_user_rol()%'
     or (select prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname = 'pdm_cifras_por_secretaria') not like '%mi_nivel()%' then
    raise exception 'PDM 071: la envoltura no comprueba quién llama';
  end if;

  -- 4. El cálculo no devuelve nada que no sea número o el nombre de la secretaría (la primera columna, texto)
  if exists (
    select 1 from pg_proc p, unnest(p.proallargtypes) with ordinality as t(tipo, n)
    where p.pronamespace = 'pdm_privado'::regnamespace and p.proname = 'cifras_por_secretaria'
      and ((t.n = 1 and t.tipo <> 'text'::regtype) or (t.n > 1 and t.tipo <> 'int4'::regtype))) then
    raise exception 'PDM 071: el cálculo devuelve algo que no es un número';
  end if;
end $$;

commit;
