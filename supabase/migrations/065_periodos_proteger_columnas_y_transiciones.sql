-- 065_periodos_proteger_columnas_y_transiciones.sql
--
-- SEG-03: una sesión de usuario ya no puede reescribir un periodo a su gusto.
--
-- El problema: las políticas `periodos_*_update_v2` limitan FILAS (el contratista del contrato, el supervisor del
-- contrato, el asesor de la dependencia), no ESTADOS ni COLUMNAS, y como las políticas se suman con OR, mandan sobre
-- las originales, que sí limitaban estados. El rol `authenticated` tenía UPDATE sobre las 34 columnas. Un contratista
-- podía, hablando directamente con la API, pasar su periodo a `aprobado`, cambiar `valor_cobro` o `numero_radicado`,
-- o tocar uno ya radicado (regla 3 de CLAUDE.md: un documento emitido no se reescribe).
--
-- Por qué es seguro cerrarlo: la aplicación escribe `periodos` con la sesión del usuario en 8 funciones de
-- `app/actions/periodos.ts` (enviarPeriodo, aprobarComoAsesor, rechazarComoAsesor, revocarPreaprobacion,
-- aprobarPeriodos, rechazarPeriodos, devolverPeriodoAContratista y revisarPlanilla), y entre las 8 solo tocan seis
-- columnas: estado, fecha_envio, motivo_rechazo, fecha_aprobacion, planilla_estado y planilla_comentario. Las otras 19
-- escrituras (radicar, valores, planilla, factura, histórico, devoluciones del administrador) van por el cliente
-- administrador (`service_role`), que no depende de estos permisos. Ninguna función de la base escribe en `periodos`
-- con los derechos de quien la llama (`aplicar_otrosi` y `eliminar_otrosi` solo la leen).
--
-- Dos capas, a propósito (como la 062):
--   1. Permisos por columna: lo normal. Impide tocar valores, radicado, URLs, fechas del periodo, histórico...
--   2. Disparador: la red de seguridad que decide QUÉ cambios de esas seis columnas valen. La tabla de transiciones
--      permitidas es la de las 8 funciones de arriba, por rol; un periodo radicado no lo cambia ninguna sesión, y uno
--      aprobado solo admite la revisión de la planilla. La decisión vive en dos funciones puras para poder probarla
--      sin simular a nadie: `periodos_transicion_permitida` y `periodos_cambio_no_permitido`.
--
-- NO toca los permisos de SELECT ni de INSERT/DELETE, ni las políticas RLS: quién es dueño del contrato sigue siendo
-- asunto de RLS. Tampoco afecta a `service_role` ni a las migraciones (el disparador solo actúa sobre `anon` y
-- `authenticated`).

-- 1. Permisos por columna -------------------------------------------------------------------------------
-- REVOKE a nivel de tabla quita también los permisos de UPDATE por columna.
revoke update on public.periodos from anon, authenticated;
grant update (estado, fecha_envio, motivo_rechazo, fecha_aprobacion, planilla_estado, planilla_comentario)
  on public.periodos to authenticated;

-- 2. Qué transiciones de estado vale cada rol --------------------------------------------------------------
-- Pura: no lee nada. Devuelve false también cuando de == a (eso no es una transición; lo trata la otra función).
create or replace function public.periodos_transicion_permitida(
  p_rol text, p_de public.estado_periodo, p_a public.estado_periodo
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    -- enviarPeriodo
    when p_rol in ('contratista', 'admin') and p_de in ('borrador', 'rechazado') and p_a = 'enviado' then true
    -- aprobarComoAsesor
    when p_rol in ('asesor', 'supervisor', 'admin') and p_de = 'enviado' and p_a = 'revision' then true
    -- rechazarComoAsesor y devolverPeriodoAContratista
    when p_rol in ('asesor', 'supervisor', 'admin') and p_de in ('enviado', 'revision') and p_a = 'rechazado' then true
    -- revocarPreaprobacion y rechazarPeriodos (devolver a los asesores)
    when p_rol in ('asesor', 'supervisor', 'admin') and p_de = 'revision' and p_a = 'enviado' then true
    -- aprobarPeriodos
    when p_rol in ('supervisor', 'admin') and p_de in ('enviado', 'revision') and p_a = 'aprobado' then true
    else false
  end
$$;

-- 3. Qué cambios de una fila valen -------------------------------------------------------------------------
-- Devuelve el motivo del rechazo, o null si el cambio vale. Pura salvo por `periodos_transicion_permitida`.
create or replace function public.periodos_cambio_no_permitido(
  p_rol text, p_old public.periodos, p_new public.periodos
) returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  -- Un periodo radicado ya se radicó en SECOP II: solo lo cambia el servidor (radicar, corregir el número).
  if p_old.estado = 'radicado' then
    return 'un periodo radicado no se modifica desde una sesión de usuario';
  end if;

  if p_new.estado is distinct from p_old.estado then
    if not public.periodos_transicion_permitida(p_rol, p_old.estado, p_new.estado) then
      return format('el rol %s no puede pasar un periodo de %s a %s',
                    coalesce(p_rol, '(sin rol)'), p_old.estado, p_new.estado);
    end if;
  elsif p_old.estado = 'aprobado' then
    -- Aprobado y sin cambio de estado: solo cabe la revisión de la planilla (que se comprueba más abajo).
    if p_new.motivo_rechazo   is distinct from p_old.motivo_rechazo
    or p_new.fecha_envio      is distinct from p_old.fecha_envio
    or p_new.fecha_aprobacion is distinct from p_old.fecha_aprobacion then
      return 'un periodo aprobado solo admite la revisión de la planilla';
    end if;
  end if;

  -- Las fechas acompañan a su transición: enviarPeriodo y aprobarPeriodos las escriben junto con el estado.
  if p_new.fecha_envio is distinct from p_old.fecha_envio
     and not (p_new.estado = 'enviado' and p_old.estado in ('borrador', 'rechazado')) then
    return 'la fecha de envío solo cambia al enviar el informe';
  end if;
  if p_new.fecha_aprobacion is distinct from p_old.fecha_aprobacion
     and not (p_new.estado = 'aprobado' and p_old.estado <> 'aprobado') then
    return 'la fecha de aprobación solo cambia al aprobar el informe';
  end if;

  -- La revisión de la planilla es una aprobación más: la hace quien revisa, con el informe ya enviado.
  if p_new.planilla_estado     is distinct from p_old.planilla_estado
  or p_new.planilla_comentario is distinct from p_old.planilla_comentario then
    if p_rol is null or p_rol not in ('asesor', 'supervisor', 'admin') then
      return 'la planilla solo la revisan asesores, secretarías y administradores';
    end if;
    if p_old.estado not in ('enviado', 'revision', 'aprobado') then
      return 'la planilla solo se revisa con el informe enviado, en revisión o aprobado';
    end if;
  end if;

  return null;
end;
$$;

-- 4. El disparador ------------------------------------------------------------------------------------------
-- `current_user` es el rol con el que PostgREST ejecuta la petición: `authenticated` o `anon` para una sesión de
-- usuario, `service_role` para el cliente administrador, `postgres` para migraciones y el editor SQL. La función
-- es SECURITY INVOKER, así que `current_user` es quien dispara el UPDATE.
create or replace function public.periodos_proteger_cambios()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_motivo text;
begin
  if current_user in ('anon', 'authenticated') then
    v_motivo := public.periodos_cambio_no_permitido(public.get_user_rol(), old, new);
    if v_motivo is not null then
      raise exception 'PERIODOS: %', v_motivo using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Una función de disparador no se llama por la API, pero se cierra igual (como `usuarios_proteger_columnas`).
-- Las dos funciones puras de arriba SÍ deben seguir siendo ejecutables: el disparador las llama con la sesión
-- del usuario, y no leen ni escriben nada.
revoke all on function public.periodos_proteger_cambios() from public, anon, authenticated;

drop trigger if exists periodos_proteger_cambios on public.periodos;
create trigger periodos_proteger_cambios
  before update on public.periodos
  for each row execute function public.periodos_proteger_cambios();
