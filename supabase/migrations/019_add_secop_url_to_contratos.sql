-- Migration 019: Add secop_url to contratos
--
-- Stores the public URL to the contract on the SECOP II platform.
-- Nullable: existing contracts won't have it; imported ones get it from the Excel.

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS secop_url TEXT;
