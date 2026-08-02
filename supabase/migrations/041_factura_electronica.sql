-- 041 — Factura electrónica del periodo
--
-- Para los contratistas obligados a facturar electrónicamente, la Cuenta de
-- Cobro no se genera: la sustituye el PDF de su factura, que ellos adjuntan.
--
-- La columna vive en `periodos` y no en `documentos_adjuntos` porque es
-- exactamente el mismo caso que la planilla de seguridad social: un archivo
-- único por periodo, subido por el contratista, que los ZIP de descarga leen
-- directamente. Reutilizar ese patrón evita que las cuatro rutas de descarga
-- tengan que aprender un modelo nuevo.
ALTER TABLE periodos
  ADD COLUMN IF NOT EXISTS factura_electronica_url text;

COMMENT ON COLUMN periodos.factura_electronica_url IS
  'PDF de la factura electrónica, en el bucket `documentos`. Solo para contratistas con usuarios.obligado_facturar_electronicamente = true; sustituye a la Cuenta de Cobro.';
