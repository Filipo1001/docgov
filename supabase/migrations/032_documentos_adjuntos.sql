-- Migration 032: Anexos PDF del Informe de Actividades (documentos_adjuntos)
--
-- Entidad SEPARADA de `evidencias` a propósito:
--   · evidencias  → imágenes que se INCRUSTAN dentro del PDF generado.
--   · adjuntos    → PDFs que se ANEXAN al final como "Anexo N".
-- Comparten la idea de "archivo del contratista" pero no el ciclo de vida, ni
-- la validación, ni el tratamiento en el motor documental. Un campo `tipo`
-- sobre `evidencias` habría metido condicionales en generación de PDF,
-- compresión, deduplicación por phash y miniaturas.
--
-- Integridad: los adjuntos solo se pueden modificar en estados borrador y
-- rechazado (ESTADOS_EDITABLES), mientras que el PDF solo se cachea/sella en
-- enviado, revision, aprobado y radicado (ESTADOS_CACHEABLES). Ambos conjuntos
-- son disjuntos, así que un anexo nunca cambia después de que el documento
-- queda sellado con su código QR y su hash.

-- ─── 1. Bucket privado ───────────────────────────────────────────────────────
-- Restringido a PDF y 15 MB EN EL BUCKET, no solo en la aplicación: la subida
-- va del navegador directo a Storage por URL prefirmada, así que la validación
-- de la app por sí sola es evitable.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('adjuntos', 'adjuntos', false, 15728640, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public            = false;

-- ─── 2. Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_adjuntos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Adjuntable a varias entidades sin una tabla puente por cada una.
  -- Hoy solo se usa 'periodo'; contrato/otrosí quedan habilitados sin migración.
  entidad_tipo      text NOT NULL DEFAULT 'periodo'
                    CHECK (entidad_tipo IN ('periodo', 'contrato', 'otrosi')),
  entidad_id        uuid NOT NULL,

  -- Aislamiento multi-alcaldía desde el día 1, aunque hoy solo exista una.
  -- Añadirlo después, con millones de filas y RLS ya escrito, sería una
  -- migración con bloqueo de tabla y reescritura de todas las políticas.
  municipio_id      uuid REFERENCES municipios(id),

  -- Identidad del archivo
  storage_path      text NOT NULL UNIQUE,
  nombre_original   text NOT NULL,
  bytes             bigint NOT NULL,
  sha256            text NOT NULL,          -- integridad probatoria + deduplicación
  paginas           integer,                -- nº de páginas, verificado en servidor

  -- Orden del anexo dentro del informe. "Anexo 1", "Anexo 2"… en orden de carga.
  orden             integer NOT NULL DEFAULT 1,

  -- Ciclo de vida de la verificación asíncrona
  estado            text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'limpio', 'rechazado')),
  verificado_at     timestamptz,
  verificacion_nota text,                   -- motivo si quedó rechazado

  -- Extensible sin migraciones (OCR, autor del PDF, texto extraído…)
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Auditoría
  subido_por        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  eliminado_at      timestamptz             -- borrado lógico: nunca DELETE físico
);

-- Consulta real dominante: "dame los anexos vigentes de este periodo, en orden"
CREATE INDEX IF NOT EXISTS idx_adjuntos_entidad
  ON documentos_adjuntos (entidad_tipo, entidad_id, orden)
  WHERE eliminado_at IS NULL;

-- Deduplicación: detectar el mismo soporte subido dos veces
CREATE INDEX IF NOT EXISTS idx_adjuntos_sha
  ON documentos_adjuntos (sha256)
  WHERE eliminado_at IS NULL;

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE documentos_adjuntos ENABLE ROW LEVEL SECURITY;

-- SELECT: contratista dueño, supervisor del contrato, asesor de la dependencia,
-- admin y contratación. Misma forma que obligacion_revisiones (migración 021).
DROP POLICY IF EXISTS "adjuntos_select" ON documentos_adjuntos;
CREATE POLICY "adjuntos_select" ON documentos_adjuntos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid() AND u.rol IN ('admin', 'contratacion')
    )
    OR EXISTS (
      SELECT 1
      FROM periodos p
      JOIN contratos c ON c.id = p.contrato_id
      WHERE entidad_tipo = 'periodo'
        AND p.id = documentos_adjuntos.entidad_id
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

-- Sin políticas de INSERT/UPDATE/DELETE: toda escritura pasa por el
-- service-role desde server actions que ya validan estado del periodo,
-- propiedad del contrato y tipo real del archivo.
