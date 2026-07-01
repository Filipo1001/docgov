-- Allows a supervisor/admin to manually unlock a past-month period so the
-- contratista can still upload evidence and submit it.
-- Default FALSE: no change to existing behaviour.
ALTER TABLE periodos
  ADD COLUMN IF NOT EXISTS habilitado_tardio BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index for fast lookups of unlocked past-month periods.
CREATE INDEX IF NOT EXISTS idx_periodos_habilitado_tardio
  ON periodos (habilitado_tardio)
  WHERE habilitado_tardio = TRUE;
