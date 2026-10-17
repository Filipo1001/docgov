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

import { pesosEnLetras } from './numero-letras'

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
 * "SARA" | "MARÍA JOSÉ" → "Sara" | "María José"
 *
 * Los nombres se guardan en mayúsculas (normalizeName) porque así los exige
 * un documento oficial. Un saludo de bienvenida no es un documento oficial:
 * "Buenos días, SARA" lee como si el sistema estuviera gritando. Se usa solo
 * en superficies de trato directo (saludos, encabezados de bienvenida), nunca
 * en un PDF ni en un dato que vaya a un ente de control.
 */
export function capitalizarNombre(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .trim()
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
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

// ─── Valores en letras ────────────────────────────────────────────────────────
// Viven en lib/numero-letras.ts (una sola fuente para todos los documentos); se reexporta para no cambiar los importes.
export { numeroALetras } from './numero-letras'

/**
 * Formatea un valor en pesos colombianos con letras y número:
 * 1_750_000 → "UN MILLÓN SETECIENTOS CINCUENTA MIL PESOS M/L ($1.750.000)"
 * 8_000_000 → "OCHO MILLONES DE PESOS M/L ($8.000.000)"
 */
export function formatValorConLetras(valor: number): string {
  return `${pesosEnLetras(valor)} M/L (${formatCurrency(valor)})`
}

/**
 * Formatea una fecha ISO ("2025-01-15") como texto legible corto.
 * Usa la zona local para evitar desfases de UTC.
 * Ejemplos:
 *   "2025-01-01"  → "1 ene. 2025"
 *   "2025-12-31"  → "31 dic. 2025"
 */
export function formatDateMedium(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * «hace 5 min», «hace 3 h», «hace 2 días» — y a partir de una semana, la
 * fecha. Un «hace 153 días» no le dice nada a nadie; «28 abr» sí.
 *
 * Vivía copiado dentro de NotificacionesBell. Sube aquí al necesitarlo la
 * tarjeta de devolución del panel: dos copias de un formateador de fechas es
 * como se acaba teniendo dos formas distintas de decir lo mismo.
 */
export function tiempoRelativo(fechaISO: string): string {
  const diff = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`
  return new Date(fechaISO).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}
