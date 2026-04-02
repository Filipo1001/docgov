-- Migration 013: Normalize existing text fields for consistency
-- Rules:
--   nombre_completo → UPPER (person names in official Colombian documents)
--   cargo           → UPPER (job titles)
--   email           → lower
--   direccion       → trim only (free text, preserve casing)
--   municipios.nombre / representante_legal → UPPER

-- ─── usuarios ────────────────────────────────────────────────────────────────
UPDATE usuarios
SET
  nombre_completo    = UPPER(TRIM(nombre_completo)),
  cargo              = CASE WHEN cargo IS NOT NULL THEN UPPER(TRIM(cargo)) END,
  email              = LOWER(TRIM(email)),
  direccion          = CASE WHEN direccion IS NOT NULL THEN TRIM(direccion) END
WHERE
  nombre_completo IS DISTINCT FROM UPPER(TRIM(nombre_completo))
  OR (cargo IS NOT NULL AND cargo IS DISTINCT FROM UPPER(TRIM(cargo)))
  OR email IS DISTINCT FROM LOWER(TRIM(email))
  OR (direccion IS NOT NULL AND direccion IS DISTINCT FROM TRIM(direccion));

-- ─── municipios ──────────────────────────────────────────────────────────────
UPDATE municipios
SET
  nombre               = UPPER(TRIM(nombre)),
  representante_legal  = CASE WHEN representante_legal IS NOT NULL THEN UPPER(TRIM(representante_legal)) END
WHERE
  nombre IS DISTINCT FROM UPPER(TRIM(nombre))
  OR (representante_legal IS NOT NULL AND representante_legal IS DISTINCT FROM UPPER(TRIM(representante_legal)));
