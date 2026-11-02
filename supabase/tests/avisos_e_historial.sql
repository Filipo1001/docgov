-- ============================================================================
-- Vigilancia de la migración 083: los avisos y el historial no se pueden falsificar con una sesión.
--
-- SOLO LEE EL CATÁLOGO. No escribe nada y se puede correr en producción las veces que haga falta. Antes de aplicar la 083,
-- las comprobaciones de abajo salen `FALLA`: es lo esperado y es lo que la migración corrige.
--
-- Cómo se corre: pegarlo en el editor SQL de Supabase. Devuelve una fila por comprobación; todas deben decir `ok`.
-- La última fila resume: `N comprobaciones, 0 fallas`.
--
-- La prueba de comportamiento (una persona real intentando falsificar) se hizo en una transacción deshecha el 2-nov-2026;
-- se puede repetir con la misma técnica (DO con SET LOCAL ROLE y una excepción final que la deshace).
-- ============================================================================
with comprobaciones as (
  select 'notificaciones no tiene política de inserción' as comprobacion,
         not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notificaciones' and cmd = 'INSERT') as ok
  union all
  select 'historial_periodos tiene UNA política de inserción',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'historial_periodos' and cmd = 'INSERT') = 1
  union all
  select 'la inserción en historial_periodos exige que la fila sea de quien la escribe',
         coalesce((select with_check ilike '%auth.uid()%' and with_check ilike '%usuario_id%'
                     from pg_policies where schemaname = 'public' and tablename = 'historial_periodos' and cmd = 'INSERT' limit 1), false)
  union all
  select 'la inserción en historial_periodos exige un periodo visible para quien la escribe',
         coalesce((select with_check ilike '%periodos%'
                     from pg_policies where schemaname = 'public' and tablename = 'historial_periodos' and cmd = 'INSERT' limit 1), false)
  union all
  select 'la inserción en historial_periodos no es para anon',
         coalesce((select not ('anon' = any(roles::text[]) or 'public' = any(roles::text[]))
                     from pg_policies where schemaname = 'public' and tablename = 'historial_periodos' and cmd = 'INSERT' limit 1), false)
  union all
  -- La lectura y el marcar como leído siguen como estaban.
  select 'notificaciones sigue pudiéndose leer y actualizar por su dueño',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'notificaciones' and cmd in ('SELECT', 'UPDATE')) >= 2
)
select comprobacion, case when ok then 'ok' else 'FALLA' end as resultado from comprobaciones
union all
select count(*) || ' comprobaciones, ' || count(*) filter (where not ok) || ' fallas', ''
  from comprobaciones;
