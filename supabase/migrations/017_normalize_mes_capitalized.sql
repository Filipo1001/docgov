-- Migration 017: Normalize mes column to capitalized format
-- Root cause: period generation code stores mes as MESES[i] = 'Abril' (capitalized),
-- but some periods were created when the code stored it as 'ABRIL' (uppercase).
-- All queries now use .eq('mes', mes) without toUpperCase(), so data must be consistent.
--
-- INITCAP(LOWER('ABRIL')) = 'Abril'  ✓
-- INITCAP(LOWER('Abril')) = 'Abril'  ✓  (already correct, no-op for these rows)
-- Safe to run multiple times (idempotent).

UPDATE periodos
SET mes = INITCAP(LOWER(mes))
WHERE mes IS DISTINCT FROM INITCAP(LOWER(mes));
