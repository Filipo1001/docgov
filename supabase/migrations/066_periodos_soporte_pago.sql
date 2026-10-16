-- 066_periodos_soporte_pago.sql
--
-- Segundo documento de seguridad social por periodo: el SOPORTE DEL PAGO, junto a la planilla.
--
-- Hacienda pide los dos —la planilla y el comprobante de que se pagó— y hoy cada periodo guarda un solo archivo
-- (`planilla_ss_url`). Son dos documentos distintos que validan lo mismo, así que se revisan juntos (el estado de la
-- revisión sigue siendo `planilla_estado`, uno por periodo) y los dos van al paquete de SECOP, planilla primero.
--
-- Es una columna nueva y nada más: nullable, sin valor por defecto, sin tocar los 346 periodos que ya tienen planilla.
-- El código antiguo la ignora, así que esta migración se aplica ANTES de desplegar el código que la usa.
--
-- Permisos (regla 2 de CLAUDE.md): `periodos` conserva el SELECT a nivel de tabla, así que la columna nace legible por
-- `authenticated`. NO nace escribible por una sesión de usuario —desde la 065 solo seis columnas lo son— y no debe serlo:
-- el archivo se sube y se registra por el cliente administrador, igual que `planilla_ss_url` y `factura_electronica_url`.

alter table public.periodos add column if not exists soporte_pago_url text;

comment on column public.periodos.soporte_pago_url is
  'URL del soporte del pago de la seguridad social (bucket documentos). Segundo documento junto a planilla_ss_url; los dos se revisan juntos con planilla_estado.';
