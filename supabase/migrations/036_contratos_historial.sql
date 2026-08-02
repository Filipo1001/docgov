-- 036 — Trazabilidad de cambios sobre el contrato
--
-- Hasta ahora el contrato era inmutable: no existía ninguna acción que lo
-- actualizara, así que un error de digitación en el número, el objeto o el
-- valor era permanente para todos los roles.
--
-- Al abrir la edición, el cambio tiene que dejar rastro: el contrato es la
-- fuente de la que se derivan todos los documentos oficiales, y un ente de
-- control puede preguntar quién modificó qué y cuándo.
--
-- Una fila POR CAMPO (no un diff en JSON) para poder responder "¿cuándo cambió
-- el supervisor de este contrato?" con una consulta directa.

CREATE TABLE IF NOT EXISTS contratos_historial (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id   uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL REFERENCES usuarios(id),
  campo         text NOT NULL,
  valor_anterior text,
  valor_nuevo    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_historial_contrato
  ON contratos_historial (contrato_id, created_at DESC);

ALTER TABLE contratos_historial ENABLE ROW LEVEL SECURITY;

-- Lectura para los roles que gestionan o revisan contratos. La escritura va
-- siempre por service-role desde la server action, igual que el resto de
-- historiales del sistema.
DROP POLICY IF EXISTS "historial contratos legible por gestores" ON contratos_historial;
CREATE POLICY "historial contratos legible por gestores"
  ON contratos_historial FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid()
        AND u.rol IN ('admin', 'contratacion', 'supervisor', 'asesor')
    )
  );
