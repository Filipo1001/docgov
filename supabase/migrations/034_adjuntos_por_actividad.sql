-- Migration 034: adjuntos vinculados a la actividad (y por tanto a la obligación)
--
-- Los PDF dejan de cargarse desde una sección aparte del periodo y pasan a
-- subirse desde la misma acción "Adjuntar evidencia" de cada actividad, junto
-- a las imágenes. Así la evidencia documental queda asociada a la obligación
-- específica que soporta, en vez de colgar suelta del periodo.
--
-- entidad_id se mantiene apuntando al periodo: la carga de anexos al generar el
-- informe sigue siendo una sola consulta indexada, sin join a actividades.
ALTER TABLE documentos_adjuntos
  ADD COLUMN IF NOT EXISTS actividad_id uuid REFERENCES actividades(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_adjuntos_actividad
  ON documentos_adjuntos (actividad_id)
  WHERE eliminado_at IS NULL;
