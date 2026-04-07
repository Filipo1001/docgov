-- ── PDF Cache bucket ────────────────────────────────────────────────────────
-- Stores pre-generated PDFs keyed by tipo/periodoId.pdf
-- Public read so cached PDFs can be served via redirect (CDN delivery).
-- Write/delete restricted to service_role (server actions only).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-cache',
  'pdf-cache',
  true,
  20971520,               -- 20 MB per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (anyone with the URL can download — URLs are non-guessable UUIDs)
CREATE POLICY "pdf_cache_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pdf-cache');

-- Only service_role can write / delete (via server actions / admin client)
-- No INSERT/UPDATE/DELETE policies for authenticated users — admin client bypasses RLS
