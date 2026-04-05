-- Migration 014: firma_url column on usuarios + documentos storage bucket
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT / exception guards)

-- ── 1. firma_url column ──────────────────────────────────────────
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS firma_url TEXT;

-- ── 2. documentos bucket ─────────────────────────────────────────
-- Used for: firmas (signatures), and any other binary documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos',
  'documentos',
  true,
  3145728,   -- 3 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Public read — anyone with the URL can view the file
DO $$ BEGIN
  CREATE POLICY "documentos_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'documentos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users can upload their own firma (path must be firmas/<uid>/...)
-- Admin can upload for anyone
DO $$ BEGIN
  CREATE POLICY "documentos_self_write" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'documentos' AND
      auth.uid() IS NOT NULL AND (
        name LIKE 'firmas/' || auth.uid()::text || '/%'
        OR (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users can replace (upsert) their own firma
DO $$ BEGIN
  CREATE POLICY "documentos_self_update" ON storage.objects
    FOR UPDATE USING (
      bucket_id = 'documentos' AND (
        name LIKE 'firmas/' || auth.uid()::text || '/%'
        OR (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users can delete their own firma
DO $$ BEGIN
  CREATE POLICY "documentos_self_delete" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'documentos' AND (
        name LIKE 'firmas/' || auth.uid()::text || '/%'
        OR (SELECT rol FROM public.usuarios WHERE id = auth.uid()) = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
