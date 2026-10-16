-- REVERSIÓN de 066_periodos_soporte_pago.sql
--
-- ⚠ Borra la columna y, con ella, la referencia a cada soporte de pago ya subido. Los ARCHIVOS quedan en el bucket
-- `documentos` (carpeta `soportes-pago/`), huérfanos y privados; no se pierden, pero nada los apunta. Úsala solo si
-- el código que la usa ya se retiró: con ese código desplegado, esta columna es lo que lee el paquete de SECOP.
--
-- Estado original: la columna no existía. Los periodos y su planilla (`planilla_ss_url`) no se ven afectados.

alter table public.periodos drop column if exists soporte_pago_url;
