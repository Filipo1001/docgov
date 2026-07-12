-- Migration 030: registro de documentos emitidos para verificación pública.
-- Tabla INERTE: ningún código ni tabla existente la referencia todavía.
--
-- Modelo de seguridad: RLS habilitado SIN políticas → anon/authenticated no
-- pueden leer ni escribir directamente (ni con la clave anónima). Solo el
-- service-role (server-side) accede: la página /verificar consulta por código
-- vía server component, evitando la enumeración masiva de documentos.

CREATE TABLE IF NOT EXISTS documentos_emitidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text UNIQUE NOT NULL,           -- CD-XXXX-XXXX, impreso en el PDF
  tipo            text NOT NULL,                   -- informe | cuenta-cobro | acta-supervision | acta-pago
  periodo_id      uuid REFERENCES periodos(id) ON DELETE CASCADE,
  hash_sha256     text,                            -- huella de la última emisión del PDF
  datos_verificacion jsonb NOT NULL DEFAULT '{}'::jsonb,  -- snapshot NO sensible mostrado al verificar
  emitido_por     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (tipo, periodo_id)                        -- un código estable por documento
);

CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_codigo ON documentos_emitidos (codigo);

ALTER TABLE documentos_emitidos ENABLE ROW LEVEL SECURITY;
-- Sin políticas: acceso exclusivo del service-role (mutaciones y verify page).
