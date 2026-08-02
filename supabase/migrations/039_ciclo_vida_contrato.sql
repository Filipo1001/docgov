-- 039 — Ciclo de vida del contrato
--
-- El contrato solo tenía `activo boolean`, que nadie mantenía: 49 contratos ya
-- vencidos seguían con activo = true porque no existía forma de cerrarlos.
--
-- Qué NO se modela aquí: el vencimiento natural. Que hoy sea posterior a
-- fecha_fin es derivable del propio contrato y no requiere que nadie registre
-- nada; guardarlo como estado obligaría a un proceso que lo fuera marcando y
-- volvería a desincronizarse igual que `activo`.
--
-- Lo que sí se modela son los HECHOS que alguien decide y que no se pueden
-- deducir de una fecha: suspender, terminar antes de tiempo, liquidar o ceder.

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'vigente',
  ADD COLUMN IF NOT EXISTS estado_fecha date,
  ADD COLUMN IF NOT EXISTS estado_motivo text;

ALTER TABLE contratos DROP CONSTRAINT IF EXISTS contratos_estado_check;
ALTER TABLE contratos ADD CONSTRAINT contratos_estado_check
  CHECK (estado IN ('vigente', 'suspendido', 'terminado', 'liquidado', 'cedido'));

COMMENT ON COLUMN contratos.estado IS
  'vigente | suspendido | terminado (anticipadamente) | liquidado | cedido. El vencimiento natural NO es un estado: se deriva de fecha_fin.';
COMMENT ON COLUMN contratos.estado_fecha IS
  'Fecha del acto que produjo el estado (acta de suspensión, de liquidación…).';

CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos (estado) WHERE estado <> 'vigente';
