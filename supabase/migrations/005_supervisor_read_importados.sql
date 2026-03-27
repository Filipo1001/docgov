-- ─────────────────────────────────────────────────────────────
-- Migration 005: Allow supervisors to read contratistas_importados
-- Needed for "Mis Colaboradores" — supervisor sees all people
-- in their department, even those without contracts yet.
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "importados_supervisor_read" ON public.contratistas_importados
    FOR SELECT
    USING ((SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'supervisor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
