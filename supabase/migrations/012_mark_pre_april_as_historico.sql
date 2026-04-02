-- Migration 012: Auto-mark all periods before April 2026 as historical
-- Applies to: any period whose month/year falls before April 2026,
-- regardless of state (borrador, enviado, aprobado, etc.)

UPDATE periodos
SET
  es_historico          = true,
  historico_marcado_at  = now(),
  historico_nota        = 'Periodo anterior a la digitalización del sistema — marcado automáticamente'
WHERE es_historico = false
  AND (
    anio < 2026
    OR (
      anio = 2026
      AND mes IN ('ENERO', 'FEBRERO', 'MARZO')
    )
  );
