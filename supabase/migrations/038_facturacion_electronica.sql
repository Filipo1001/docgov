-- 038 — Persona obligada a facturar electrónicamente
--
-- Se registra desde ahora aunque la lógica que lo consume llegue después. El
-- comportamiento previsto:
--   · No obligado → el sistema sigue generando la Cuenta de Cobro.
--   · Obligado    → no se genera Cuenta de Cobro; el contratista adjunta el
--                   PDF de su factura electrónica.
--
-- Vive en `usuarios` y no en `contratos` porque la obligación de facturar es
-- una condición de la PERSONA ante la DIAN (régimen, responsabilidades del
-- RUT), no de cada contrato que firme: quien está obligado lo está para todos.
--
-- NULL ≠ false a propósito: false significa "se verificó y no está obligado";
-- NULL significa "todavía no se ha preguntado". Los 116 contratistas ya
-- cargados quedan en NULL, y así se pueden distinguir de los nuevos, en los
-- que el dato sí se captura al crearlos.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS obligado_facturar_electronicamente boolean;

COMMENT ON COLUMN usuarios.obligado_facturar_electronicamente IS
  'true = factura electrónica (no se genera Cuenta de Cobro). false = no obligado. NULL = sin verificar.';
