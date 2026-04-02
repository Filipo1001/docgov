/**
 * lib/format.ts — Centralized display formatting and text normalization helpers.
 *
 * FORMATTING (presentation-only, never stored):
 *   formatCedula   — "8464867"  → "8.464.867"
 *   formatCurrency — 1500000    → "$1.500.000"
 *
 * NORMALIZATION (applied at write time — creation / update):
 *   normalizeName      — "JUAN CARLOS perez" → "JUAN CARLOS PEREZ"  (names, cargo, representante)
 *   normalizeEmail     — "Admin@Example.COM" → "admin@example.com"
 *   normalizeFreeText  — "  calle 5 #2-10  " → "calle 5 #2-10"     (addresses, notes — trim only)
 */

// ─── Display formatters ───────────────────────────────────────────────────────

/**
 * Format a Colombian ID number with dot thousands separators.
 * Handles numeric strings and numbers; ignores non-digit characters.
 * Examples:
 *   "8464867"  → "8.464.867"
 *   "1022345678" → "1.022.345.678"
 *   null / ""  → ""
 */
export function formatCedula(cedula: string | number | null | undefined): string {
  if (cedula == null || cedula === '') return ''
  const digits = String(cedula).replace(/\D/g, '')
  if (!digits) return ''
  // Insert dots every three digits from the right
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Format a number as Colombian peso currency (no decimals).
 * Example: 1500000 → "$1.500.000"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return ''
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ─── Text normalizers ─────────────────────────────────────────────────────────

/**
 * Normalize a person name or formal identifier to UPPERCASE.
 * Used for: nombre_completo, cargo, representante_legal, municipio.nombre.
 */
export function normalizeName(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toUpperCase()
}

/**
 * Normalize an email to lowercase and trimmed.
 */
export function normalizeEmail(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toLowerCase()
}

/**
 * Normalize free-text fields (addresses, notes, specific obligations).
 * Only trims whitespace — does NOT change casing.
 */
export function normalizeFreeText(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim()
}
