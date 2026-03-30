-- =============================================================
-- Fix RLS policies for periodos table
-- Migration: 007_fix_rls_periodos.sql
--
-- The original policies (001) used old state-machine names
-- (revision_asesor, revision_gobierno, revision_hacienda).
-- The current state machine uses:
--   borrador → enviado → aprobado_asesor → aprobado → radicado
--   (with rechazado as a branch from enviado/aprobado_asesor)
--
-- Additionally, the marcarRadicado action (aprobado → radicado)
-- was blocked because no policy covered that transition.
-- We use the admin/service_role client for privileged state
-- transitions, so we only need to fix read policies and
-- ensure admin has full bypass.
-- =============================================================

-- Drop all existing periodos update policies to replace them cleanly
DROP POLICY IF EXISTS "periodos_supervisor_update" ON periodos;
DROP POLICY IF EXISTS "periodos_asesor_update"     ON periodos;
DROP POLICY IF EXISTS "periodos_gobierno_update"   ON periodos;
DROP POLICY IF EXISTS "periodos_hacienda_update"   ON periodos;
DROP POLICY IF EXISTS "periodos_contratista_update" ON periodos;

-- ── Contratista: can submit (borrador/rechazado → enviado) ──────────────────
CREATE POLICY "periodos_contratista_update_v2"
  ON periodos FOR UPDATE
  USING (
    public.get_user_rol() = 'contratista'
    AND estado IN ('borrador', 'rechazado')
    AND contrato_id IN (
      SELECT id FROM contratos WHERE contratista_id = auth.uid()
    )
  )
  WITH CHECK (
    estado = 'enviado'
    AND contrato_id IN (
      SELECT id FROM contratos WHERE contratista_id = auth.uid()
    )
  );

-- ── Asesor: can approve/reject (enviado/rechazado/aprobado_asesor) ──────────
CREATE POLICY "periodos_asesor_update_v2"
  ON periodos FOR UPDATE
  USING (
    public.get_user_rol() = 'asesor'
    AND estado IN ('enviado', 'rechazado', 'aprobado_asesor')
  )
  WITH CHECK (
    estado IN ('aprobado_asesor', 'rechazado', 'enviado')
  );

-- ── Supervisor/secretaria: can approve (aprobado_asesor/enviado → aprobado/enviado/rechazado) ──
CREATE POLICY "periodos_supervisor_update_v2"
  ON periodos FOR UPDATE
  USING (
    public.get_user_rol() = 'supervisor'
    AND contrato_id IN (
      SELECT id FROM contratos WHERE supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    estado IN ('aprobado', 'enviado', 'rechazado')
  );

-- Note: radicado state transition (aprobado → radicado) is performed
-- exclusively via the service_role (admin) client in marcarRadicado server
-- action, which bypasses RLS entirely. Regular users cannot set radicado directly.
