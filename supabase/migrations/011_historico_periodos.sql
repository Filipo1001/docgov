-- Migration 011: Historical period immutability
-- Adds es_historico flag + audit columns to periodos.
-- Historical periods are frozen records from before the system was digitized.
-- They must be permanently immutable: no edits, no workflow actions, no uploads.

-- ─── 1. Add columns ──────────────────────────────────────────────────────────

ALTER TABLE periodos
  ADD COLUMN IF NOT EXISTS es_historico         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS historico_marcado_por uuid        REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS historico_marcado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS historico_nota        text;

-- ─── 2. Partial index for fast admin queries ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_periodos_es_historico
  ON periodos (es_historico)
  WHERE es_historico = true;

-- ─── 3. Trigger: block ALL updates to historical periods at DB level ──────────
--  This is a belt-and-suspenders guard that fires regardless of which
--  Supabase client (anon, authenticated, service_role) makes the call.

CREATE OR REPLACE FUNCTION prevent_historico_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.es_historico = true AND NEW.es_historico = true THEN
    RAISE EXCEPTION 'No se puede modificar un periodo histórico (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_historico_update ON periodos;
CREATE TRIGGER trg_prevent_historico_update
  BEFORE UPDATE ON periodos
  FOR EACH ROW
  EXECUTE FUNCTION prevent_historico_update();

-- ─── 4. RLS: block UPDATE on historical periods ───────────────────────────────
--  Recreate the three UPDATE policies with an added `AND es_historico = false`
--  condition so the DB-level RLS also blocks historical period mutations.

-- Contratista update policy
DROP POLICY IF EXISTS "periodos_contratista_update_v2" ON periodos;
CREATE POLICY "periodos_contratista_update_v2" ON periodos
  FOR UPDATE
  USING (
    es_historico = false
    AND EXISTS (
      SELECT 1 FROM contratos
      WHERE contratos.id = periodos.contrato_id
        AND contratos.contratista_id = auth.uid()
    )
  );

-- Asesor update policy
DROP POLICY IF EXISTS "periodos_asesor_update_v2" ON periodos;
CREATE POLICY "periodos_asesor_update_v2" ON periodos
  FOR UPDATE
  USING (
    es_historico = false
    AND EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = 'asesor'
        AND usuarios.dependencia_id = (
          SELECT dependencia_id FROM contratos WHERE contratos.id = periodos.contrato_id
        )
    )
  );

-- Supervisor update policy
DROP POLICY IF EXISTS "periodos_supervisor_update_v2" ON periodos;
CREATE POLICY "periodos_supervisor_update_v2" ON periodos
  FOR UPDATE
  USING (
    es_historico = false
    AND EXISTS (
      SELECT 1 FROM contratos
      WHERE contratos.id = periodos.contrato_id
        AND contratos.supervisor_id = auth.uid()
    )
  );
