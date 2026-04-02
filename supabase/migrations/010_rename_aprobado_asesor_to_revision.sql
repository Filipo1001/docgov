-- Migration 010: Rename aprobado_asesor → revision
--
-- State machine correction: the secretary is the final authority and can approve
-- from either 'enviado' (direct) or 'revision' (after asesor review).
-- The asesor's step is optional — 'revision' just signals they've reviewed it.

-- 1. Add new enum value
ALTER TYPE estado_periodo ADD VALUE IF NOT EXISTS 'revision';

-- 2. Migrate existing rows (run after enum value is committed)
-- periodos.estado
UPDATE periodos
  SET estado = 'revision'
  WHERE estado = 'aprobado_asesor';

-- historial_periodos audit trail
UPDATE historial_periodos
  SET estado_anterior = 'revision'
  WHERE estado_anterior = 'aprobado_asesor';

UPDATE historial_periodos
  SET estado_nuevo = 'revision'
  WHERE estado_nuevo = 'aprobado_asesor';
