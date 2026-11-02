-- Reversión de la migración 083: vuelve a las políticas anteriores (cualquier sesión puede insertar).
-- Solo tiene sentido si algún camino legítimo que inserta con sesión se rompió; lo normal es corregir ese camino.
drop policy if exists historial_insert on public.historial_periodos;
create policy historial_insert on public.historial_periodos
  for insert to public
  with check ((select auth.role()) = 'authenticated');

create policy notificaciones_insert on public.notificaciones
  for insert to public
  with check ((select auth.role()) = 'authenticated');
