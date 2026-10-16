-- REVERSIÓN de 065_periodos_proteger_columnas_y_transiciones.sql
--
-- ⚠ Reabre el hueco que la 065 cierra: vuelve a dejar que cualquier sesión de usuario cambie cualquier columna de
-- sus periodos (estado, valor_cobro, numero_radicado, URLs...), incluso los ya radicados, siempre que sean suyos
-- según las políticas RLS. Úsala solo si la 065 rompe un flujo legítimo y no se puede arreglar de forma más fina.
--
-- ANTES de revertir, prueba la salida corta:
--   · Si el síntoma es «permission denied for table periodos» o «permission denied for column X» al guardar algo que
--     la aplicación SÍ debe poder escribir con la sesión del usuario, basta con
--         grant update (esa_columna) on public.periodos to authenticated;
--     y la 065 sigue protegiendo el resto. Nunca concedas valor_cobro, numero_radicado, es_historico ni las URLs.
--   · Si el síntoma es «PERIODOS: el rol X no puede pasar un periodo de A a B» y esa transición es legítima, el arreglo
--     es añadirla a `periodos_transicion_permitida` (una línea en el `case`), no quitar el disparador.
--
-- Estado original de producción, verificado el 15-oct-2026 justo antes de aplicar la 065:
--   ACL de public.periodos = {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres,
--                             service_role=arwdDxtm/postgres}
--   es decir, UPDATE (la «w») a nivel de TABLA para anon y authenticated, no por columna.
--   Disparadores previos que se conservan: tr_periodos_updated y trg_prevent_historico_update.

drop trigger if exists periodos_proteger_cambios on public.periodos;
drop function if exists public.periodos_proteger_cambios();
drop function if exists public.periodos_cambio_no_permitido(text, public.periodos, public.periodos);
drop function if exists public.periodos_transicion_permitida(text, public.estado_periodo, public.estado_periodo);

revoke update (estado, fecha_envio, motivo_rechazo, fecha_aprobacion, planilla_estado, planilla_comentario)
  on public.periodos from authenticated;                          -- los permisos por columna que añadió la 065
grant update on public.periodos to anon, authenticated;           -- el permiso por tabla original
