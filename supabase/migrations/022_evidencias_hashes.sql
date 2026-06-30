-- Duplicate-detection columns for evidencias.
-- file_hash: SHA-256 of the original file (before client-side Canvas compression).
-- phash:     64-bit average-hash (aHash) stored as 16-char hex.
--            Hamming distance ≤ 10 → visually similar images.
ALTER TABLE evidencias
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS phash     TEXT;

-- Index for O(log n) exact-match lookups (SHA-256).
CREATE INDEX IF NOT EXISTS idx_evidencias_file_hash
  ON evidencias (file_hash)
  WHERE file_hash IS NOT NULL;
