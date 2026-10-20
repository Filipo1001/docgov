-- Migration 069: módulo Plan de Desarrollo — quien reportó ve su reporte anulado (y el motivo); solo el administrador reabre un aprobado
--
-- POR QUÉ. Dos decisiones de Felipe (18-oct-2026) sobre lo que dejó la 068:
--
--   1. «Reabrir» un reporte aprobado (devolverlo) es del administrador, por ahora. Hasta hoy también podía la secretaría
--      (la base solo pedía no ser el autor y no haber un reporte más nuevo), y un aprobado cuenta en el cumplimiento:
--      deshacerlo es una decisión de quien ve el conjunto.
--   2. Quien reportó SÍ ve «tu reporte fue anulado: motivo». La 068 le escondía todo; eso dejaba su reporte desaparecer
--      sin explicación.
--
-- QUÉ CAMBIA
--
--   · `pdm_validar` y su disparador `preparar_validacion`: devolver un reporte cuya última validación es «aprobado» solo
--     lo puede hacer el administrador. Aprobar y devolver lo PENDIENTE sigue igual para la secretaría. El disparador es
--     la barrera real; la función solo avisa antes y con su frase.
--   · `pdm_reportes_select`: además del administrador y Control Interno, ve un reporte anulado QUIEN LO REPORTÓ (esa
--     versión, no las de otras personas). Las evidencias y validaciones de ese reporte las hereda por esta política.
--   · `pdm_anulaciones_select`: además, quien reportó lee las anulaciones de SUS reportes (el motivo y quién lo anuló).
--   · `pdm_evidencias_insert`: no se agregan archivos a un reporte anulado. Antes no hacía falta (quien reportó no lo veía,
--     así que la política no lo encontraba); ahora que lo ve, hay que decirlo: un reporte anulado sin validar seguiría
--     aceptando archivos de su autor.
--
-- NO CAMBIA: la secretaría sigue sin ver nada anulado; nadie salvo el administrador anula ni restaura; las vistas y las
-- funciones de reportar siguen saltándose lo anulado (cada una lo dice explícitamente, no depende de la política).
--
-- No toca datos, tablas, columnas ni permisos de tablas; solo tres políticas y dos funciones (mismas firmas). Va en una
-- transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no queda cumplido.
-- Copia para revertir: supabase/reversiones/069_…; prueba de punta a punta: supabase/tests/pdm_anular_reportes.sql.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. Quién ve un reporte anulado ───────────────────────────────────────────

drop policy pdm_reportes_select on public.pdm_reportes;

create policy pdm_reportes_select on public.pdm_reportes
  for select to authenticated
  using (
    exists (select 1 from public.pdm_indicadores i where i.id = pdm_reportes.indicador_id)
    and (
      (select public.get_user_rol()) = 'admin'
      or (select pdm_privado.mi_nivel()) = 'consulta'
      or pdm_reportes.autor_id = (select auth.uid())
      or not pdm_privado.anulado(pdm_reportes.id)
    )
  );

drop policy pdm_anulaciones_select on public.pdm_anulaciones;

create policy pdm_anulaciones_select on public.pdm_anulaciones
  for select to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or (select pdm_privado.mi_nivel()) = 'consulta'
    or exists (
      select 1 from public.pdm_reportes r
      where r.id = pdm_anulaciones.reporte_id and r.autor_id = (select auth.uid())
    )
  );

-- A un reporte anulado no se le agregan archivos (su autor ahora lo ve).
drop policy pdm_evidencias_insert on public.pdm_evidencias;

create policy pdm_evidencias_insert on public.pdm_evidencias
  for insert to authenticated
  with check (
    subido_por = (select auth.uid())
    and exists (
      select 1 from public.pdm_reportes r
      where r.id = pdm_evidencias.reporte_id
        and r.autor_id = (select auth.uid())
        and not pdm_privado.anulado(r.id)
        and not exists (select 1 from public.pdm_validaciones v where v.reporte_id = r.id)
    )
  );

-- ─── 2. Reabrir un aprobado: solo el administrador ────────────────────────────
--
-- Mismas firmas y mismo cuerpo que la 068; cambia solo la regla nueva (marcada).

create or replace function pdm_privado.preparar_validacion()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  x jsonb;
  v_id uuid;
  v_vistos uuid[] := '{}';
begin
  NEW.validador_nombre := coalesce(pdm_privado.nombre_de(NEW.validador_id), NEW.validador_nombre);
  NEW.created_at := clock_timestamp();
  if pdm_privado.anulado(NEW.reporte_id) then
    raise exception 'PDM: este reporte fue anulado; ya no se valida' using errcode = '23514';
  end if;
  if exists (select 1 from public.pdm_reportes c where c.corrige_a = NEW.reporte_id and not pdm_privado.anulado(c.id)) then
    raise exception 'PDM: este reporte ya fue corregido; valida la versión más reciente' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.pdm_reportes r1
    join public.pdm_reportes r2 on r2.indicador_id = r1.indicador_id and r2.anio = r1.anio
                               and (r2.created_at, r2.id) > (r1.created_at, r1.id)
    where r1.id = NEW.reporte_id and not pdm_privado.anulado(r2.id)
  ) then
    raise exception 'PDM: hay un reporte más reciente de este indicador en este año; valida el más reciente' using errcode = '23514';
  end if;

  -- Reabrir (devolver un reporte que está APROBADO) es del administrador.
  if NEW.estado = 'devuelto'
     and (select v.estado from public.pdm_validaciones v where v.reporte_id = NEW.reporte_id order by v.created_at desc, v.id desc limit 1) = 'aprobado'
     and (select public.get_user_rol()) is distinct from 'admin' then
    raise exception 'PDM: solo el administrador puede reabrir un reporte aprobado' using errcode = '42501';
  end if;

  if jsonb_array_length(NEW.observaciones) > 0 then
    if NEW.estado <> 'devuelto' then
      raise exception 'PDM: solo se observan archivos al devolver un reporte' using errcode = '23514';
    end if;
    for x in select value from jsonb_array_elements(NEW.observaciones) loop
      if jsonb_typeof(x) is distinct from 'object'
         or coalesce(x->>'evidencia', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or coalesce(btrim(x->>'motivo'), '') = '' or char_length(x->>'motivo') > 300 then
        raise exception 'PDM: escribe qué le pasa a cada archivo que devuelves (hasta 300 caracteres)' using errcode = '22023';
      end if;
      v_id := (x->>'evidencia')::uuid;
      if v_id = any(v_vistos) then
        raise exception 'PDM: un archivo está observado dos veces' using errcode = '22023';
      end if;
      v_vistos := v_vistos || v_id;
      if not exists (select 1 from public.pdm_evidencias e where e.id = v_id and e.reporte_id = NEW.reporte_id) then
        raise exception 'PDM: un archivo observado no es de este reporte' using errcode = '23514';
      end if;
    end loop;
  end if;
  return NEW;
end $f$;

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
  if jsonb_array_length(v_obs) > 5 then raise exception 'PDM: un reporte tiene como máximo 5 archivos' using errcode = '22023'; end if;

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

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. Las políticas dicen lo que prometen
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pdm_reportes' and policyname = 'pdm_reportes_select'
                 and qual like '%anulado%' and qual like '%autor_id%') then
    raise exception 'PDM 069: la política de lectura de pdm_reportes no deja ver al autor su reporte anulado';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pdm_anulaciones' and policyname = 'pdm_anulaciones_select'
                 and qual like '%autor_id%') then
    raise exception 'PDM 069: la política de lectura de pdm_anulaciones no deja leer al autor las anulaciones de sus reportes';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pdm_anulaciones') <> 2 then
    raise exception 'PDM 069: pdm_anulaciones no tiene exactamente sus dos políticas';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pdm_evidencias' and policyname = 'pdm_evidencias_insert'
                 and with_check like '%anulado%') then
    raise exception 'PDM 069: se podrían agregar archivos a un reporte anulado';
  end if;

  -- 2. Reabrir es del administrador, en la función y en el disparador
  select string_agg(x.f, ', ') into v_malas
  from (values ('pdm_validar'), ('preparar_validacion')) x(f)
  where not exists (
    select 1 from pg_proc p
    where p.proname = x.f and p.pronamespace in ('public'::regnamespace, 'pdm_privado'::regnamespace)
      and p.prosrc like '%reabrir un reporte aprobado%' and p.prosrc like '%get_user_rol()%' and p.prosrc like '%anulado%');
  if v_malas is not null then raise exception 'PDM 069: función que no reserva el reabrir al administrador: %', v_malas; end if;

  -- 3. Las funciones siguen sin PUBLIC ni anon y los disparadores enchufados
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.pronamespace in ('public'::regnamespace, 'pdm_privado'::regnamespace) and p.proname in ('pdm_validar', 'preparar_validacion')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 069: función invocable de más: %', v_malas; end if;
  if not has_function_privilege('authenticated', 'public.pdm_validar(uuid,text,text,jsonb)', 'EXECUTE') then
    raise exception 'PDM 069: authenticated perdió pdm_validar';
  end if;
  select string_agg(x.t, ', ') into v_malas
  from (values ('pdm_validaciones', 'pdm_validaciones_preparar')) x(tabla, t)
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = ('public.' || x.tabla)::regclass and g.tgname = x.t and g.tgenabled = 'O' and not g.tgisinternal);
  if v_malas is not null then raise exception 'PDM 069: disparador sin enchufar: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/069_pdm_anulados_visibles_y_reabrir_admin.sql: devuelve las tres
-- políticas y las dos funciones a como las dejó la 068.
