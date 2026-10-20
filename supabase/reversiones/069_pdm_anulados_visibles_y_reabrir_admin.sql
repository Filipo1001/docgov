-- Reversión de la migración 069 (módulo Plan de Desarrollo: quien reportó ve su reporte anulado; solo el administrador reabre un aprobado).
--
-- Devuelve a como las dejó la 068: las políticas `pdm_reportes_select`, `pdm_anulaciones_select` y `pdm_evidencias_insert`, y las
-- funciones `preparar_validacion` y `pdm_validar`. Después de revertir, quien reportó vuelve a NO ver su reporte anulado, la
-- secretaría puede reabrir un aprobado otra vez y a un reporte anulado se le pueden agregar archivos mientras no tenga validaciones
-- (no hace falta correrla si solo se quiere volver atrás en la pantalla: el código nuevo sigue funcionando sin la 069, mostrando
-- menos). No toca datos. Se puede correr sin riesgo cuantas veces haga falta.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Las políticas, como las dejó la 068.
drop policy if exists pdm_reportes_select on public.pdm_reportes;
create policy pdm_reportes_select on public.pdm_reportes
  for select to authenticated
  using (
    exists (select 1 from public.pdm_indicadores i where i.id = pdm_reportes.indicador_id)
    and (
      (select public.get_user_rol()) = 'admin'
      or (select pdm_privado.mi_nivel()) = 'consulta'
      or not pdm_privado.anulado(pdm_reportes.id)
    )
  );

drop policy if exists pdm_anulaciones_select on public.pdm_anulaciones;
create policy pdm_anulaciones_select on public.pdm_anulaciones
  for select to authenticated
  using (
    (select public.get_user_rol()) = 'admin'
    or (select pdm_privado.mi_nivel()) = 'consulta'
  );

drop policy if exists pdm_evidencias_insert on public.pdm_evidencias;
create policy pdm_evidencias_insert on public.pdm_evidencias
  for insert to authenticated
  with check (
    subido_por = (select auth.uid())
    and exists (
      select 1 from public.pdm_reportes r
      where r.id = pdm_evidencias.reporte_id
        and r.autor_id = (select auth.uid())
        and not exists (select 1 from public.pdm_validaciones v where v.reporte_id = r.id)
    )
  );

-- Las dos funciones, como las dejó la 068.
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

-- Comprobación: ya no queda la regla de la 069 y lo anterior sigue en pie.
do $$
begin
  if exists (select 1 from pg_proc p where p.pronamespace in ('public'::regnamespace, 'pdm_privado'::regnamespace) and p.proname in ('pdm_validar', 'preparar_validacion') and p.prosrc like '%reabrir un reporte aprobado%') then
    raise exception 'Reversión 069: una función todavía reserva el reabrir al administrador';
  end if;
  if exists (select 1 from pg_policies where tablename = 'pdm_reportes' and policyname = 'pdm_reportes_select' and qual like '%autor_id%') then
    raise exception 'Reversión 069: la política de pdm_reportes todavía nombra al autor';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pdm_reportes' and policyname = 'pdm_reportes_select' and qual like '%anulado%')
     or (select count(*) from pg_policies where tablename = 'pdm_anulaciones') <> 2
     or not exists (select 1 from pg_policies where tablename = 'pdm_evidencias' and policyname = 'pdm_evidencias_insert') then
    raise exception 'Reversión 069: falta una política de la 068';
  end if;
end $$;

commit;
