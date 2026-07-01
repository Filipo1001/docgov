-- Migration 021: Per-obligation review (obligacion_revisiones)
--
-- Almacena la revisión que asesor/supervisor hacen de CADA obligación dentro de
-- un período: si está aprobada (✓) y una nota opcional. Esa revisión alimenta el
-- apartado "Aceptación de las actividades realizadas" del Acta de Supervisión.
--
-- Diseño: solo se guardan DESVIACIONES del default. Ausencia de fila = obligación
-- aprobada por defecto y sin nota (el acta sale completa aunque nadie la toque).
-- El supervisor solo crea fila para DESMARCAR una obligación o AGREGAR una nota.

-- ─── 1. Tabla ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS obligacion_revisiones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id    uuid NOT NULL REFERENCES periodos(id)     ON DELETE CASCADE,
  obligacion_id uuid NOT NULL REFERENCES obligaciones(id) ON DELETE CASCADE,
  aprobada      boolean NOT NULL DEFAULT true,
  nota          text,
  revisado_por  uuid REFERENCES usuarios(id),
  revisado_at   timestamptz DEFAULT now(),
  UNIQUE (periodo_id, obligacion_id)
);

CREATE INDEX IF NOT EXISTS idx_obligacion_revisiones_periodo
  ON obligacion_revisiones (periodo_id);

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE obligacion_revisiones ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquiera con acceso al contrato (la vista de detalle se sirve
-- server-side con la sesión del usuario, así que RLS aplica al leer).
DROP POLICY IF EXISTS "obligacion_revisiones_select" ON obligacion_revisiones;
CREATE POLICY "obligacion_revisiones_select" ON obligacion_revisiones
  FOR SELECT
  USING (
    -- admin
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
    -- contratista dueño, supervisor del contrato, o asesor de la dependencia
    OR EXISTS (
      SELECT 1
      FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE p.id = obligacion_revisiones.periodo_id
        AND (
          c.contratista_id = auth.uid()
          OR c.supervisor_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
              AND u.rol = 'asesor'
              AND u.dependencia_id = c.dependencia_id
          )
        )
    )
  );

-- Escritura (INSERT/UPDATE/DELETE): admin, supervisor del contrato, asesor de la
-- dependencia. Las mutaciones reales corren con el admin client (service-role,
-- que omite RLS); estas policies son defensa en profundidad.
DROP POLICY IF EXISTS "obligacion_revisiones_write" ON obligacion_revisiones;
CREATE POLICY "obligacion_revisiones_write" ON obligacion_revisiones
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
    OR EXISTS (
      SELECT 1
      FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE p.id = obligacion_revisiones.periodo_id
        AND (
          c.supervisor_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
              AND u.rol = 'asesor'
              AND u.dependencia_id = c.dependencia_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
    OR EXISTS (
      SELECT 1
      FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE p.id = obligacion_revisiones.periodo_id
        AND (
          c.supervisor_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
              AND u.rol = 'asesor'
              AND u.dependencia_id = c.dependencia_id
          )
        )
    )
  );
