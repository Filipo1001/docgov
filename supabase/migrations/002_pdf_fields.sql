-- Migration 002: Optional fields for PDF generation
-- Run this in Supabase Dashboard > SQL Editor to unlock all PDF fields.
-- Safe to run multiple times (all statements use IF NOT EXISTS / DO blocks).

-- ── municipios ───────────────────────────────────────────────
ALTER TABLE municipios
  ADD COLUMN IF NOT EXISTS departamento   TEXT,
  ADD COLUMN IF NOT EXISTS nit            TEXT,        -- e.g. "890.980.848-1"
  ADD COLUMN IF NOT EXISTS representante_legal      TEXT,
  ADD COLUMN IF NOT EXISTS cedula_representante     TEXT;

-- ── contratos ────────────────────────────────────────────────
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS plazo_meses      INTEGER,   -- e.g. 8
  ADD COLUMN IF NOT EXISTS duracion_letras  TEXT,      -- e.g. "OCHO"
  ADD COLUMN IF NOT EXISTS valor_letras_total TEXT;    -- e.g. "VEINTICUATRO MILLONES DE PESOS M/L"

-- ── periodos ─────────────────────────────────────────────────
ALTER TABLE periodos
  ADD COLUMN IF NOT EXISTS valor_letras TEXT;          -- e.g. "TRES MILLONES M/L"

-- ── usuarios ─────────────────────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cargo      TEXT,            -- e.g. "SISTEMAS Y GD"
  ADD COLUMN IF NOT EXISTS telefono   TEXT,            -- e.g. "3192420334"
  ADD COLUMN IF NOT EXISTS direccion  TEXT;            -- e.g. "Vereda la Delgadita - Amagá"
