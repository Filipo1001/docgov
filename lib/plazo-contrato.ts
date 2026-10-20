/**
 * lib/plazo-contrato.ts — El PLAZO de un contrato en días, calculado de sus fechas.
 *
 * ── La regla ─────────────────────────────────────────────────────────────
 *
 * Se cuentan el primer Y el último día (decisión de Felipe, 20-oct-2026): del 2 de febrero al 31 de julio son 180 días;
 * del 1 de enero al 31 de diciembre, 365. El plazo NO se escribe: sale de la fecha de inicio y la de terminación, y no
 * se corrige a mano. Si el número no cuadra, lo que se corrige son las fechas.
 *
 * ── Por qué una sola cuenta ──────────────────────────────────────────────
 *
 * Antes había cuatro. El formulario pedía el plazo y calculaba la fecha de fin contando los dos días; las actas de
 * supervisión y de pago y la cuenta de cobro calculaban el plazo desde las fechas SIN el último día. El mismo contrato
 * decía 180 en pantalla y 179 en el acta. Ahora el formulario, el servidor y los documentos usan `diasDelPlazo`.
 *
 * ── Lo ya emitido no cambia ──────────────────────────────────────────────
 *
 * Regla 3 de CLAUDE.md. Un periodo que ya estaba aprobado o radicado cuando se publicó este cambio tiene sus documentos
 * emitidos con la cuenta vieja, y más de la mitad no está en el caché de PDF: si alguien los abriera, se regenerarían.
 * Para que digan lo mismo que la copia radicada en SECOP, conservan la cuenta sin el último día (`cuentaUltimoDia`).
 */

import { numeroALetras } from './numero-letras'

const MS_POR_DIA = 86_400_000
const FORMA_DE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Una fecha `AAAA-MM-DD` como medianoche UTC (sin zona horaria de por medio), o `null` si no es una fecha real. */
function fechaUTC(iso: string | null | undefined): number | null {
  const m = FORMA_DE_FECHA.exec((iso ?? '').slice(0, 10))
  if (!m) return null
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = Date.UTC(anio, mes - 1, dia)
  const d = new Date(t)
  // 2026-02-30 «existe» para Date (lo pasa a marzo): aquí no.
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return t
}

/**
 * Los días del plazo entre la fecha de inicio y la de terminación, contando las dos. `null` si falta una fecha, si no
 * es una fecha real o si la terminación es anterior al inicio.
 *
 * `contarUltimoDia: false` es la cuenta VIEJA (sin el último día) y solo existe para los documentos ya emitidos con
 * ella: ver `cuentaUltimoDia`.
 */
export function diasDelPlazo(
  inicio: string | null | undefined,
  fin: string | null | undefined,
  { contarUltimoDia = true }: { contarUltimoDia?: boolean } = {},
): number | null {
  const a = fechaUTC(inicio)
  const b = fechaUTC(fin)
  if (a === null || b === null || b < a) return null
  return Math.round((b - a) / MS_POR_DIA) + (contarUltimoDia ? 1 : 0)
}

/** «DOSCIENTOS DÍAS (200)», «UN DÍA (1)», «VEINTIÚN DÍAS (21)». */
export function plazoEnLetras(dias: number): string {
  return `${numeroALetras(dias)} ${dias === 1 ? 'DÍA' : 'DÍAS'} (${dias})`
}

/** Los meses que se guardan junto al plazo (`plazo_meses`): una aproximación que el sistema ya usaba, días / 30. */
export const mesesDelPlazo = (dias: number): number => Math.round(dias / 30)

/**
 * Desde cuándo las actas y la cuenta de cobro cuentan el último día. Es el momento en que se publicó el cambio: un
 * periodo aprobado antes conserva la cuenta con que se emitieron sus documentos.
 *
 * SE FIJA AL PUBLICAR (no al programar): es la hora exacta del despliegue a producción. Un periodo aprobado entre que se
 * escribió esto y que se publicó se emitió con la cuenta vieja.
 */
export const PLAZO_INCLUSIVO_DESDE = '2026-10-21T05:00:00Z'

/**
 * ¿Los documentos de este periodo cuentan el último día del plazo?
 *
 *   · Un periodo que todavía no está aprobado ni radicado: SÍ (sus documentos se emiten de aquí en adelante).
 *   · Uno aprobado o radicado DESPUÉS de publicar el cambio: SÍ.
 *   · Uno aprobado o radicado ANTES: NO, para que lo regenerado diga lo mismo que lo radicado. Los 87 radicados que no
 *     tienen fecha de aprobación son anteriores a que existiera ese campo: también conservan la cuenta vieja.
 */
export function cuentaUltimoDia(periodo: { estado?: string | null; fecha_aprobacion?: string | null }): boolean {
  if (periodo.estado !== 'aprobado' && periodo.estado !== 'radicado') return true
  if (!periodo.fecha_aprobacion) return false
  return new Date(periodo.fecha_aprobacion).getTime() >= new Date(PLAZO_INCLUSIVO_DESDE).getTime()
}
