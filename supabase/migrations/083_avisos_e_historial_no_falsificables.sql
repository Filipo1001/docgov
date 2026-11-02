-- Migration 083: Contratista Digital — nadie con sesión puede falsificar avisos ni historial
--
-- QUÉ ARREGLA (auditoría del 2-nov-2026, SEG-06). Las políticas de inserción de `notificaciones` y `historial_periodos`
-- solo pedían «tener sesión»:
--   · cualquier persona con sesión podía crearle un aviso con el texto que quisiera a cualquier otra (aparece en su
--     campana como si lo hubiera mandado el sistema: es una vía de engaño dentro de la propia aplicación);
--   · cualquiera podía escribir una fila de historial a nombre de otra persona, sobre cualquier periodo. El historial es
--     lo que sustenta «quién hizo qué y cuándo» (PRODUCTO.md: «trazabilidad no alterable»).
-- Se comprobó en una transacción deshecha con una contratista real: antes ambas cosas se permitían; con esta migración,
-- se rechazan.
--
-- QUÉ HACE.
--   · `notificaciones`: se elimina la política de inserción. Ningún camino de la aplicación inserta avisos con la sesión
--     de una persona: `enviarNotificacion` y los procesos automáticos usan el cliente de servicio, que no pasa por estas
--     políticas. Leer y marcar como leído sigue como estaba.
--   · `historial_periodos`: se conserva la inserción con sesión (la aplicación registra cada acción de la persona con su
--     propia sesión), pero ahora exige que la fila sea A NOMBRE DE QUIEN LA ESCRIBE y que el periodo sea uno que esa
--     persona puede ver.
--
-- NADA CAMBIA PARA LO QUE SE USA HOY. Todas las llamadas a `insertHistorial` pasan el id del usuario en sesión; las
-- funciones de contratos que escriben historial (terminar_contrato, revertir_terminacion) se llaman con el cliente de
-- servicio. No hay filas existentes que tocar.
--
-- PARA REVERTIR: supabase/reversiones/083_avisos_e_historial_no_falsificables.sql.

drop policy if exists notificaciones_insert on public.notificaciones;

drop policy if exists historial_insert on public.historial_periodos;
create policy historial_insert on public.historial_periodos
  for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and exists (select 1 from public.periodos p where p.id = periodo_id)
  );
