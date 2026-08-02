-- 037 — Expediente documental del contrato
--
-- Los soportes que acompañan al contrato (CDP, RP, RUT, certificación
-- bancaria, contrato firmado, pólizas) vivían fuera del sistema: en el correo
-- de quien los tramitó o en una carpeta compartida. Al pedirlos un ente de
-- control había que reconstruirlos a mano.
--
-- Se reutiliza `documentos_adjuntos` en vez de crear una tabla nueva: la
-- validación real del PDF, el sha256, el borrado lógico y el visor integrado
-- ya existen ahí. Lo único que faltaba era distinguir DE QUÉ documento se
-- trata, porque en el expediente del contrato el tipo es lo que da sentido al
-- archivo (a diferencia de los anexos del informe, donde solo importa el orden).

ALTER TABLE documentos_adjuntos
  ADD COLUMN IF NOT EXISTS tipo_documento text;

COMMENT ON COLUMN documentos_adjuntos.tipo_documento IS
  'Solo para entidad_tipo=''contrato'': cdp | rp | rut | certificacion_bancaria | contrato_firmado | poliza | otro';

CREATE INDEX IF NOT EXISTS idx_adjuntos_contrato
  ON documentos_adjuntos (entidad_id, tipo_documento)
  WHERE entidad_tipo = 'contrato' AND eliminado_at IS NULL;

-- La política vigente solo contemplaba entidad_tipo='periodo', así que un
-- documento de contrato sería invisible para todos salvo admin/contratación.
-- Se extiende con la rama de contrato: el contratista ve su propio expediente
-- (es su RUT, su certificación bancaria), el supervisor el de los contratos
-- que vigila y el asesor los de su dependencia.
DROP POLICY IF EXISTS adjuntos_select ON documentos_adjuntos;
CREATE POLICY adjuntos_select ON documentos_adjuntos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = auth.uid() AND u.rol = ANY (ARRAY['admin'::rol_usuario, 'contratacion'::rol_usuario])
  )
  OR EXISTS (
    SELECT 1 FROM periodos p
    JOIN contratos c ON c.id = p.contrato_id
    WHERE documentos_adjuntos.entidad_tipo = 'periodo'
      AND p.id = documentos_adjuntos.entidad_id
      AND (
        c.contratista_id = auth.uid()
        OR c.supervisor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM usuarios u
          WHERE u.id = auth.uid() AND u.rol = 'asesor'::rol_usuario AND u.dependencia_id = c.dependencia_id
        )
      )
  )
  OR EXISTS (
    SELECT 1 FROM contratos c
    WHERE documentos_adjuntos.entidad_tipo = 'contrato'
      AND c.id = documentos_adjuntos.entidad_id
      AND (
        c.contratista_id = auth.uid()
        OR c.supervisor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM usuarios u
          WHERE u.id = auth.uid() AND u.rol = 'asesor'::rol_usuario AND u.dependencia_id = c.dependencia_id
        )
      )
  )
);
