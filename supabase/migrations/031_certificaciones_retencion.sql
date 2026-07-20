-- Migration 031: Certificación bajo la gravedad de juramento para efectos de
-- retención en la fuente (Ley 1819 de 2016 · Parágrafo 2, Art. 383 E.T.).
--
-- El contratista, antes de enviar su PRIMER informe del año gravable, jura si
-- ha vinculado o no más de un trabajador (define la tabla de retención que se
-- le aplica). El sistema genera la certificación firmada y verificable por QR,
-- reutilizando el mismo motor documental, de firmas y de verificación.
--
-- Diseño: una certificación por (contrato, año gravable). El Art. 383 es una
-- declaración ANUAL; un contrato que cruce a un nuevo año fiscal exige una
-- certificación nueva. Documento inmutable: se genera una vez al jurar.

-- ─── 1. Bucket privado para las certificaciones ──────────────────────────────
-- Documento legal inmutable → bucket propio, privado, servido por signed URL
-- (mismo modelo que documentos/evidencias/pdf-cache tras la migración 026).
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificaciones', 'certificaciones', false)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Tabla de certificaciones ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificaciones_retencion (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id             uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  contratista_id          uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  anio_gravable           integer NOT NULL,

  -- Contenido jurado (evidencia del acto de declaración)
  vinculo_mas_trabajador  boolean NOT NULL,            -- respuesta SI(true) / NO(false)
  lugar_expedicion        text NOT NULL,               -- snapshot al momento de jurar

  -- Documento generado
  codigo                  text UNIQUE,                 -- verificación pública (comparte /verificar)
  pdf_path                text,                        -- ruta en el bucket certificaciones
  hash_sha256             text,                        -- huella del PDF emitido
  texto_version           text NOT NULL DEFAULT 'v1',  -- versión del texto jurídico aceptado
  datos_snapshot          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Evidencia de aceptación (trazabilidad jurídica)
  aceptado_por            uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_aceptacion        timestamptz NOT NULL DEFAULT now(),
  ip_aceptacion           text,
  user_agent              text,

  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  UNIQUE (contrato_id, anio_gravable)
);

CREATE INDEX IF NOT EXISTS idx_cert_retencion_contrato ON certificaciones_retencion (contrato_id);
CREATE INDEX IF NOT EXISTS idx_cert_retencion_codigo   ON certificaciones_retencion (codigo);

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE certificaciones_retencion ENABLE ROW LEVEL SECURITY;

-- SELECT: dueño del contrato, su supervisor, asesor de la dependencia, admin.
-- (La escritura corre exclusivamente con el service-role desde el servidor;
--  sin políticas de INSERT/UPDATE/DELETE, la clave anon/authenticated no puede
--  fabricar ni alterar una certificación.)
DROP POLICY IF EXISTS "cert_retencion_select" ON certificaciones_retencion;
CREATE POLICY "cert_retencion_select" ON certificaciones_retencion
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
    OR EXISTS (
      SELECT 1 FROM contratos c
      WHERE c.id = certificaciones_retencion.contrato_id
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
