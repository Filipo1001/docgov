-- Migration 026: Private buckets + drop lax storage policies (audit C1 + C2)
--
-- evidencias, documentos (planillas SS + firmas) and pdf-cache (actas with
-- cédulas/bank data) held sensitive files publicly readable by anyone with
-- the URL, and any authenticated user could DELETE/UPDATE any object.
--
-- New model: the three buckets are private with NO authenticated/anon
-- policies. Every operation is server-mediated through the service role
-- (signed URLs for display, createSignedUploadUrl for uploads,
-- storage.download for server-side reads) after the app's own auth checks.
-- avatars stays public (profile photos, low sensitivity, high UI surface).
--
-- IMPORTANT: apply only AFTER deploying the code that signs URLs
-- (lib/storage-firmado.ts and its consumers) — order guarantees zero downtime.

UPDATE storage.buckets SET public = false
WHERE id IN ('evidencias', 'documentos', 'pdf-cache');

-- evidencias
DROP POLICY IF EXISTS "Todos pueden ver evidencias"                    ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar evidencias" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados pueden subir evidencias"    ON storage.objects;
DROP POLICY IF EXISTS "update_evidencias"                              ON storage.objects;

-- documentos
DROP POLICY IF EXISTS "read_documentos"   ON storage.objects;
DROP POLICY IF EXISTS "upload_documentos" ON storage.objects;
DROP POLICY IF EXISTS "update_documentos" ON storage.objects;
DROP POLICY IF EXISTS "delete_documentos" ON storage.objects;

-- pdf-cache
DROP POLICY IF EXISTS "pdf_cache_public_read"          ON storage.objects;
DROP POLICY IF EXISTS "pdf_cache_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "pdf_cache_authenticated_update" ON storage.objects;
