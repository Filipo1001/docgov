-- Migration 018: Add UPDATE policy for contratistas on actividades
--
-- The original RLS setup covered SELECT, INSERT and DELETE for contratistas
-- but omitted UPDATE. This prevented inline editing of activity descriptions
-- and quantities (the edit form would submit without error but save nothing).

CREATE POLICY "actividades_contratista_update"
  ON actividades FOR UPDATE
  USING (
    public.get_user_rol() = 'contratista'
    AND periodo_id IN (
      SELECT p.id FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.contratista_id = auth.uid()
        AND p.estado IN ('borrador', 'rechazado')
    )
  )
  WITH CHECK (
    public.get_user_rol() = 'contratista'
    AND periodo_id IN (
      SELECT p.id FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE c.contratista_id = auth.uid()
        AND p.estado IN ('borrador', 'rechazado')
    )
  );
