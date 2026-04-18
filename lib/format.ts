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

// ─── Number-to-words (Spanish, Colombia) ─────────────────────────────────────

const UNIDADES = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
]
const DECENAS = [
  '', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA',
  'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
]
const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS',
  'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
]

function letrasHasta999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const centenaTxt = CENTENAS[c]

  let decenaTxt = ''
  if (resto < 20) {
    decenaTxt = UNIDADES[resto]
  } else {
    const d = Math.floor(resto / 10)
    const u = resto % 10
    if (d === 2) {
      // VEINTI + unidad (veintiuno, veintidos…)
      decenaTxt = u === 0 ? 'VEINTE' : `VEINTI${UNIDADES[u]}`
    } else {
      decenaTxt = u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`
    }
  }

  return [centenaTxt, decenaTxt].filter(Boolean).join(' ')
}

/**
 * Convierte un número entero a su representación textual en español (Colombia).
 * Ejemplos:
 *   1_750_000 → "UN MILLON SETECIENTOS CINCUENTA MIL"
 *   27_000_000 → "VEINTISIETE MILLONES"
 *   2_483_871 → "DOS MILLONES CUATROCIENTOS OCHENTA Y TRES MIL OCHOCIENTOS SETENTA Y UNO"
 *
 * Rango soportado: 0 a 999 999 999 999 (hasta billones cortos).
 * Para valores negativos devuelve "MENOS …".
 */
export function numeroALetras(n: number): string {
  if (!Number.isFinite(n)) return ''
  const entero = Math.trunc(n)
  if (entero === 0) return 'CERO'
  if (entero < 0) return `MENOS ${numeroALetras(-entero)}`

  const millones = Math.floor(entero / 1_000_000)
  const resto = entero % 1_000_000
  const miles = Math.floor(resto / 1000)
  const ultimos = resto % 1000

  const partes: string[] = []

  if (millones > 0) {
    if (millones === 1) partes.push('UN MILLON')
    else partes.push(`${letrasHasta999(millones)} MILLONES`)
  }

  if (miles > 0) {
    if (miles === 1) partes.push('MIL')
    else partes.push(`${letrasHasta999(miles)} MIL`)
  }

  if (ultimos > 0) {
    partes.push(letrasHasta999(ultimos))
  }

  return partes.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Formatea un valor en pesos colombianos con letras y número:
 * 1_750_000 → "UN MILLON SETECIENTOS CINCUENTA MIL PESOS M/L ($1.750.000)"
 */
export function formatValorConLetras(valor: number): string {
  return `${numeroALetras(valor)} PESOS M/L (${formatCurrency(valor)})`
}
