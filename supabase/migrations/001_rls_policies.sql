-- =============================================================
-- DocGov — Row Level Security Policies
-- Migration: 001_rls_policies.sql
--
-- HOW TO APPLY:
--   Option A (Supabase CLI): supabase db push
--   Option B (Supabase Dashboard): SQL Editor → paste and run
--
-- DESIGN PRINCIPLES:
--   1. All tables are protected by default (RLS enabled, deny-all)
--   2. A helper function reads the user's rol from the usuarios table
--   3. Policies are additive (OR logic). A user matches if ANY policy matches.
--   4. Admin bypasses all restrictions with a blanket policy
--   5. Reviewer roles (asesor, gobierno, hacienda) get read access to all
--      contracts (they need full visibility to review approval chains)
-- =============================================================


-- ─── Helper: get current user's role ─────────────────────────────────────────
-- Using SECURITY DEFINER so it can read usuarios even when that table
-- has RLS active. Cached with STABLE for performance within a single query.

CREATE OR REPLACE FUNCTION public.get_user_rol()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid()
$$;


-- =============================================================
-- MUNICIPIOS & DEPENDENCIAS (reference data — read-only for all)
-- =============================================================

ALTER TABLE municipios ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependencias ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read reference data
CREATE POLICY "municipios_authenticated_read"
  ON municipios FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "dependencias_authenticated_read"
  ON dependencias FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admin can modify reference data
CREATE POLICY "municipios_admin_all"
  ON municipios FOR ALL
  USING (public.get_user_rol() = 'admin');

CREATE POLICY "dependencias_admin_all"
  ON dependencias FOR ALL
  USING (public.get_user_rol() = 'admin');


-- =============================================================
-- USUARIOS
-- =============================================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all user profiles
-- (needed to show names in contracts, dropdowns, etc.)
-- This is acceptable for an internal government system.
CREATE POLICY "usuarios_authenticated_read"
  ON usuarios FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admin can do anything
CREATE POLICY "usuarios_admin_all"
  ON usuarios FOR ALL
  USING (public.get_user_rol() = 'admin');

-- Users can update their own profile (but not their rol)
-- Note: rol field changes must go through admin or a dedicated function
CREATE POLICY "usuarios_update_own"
  ON usuarios FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- =============================================================
-- CONTRATOS
-- =============================================================

ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "contratos_admin_all"
  ON contratos FOR ALL
  USING (public.get_user_rol() = 'admin');

-- Supervisor: read own assigned contracts
CREATE POLICY "contratos_supervisor_read"
  ON contratos FOR SELECT
  USING (
    public.get_user_rol() = 'supervisor'
    AND supervisor_id = auth.uid()
  );

-- Contratista: read own contracts
CREATE POLICY "contratos_contratista_read"
  ON contratos FOR SELECT
  USING (
    public.get_user_rol() = 'contratista'
    AND contratista_id = auth.uid()
  );

-- Reviewers: read all contracts (needed to navigate approval chain)
CREATE POLICY "contratos_reviewers_read"
  ON contratos FOR SELECT
  USING (public.get_user_rol() IN ('asesor', 'gobierno', 'hacienda'));


-- =============================================================
-- OBLIGACIONES
-- =============================================================

ALTER TABLE obligaciones ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "obligaciones_admin_all"
  ON obligaciones FOR ALL
  USING (public.get_user_rol() = 'admin');

-- Supervisor: read obligations for assigned contracts
CREATE POLICY "obligaciones_supervisor_read"
  ON obligaciones FOR SELECT
  USING (
    public.get_user_rol() = 'supervisor'
    AND contrato_id IN (
      SELECT id FROM contratos WHERE supervisor_id = auth.uid()
    )
  );

-- Contratista: read obligations for own contracts
CREATE POLICY "obligaciones_contratista_read"
  ON obligaciones FOR SELECT
  USING (
    public.get_user_rol() = 'contratista'
    AND contrato_id IN (
      SELECT id FROM contratos WHERE contratista_id = auth.uid()
    )
  );

-- Reviewers: read all obligations (needed to display period detail)
CREATE POLICY "obligaciones_reviewers_read"
  ON obligaciones FOR SELECT
  USING (public.get_user_rol() IN ('asesor', 'gobierno', 'hacienda'));


-- =============================================================
-- PERIODOS
-- =============================================================

ALTER TABLE periodos ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "periodos_admin_all"
  ON periodos FOR ALL
  USING (public.get_user_rol() = 'admin');

-- Supervisor: read + update (approve/reject) for assigned contracts
-- Can only update periods in 'enviado' state
CREATE POLICY "periodos_supervisor_read"
  ON periodos FOR SELECT
  USING (
    public.get_user_rol() = 'supervisor'
    AND contrato_id IN (
      SELECT id FROM contratos WHERE supervisor_id = auth.uid()
    )
  );

CREATE POLICY "periodos_supervisor_update"
  ON periodos FOR UPDATE
  USING (
    public.get_user_rol() = 'supervisor'
    AND estado = 'enviado'
    AND contrato_id IN (
      SELECT id FROM contratos WHERE supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Supervisor can only move to revision_asesor or rechazado
    estado IN ('revision_asesor', 'rechazado')
  );

-- Contratista: read own periods + update when editable (borrador/rechazado)
CREATE POLICY "periodos_contratista_read"
  ON periodos FOR SELECT
  USING (
    public.get_user_rol() = 'contratista'
    AND contrato_id IN (
      SELECT id FROM contratos WHERE contratista_id = auth.uid()
    )
  );

CREATE POLICY "periodos_contratista_update"
  ON periodos FOR UPDATE
  USING (
    public.get_user_rol() = 'contratista'
    AND estado IN ('borrador', 'rechazado')
    AND contrato_id IN (
      SELECT id FROM contratos WHERE contratista_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Contratista can only submit (enviado) from editable states
    estado = 'enviado'
  );

-- Asesor: read all + update revision_asesor only
CREATE POLICY "periodos_asesor_read"
  ON periodos FOR SELECT
  USING (public.get_user_rol() = 'asesor');

CREATE POLICY "periodos_asesor_update"
  ON periodos FOR UPDATE
  USING (
    public.get_user_rol() = 'asesor'
    AND estado = 'revision_asesor'
  )
  WITH CHECK (estado IN ('revision_gobierno', 'rechazado'));

-- Gobierno: read all + update revision_gobierno only
CREATE POLICY "periodos_gobierno_read"
  ON periodos FOR SELECT
  USING (public.get_user_rol() = 'gobierno');

CREATE POLICY "periodos_gobierno_update"
  ON periodos FOR UPDATE
  USING (
    public.get_user_rol() = 'gobierno'
    AND estado = 'revision_gobierno'
  )
  WITH CHECK (estado IN ('revision_hacienda', 'rechazado'));

-- Hacienda: read all + update revision_hacienda + mark pagado
CREATE POLICY "periodos_hacienda_read"
  ON periodos FOR SELECT
  USING (public.get_user_rol() = 'hacienda');

CREATE POLICY "periodos_hacienda_update"
  ON periodos FOR UPDATE
  USING (
    public.get_user_rol() = 'hacienda'
    AND estado IN ('revision_hacienda', 'aprobado')
  )
  WITH CHECK (estado IN ('aprobado', 'rechazado', 'pagado'));


-- =============================================================
-- ACTIVIDADES
-- =============================================================

ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "actividades_admin_all"
  ON actividades FOR ALL
  USING (public.get_user_rol() = 'admin');

-- Supervisor: read activities for assigned contracts' periods
CREATE POLICY "actividades_supervisor_read"
  ON actividades FOR SELECT
  USING (
    public.get_user_rol() = 'supervisor'
    AND periodo_id IN (
      SELECT p.id FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.supervisor_id = auth.uid()
    )
  );

-- Contratista: full CRUD on own contracts' periods when period is editable
CREATE POLICY "actividades_contratista_read"
  ON actividades FOR SELECT
  USING (
    public.get_user_rol() = 'contratista'
    AND periodo_id IN (
      SELECT p.id FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.contratista_id = auth.uid()
    )
  );

CREATE POLICY "actividades_contratista_insert"
  ON actividades FOR INSERT
  WITH CHECK (
    public.get_user_rol() = 'contratista'
    AND periodo_id IN (
      SELECT p.id FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.contratista_id = auth.uid()
        AND p.estado IN ('borrador', 'rechazado')
    )
  );

CREATE POLICY "actividades_contratista_delete"
  ON actividades FOR DELETE
  USING (
    public.get_user_rol() = 'contratista'
    AND periodo_id IN (
      SELECT p.id FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.contratista_id = auth.uid()
        AND p.estado IN ('borrador', 'rechazado')
    )
  );

-- Reviewers: read all activities (to review period content)
CREATE POLICY "actividades_reviewers_read"
  ON actividades FOR SELECT
  USING (public.get_user_rol() IN ('asesor', 'gobierno', 'hacienda'));


-- =============================================================
-- EVIDENCIAS
-- =============================================================

ALTER TABLE evidencias ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "evidencias_admin_all"
  ON evidencias FOR ALL
  USING (public.get_user_rol() = 'admin');

-- Supervisor: read evidence for assigned contracts
CREATE POLICY "evidencias_supervisor_read"
  ON evidencias FOR SELECT
  USING (
    public.get_user_rol() = 'supervisor'
    AND actividad_id IN (
      SELECT a.id FROM actividades a
      JOIN periodos p ON p.id = a.periodo_id
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.supervisor_id = auth.uid()
    )
  );

-- Contratista: CRUD on own editable periods' evidence
CREATE POLICY "evidencias_contratista_read"
  ON evidencias FOR SELECT
  USING (
    public.get_user_rol() = 'contratista'
    AND actividad_id IN (
      SELECT a.id FROM actividades a
      JOIN periodos p ON p.id = a.periodo_id
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.contratista_id = auth.uid()
    )
  );

CREATE POLICY "evidencias_contratista_insert"
  ON evidencias FOR INSERT
  WITH CHECK (
    public.get_user_rol() = 'contratista'
    AND actividad_id IN (
      SELECT a.id FROM actividades a
      JOIN periodos p ON p.id = a.periodo_id
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.contratista_id = auth.uid()
        AND p.estado IN ('borrador', 'rechazado')
    )
  );

CREATE POLICY "evidencias_contratista_delete"
  ON evidencias FOR DELETE
  USING (
    public.get_user_rol() = 'contratista'
    AND actividad_id IN (
      SELECT a.id FROM actividades a
      JOIN periodos p ON p.id = a.periodo_id
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.contratista_id = auth.uid()
        AND p.estado IN ('borrador', 'rechazado')
    )
  );

-- Reviewers: read all evidence
CREATE POLICY "evidencias_reviewers_read"
  ON evidencias FOR SELECT
  USING (public.get_user_rol() IN ('asesor', 'gobierno', 'hacienda'));


-- =============================================================
-- STORAGE: evidencias bucket policy
-- Run in Supabase Dashboard → Storage → Policies
-- =============================================================

-- Note: Storage bucket policies are managed in the Supabase dashboard UI
-- or via supabase/config.toml. The following are the SQL equivalents:

-- Authenticated users can upload to evidencias/
-- INSERT policy: storage.objects
-- USING: bucket_id = 'evidencias' AND auth.role() = 'authenticated'

-- Users can only delete their own uploads
-- DELETE policy: storage.objects
-- USING: bucket_id = 'evidencias' AND owner = auth.uid()

-- Everyone authenticated can read (for viewing evidence)
-- SELECT policy: storage.objects
-- USING: bucket_id = 'evidencias' AND auth.role() = 'authenticated'
