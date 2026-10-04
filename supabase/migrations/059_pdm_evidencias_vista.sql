-- Migration 059: módulo Plan de Desarrollo — la vista para recorrer las evidencias
--
-- POR QUÉ. Cada archivo solo se podía abrir desde la ficha de su indicador. Quien supervisa o audita necesita
-- recorrer TODO lo subido —por año, por secretaría, por tipo, por estado— sin entrar indicador por indicador. Esta
-- vista junta, en una fila por archivo, lo que hace falta para pintar esa lista: el archivo, su reporte, su
-- indicador y su secretaría, en qué estado va el reporte, si el archivo fue devuelto (y con qué nota), si se
-- conservó de la versión anterior y si esa versión ya fue reemplazada por una corrección.
--
-- LO QUE NO CAMBIA. Quién ve qué lo siguen decidiendo las políticas de las tablas de siempre: la vista corre con
-- los permisos de quien pregunta (`security_invoker`). Un responsable ve los archivos de sus indicadores, una
-- secretaría los de su dependencia, Control Interno y el administrador todo. Abrir un archivo sigue pasando por el
-- servidor, que firma un enlace de cinco minutos solo si quien pide ve la evidencia.
--
-- Solo agrega una vista: no toca tablas, columnas, políticas ni funciones, ni nada de Contratista Digital.
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no
-- queda cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create view public.pdm_evidencias_vista with (security_invoker = true) as
select
  e.id,
  e.reporte_id,
  e.nombre,
  e.tipo,
  e.bytes,
  (e.copia_de is not null) as conservada,
  r.indicador_id,
  i.fila_origen as indicador_fila,
  i.codigo,
  i.indicador,
  i.sector,
  d.nombre as dependencia,
  r.anio,
  r.valor,
  r.autor_nombre,
  r.created_at as reportado_en,
  coalesce(v.estado, 'pendiente') as estado_reporte,
  -- La versión de este reporte ya fue reemplazada por una corrección: el archivo es historia (si se conservó, su copia está en la nueva).
  exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id) as reemplazada,
  -- La nota más reciente con que la secretaría devolvió ESTE archivo, si lo devolvió.
  (select o->>'motivo'
     from public.pdm_validaciones x cross join lateral jsonb_array_elements(x.observaciones) o
    where x.reporte_id = r.id and o->>'evidencia' = e.id::text
    order by x.created_at desc, x.id desc limit 1) as observacion
from public.pdm_evidencias e
join public.pdm_reportes r on r.id = e.reporte_id
join public.pdm_indicadores i on i.id = r.indicador_id
join public.dependencias d on d.id = i.dependencia_id
left join lateral (
  select x.estado from public.pdm_validaciones x
  where x.reporte_id = r.id order by x.created_at desc, x.id desc limit 1
) v on true;

comment on view public.pdm_evidencias_vista is
  'Una fila por archivo de evidencia, con su reporte, su indicador y su estado. Corre con los permisos de quien pregunta.';

revoke all on public.pdm_evidencias_vista from public, anon, authenticated;
grant select on public.pdm_evidencias_vista to authenticated;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  if not exists (select 1 from pg_class c where c.oid = 'public.pdm_evidencias_vista'::regclass and 'security_invoker=true' = any(c.reloptions)) then
    raise exception 'PDM 059: la vista no respeta los permisos de quien pregunta';
  end if;
  select string_agg(p, ', ') into v_malas
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where has_table_privilege('anon', 'public.pdm_evidencias_vista', p)
     or (p <> 'SELECT' and has_table_privilege('authenticated', 'public.pdm_evidencias_vista', p))
     or (p = 'SELECT' and not has_table_privilege('authenticated', 'public.pdm_evidencias_vista', p));
  if v_malas is not null then raise exception 'PDM 059: permisos incorrectos en la vista: %', v_malas; end if;
  -- Las demás vistas del módulo siguen como estaban.
  select string_agg(c.relname, ', ') into v_malas
  from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relname in ('pdm_reportes_vigentes', 'pdm_avance_validado', 'pdm_evidencias_vista')
    and not coalesce('security_invoker=true' = any(c.reloptions), false);
  if v_malas is not null then raise exception 'PDM 059: vista que no respeta los permisos de quien pregunta: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
--   drop view public.pdm_evidencias_vista;
