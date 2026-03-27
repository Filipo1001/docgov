-- ─────────────────────────────────────────────────────────────
-- Migration 004: Supervisores staging + UI improvements
-- Run in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- 1. Extend contratistas_importados to support any rol
ALTER TABLE contratistas_importados
  ADD COLUMN IF NOT EXISTS rol         TEXT NOT NULL DEFAULT 'contratista',
  ADD COLUMN IF NOT EXISTS email_sugerido TEXT;

-- 2. Make cedula nullable for supervisors (they may not have it yet)
ALTER TABLE contratistas_importados
  ALTER COLUMN cedula DROP NOT NULL;

-- 3. Insert the 4 secretaries as pending supervisor accounts
INSERT INTO contratistas_importados
  (nombre_completo, cedula, cargo, secretaria, rol, email_sugerido)
VALUES
  (
    'Yorledy Bibiana Vásquez Mesa',
    NULL,
    'Secretaria de Bienestar Social, Salud y Educación',
    'Secretaría de Bienestar Social, Salud y Educación',
    'supervisor',
    'saludyeducacion@fredonia-antioquia.gov.co'
  ),
  (
    'Sara Sanchez Velez',
    NULL,
    'Secretaria General y de Gobierno (e)',
    'Secretaría General y de Gobierno',
    'supervisor',
    'secretariadegobierno@fredonia-antioquia.gov.co'
  ),
  (
    'Lucas Edilson Muñoz Moreno',
    NULL,
    'Secretario de Desarrollo Territorial',
    'Secretaría de Desarrollo Territorial',
    'supervisor',
    'secretariadeplaneacion@fredonia-antioquia.gov.co'
  ),
  (
    'Ivan Montoya Murillo',
    NULL,
    'Secretario de Hacienda',
    'Secretaría de Hacienda',
    'supervisor',
    'hacienda@fredonia-antioquia.gov.co'
  )
ON CONFLICT DO NOTHING;
