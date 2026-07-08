-- Migration 029: policies RLS del rol 'contratacion'.
--
-- SOLO lectura: todas las mutaciones del rol pasan por server actions con el
-- admin client tras verificación de rol (mismo patrón del resto del sistema),
-- así que no se otorga INSERT/UPDATE/DELETE en ninguna tabla.
--
-- Cobertura: navegación de contratos y su detalle, vista de solo lectura de
-- periodos/informes, formulario de nuevo contrato (contratos_excel) y flujo
-- de importación (contratistas_importados). usuarios/dependencias/municipios
-- ya son legibles por authenticated.
--
-- Patrón (SELECT get_user_rol()) con initplan para evaluar una vez por query.

CREATE POLICY "contratos_contratacion_read" ON contratos
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "periodos_contratacion_read" ON periodos
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "obligaciones_contratacion_read" ON obligaciones
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "actividades_contratacion_read" ON actividades
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "evidencias_contratacion_read" ON evidencias
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "otrosies_contratacion_read" ON otrosies
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "obligacion_revisiones_contratacion_read" ON obligacion_revisiones
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "historial_contratacion_read" ON historial_periodos
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "preaprobaciones_contratacion_read" ON preaprobaciones
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "contratos_excel_contratacion_read" ON contratos_excel
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');

CREATE POLICY "importados_contratacion_read" ON contratistas_importados
  FOR SELECT USING ((SELECT get_user_rol()) = 'contratacion');
