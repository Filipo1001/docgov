-- Migration 049: la fecha de pago de la planilla de seguridad social
--
-- POR QUÉ. El Ministerio de Salud responde si una planilla existe y fue
-- pagada, pero solo si se le pregunta con CUATRO datos: tipo de documento,
-- número de documento, número de planilla y fecha de pago. Así funciona la
-- validación del SECOP II —que consulta el SICOPI, del SISPRO— y así funciona
-- la consulta que el propio Ministerio pone a disposición de las entidades
-- públicas en cumplimiento del parágrafo 4 del artículo 50 de la Ley 789 de
-- 2002, adicionado por el artículo 24 del Decreto Ley 2106 de 2019.
--
-- De esos cuatro ya teníamos tres: el tipo y el número de documento viven en
-- `usuarios`, y el número de planilla en `periodos.numero_planilla`. Faltaba
-- la fecha de pago, que nunca se pidió pese a estar impresa en el mismo PDF
-- que el contratista ya sube.
--
-- QUÉ DESBLOQUEA. Sin ella, de los 455 números de planilla registrados en
-- producción no se puede comprobar ni uno solo contra la fuente: 341 tienen
-- diez dígitos, 106 tienen ocho y tres tienen veintiún caracteres, y nadie
-- puede decir cuáles corresponden a un pago real. Con ella, la pregunta queda
-- completa y la verificación pasa a ser posible.
--
-- POR QUÉ `date` Y NO `timestamptz`. Es la fecha impresa en el comprobante,
-- no un instante: un día civil sin hora ni zona. Guardarla con zona horaria
-- la haría cambiar de día según dónde se lea, y el Ministerio compara contra
-- un día exacto.
--
-- REGLA 2 de CLAUDE.md. Comprobado antes de escribir esto: `periodos` tiene
-- CERO columnas con ACL (frente a 19 de `usuarios`), así que una columna
-- nueva nace legible y no hace falta GRANT. La comprobación:
--   select count(*) filter (where attacl is not null) from pg_attribute
--   where attrelid = 'public.periodos'::regclass and attnum > 0
--     and not attisdropped;
--
-- NULLABLE A PROPÓSITO. Hay 750 periodos, 236 de ellos históricos, y ninguno
-- tiene este dato. Exigirlo en la base dejaría el histórico sin poder
-- escribirse. La obligatoriedad vive donde corresponde: en el envío del
-- informe, junto a la planilla y su número.
--
-- ORDEN DE DESPLIEGUE: esta migración va ANTES del código que lee la columna.

alter table public.periodos
  add column if not exists fecha_pago_planilla date;

comment on column public.periodos.fecha_pago_planilla is
  'Fecha en que se pagó la planilla de seguridad social, tal como aparece en '
  'el comprobante. Junto con el número de planilla y el documento del '
  'contratista forma la llave de cuatro datos con la que el Ministerio de '
  'Salud verifica el pago (art. 50 par. 4 Ley 789/2002).';
