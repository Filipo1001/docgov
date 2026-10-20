/**
 * lib/plazo-contrato.ts — El PLAZO de un contrato en días.
 *
 * ── Qué es cada cosa ─────────────────────────────────────────────────────
 *
 * El plazo en días se ESCRIBE (decisión de Felipe, 20-oct-2026): es lo que dice el contrato firmado. Las fechas de inicio y
 * de terminación dicen cuándo se vence, y de ellas sale una SUGERENCIA de plazo, contando el primer y el último día: del 2 de
 * febrero al 31 de julio son 180 días; del 1 de enero al 31 de diciembre, 365. La sugerencia llena el campo mientras nadie lo
 * toca; si lo que dice el contrato es otra cosa, se escribe y manda. Cuando las dos no coinciden, la pantalla lo avisa, no lo
 * impide: en 105 de los 173 contratos que había el 20-oct el plazo guardado no coincide con sus fechas.
 *
 * ── Qué imprimen los documentos ──────────────────────────────────────────
 *
 * Las actas y la cuenta de cobro imprimen el plazo del contrato: el escrito MÁS los días de los otrosíes ya aplicados. Hay que
 * sumarlos porque aplicar un otrosí de prórroga mueve la fecha de terminación pero no toca el plazo escrito: el 025-2026 tiene
 * plazo 240 y un otrosí de 90 días aplicado; imprimir solo 240 perdería los 90 que los documentos de hoy sí cuentan (hoy
 * salen de las fechas). Un contrato sin plazo escrito imprime lo que dan sus fechas.
 *
 * ── Lo ya emitido no cambia ──────────────────────────────────────────────
 *
 * Regla 3 de CLAUDE.md. Un periodo que ya estaba aprobado o radicado cuando se publicó este cambio tiene sus documentos
 * emitidos con la cuenta vieja —las fechas, sin el último día—, y más de la mitad no está en el caché de PDF: si alguien los
 * abriera, se regenerarían. Para que digan lo mismo que la copia radicada en SECOP conservan esa cuenta (`plazoParaDocumento`).
 */

import { numeroALetras } from './numero-letras'

const MS_POR_DIA = 86_400_000
const FORMA_DE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Lo más que se acepta como plazo escrito: diez años. Un número más grande es un error de digitación. */
export const MAX_PLAZO_DIAS = 3650

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
 * Los días entre la fecha de inicio y la de terminación, contando las dos. `null` si falta una fecha, si no es una fecha real
 * o si la terminación es anterior al inicio. Es la SUGERENCIA de plazo y, para un contrato sin plazo escrito, lo que se imprime.
 *
 * `contarUltimoDia: false` es la cuenta VIEJA (sin el último día) y solo existe para los documentos ya emitidos con ella.
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

// ─── El plazo escrito ─────────────────────────────────────────────────────────

/**
 * Lo que alguien escribió en el campo de plazo, o `null` si no es un plazo: vacío, con letras, decimal, cero, negativo o
 * mayor que `MAX_PLAZO_DIAS`. Solo dígitos: «1e3» y «12,5» no son un plazo.
 */
export function leerPlazoEscrito(texto: string | number | null | undefined): number | null {
  const t = String(texto ?? '').trim()
  if (!/^\d{1,5}$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= MAX_PLAZO_DIAS ? n : null
}

/** Lo mismo para lo que llega a una acción del servidor (un número o un texto): un entero entre 1 y `MAX_PLAZO_DIAS`, o `null`. */
export const plazoValido = (valor: unknown): number | null =>
  typeof valor === 'number' ? (Number.isInteger(valor) ? leerPlazoEscrito(String(valor)) : null) : leerPlazoEscrito(typeof valor === 'string' ? valor : null)

/**
 * Lo que muestra y lo que guardaría el campo de plazo de un formulario. Mientras nadie lo toca (`tocado: false`) sigue a las
 * fechas; una vez tocado manda lo escrito, aunque quede vacío (entonces se guardaría la sugerencia, y lo escrito que no es un
 * plazo se marca como inválido en vez de corregirse en silencio).
 */
export function resolverPlazo(porFechas: number | null, texto: string, tocado: boolean): { valor: string; efectivo: number | null; invalido: boolean } {
  const valor = tocado ? texto : porFechas !== null ? String(porFechas) : ''
  const vacio = valor.trim() === ''
  const leido = leerPlazoEscrito(valor)
  return { valor, efectivo: vacio ? porFechas : leido, invalido: !vacio && leido === null }
}

export type ComparacionDePlazo =
  /** No hay con qué comparar (faltan fechas o plazo). */
  | { tipo: 'sin_comparar' }
  | { tipo: 'coincide' }
  | { tipo: 'distinto'; escrito: number; porFechas: number; diferencia: number }

/** ¿El plazo escrito coincide con lo que dan las fechas? No impide nada: la pantalla solo lo avisa. */
export function compararPlazo(escrito: number | null, porFechas: number | null): ComparacionDePlazo {
  if (escrito === null || porFechas === null) return { tipo: 'sin_comparar' }
  if (escrito === porFechas) return { tipo: 'coincide' }
  return { tipo: 'distinto', escrito, porFechas, diferencia: escrito - porFechas }
}

// ─── Lo que imprimen los documentos ───────────────────────────────────────────

/**
 * Desde cuándo las actas y la cuenta de cobro imprimen el plazo del contrato. Es el momento en que se publicó el cambio: un
 * periodo aprobado antes conserva la cuenta con que se emitieron sus documentos.
 *
 * Fijado el 20-oct-2026 a las 20:04 UTC (3:04 p. m. en Colombia) con 16 minutos de margen sobre la subida a `main`: lo que se
 * apruebe mientras Vercel construye todavía lo emite el código viejo, y por eso cuenta como «ya emitido». El margen solo se
 * equivoca hacia el lado seguro: un periodo aprobado entre que el despliegue sale y las 20:20 conserva la cuenta vieja (la
 * misma que imprimiría el código viejo) y la conserva para siempre, porque la regla depende solo de su fecha de aprobación.
 * Ese día no había una sola aprobación en los 7 días anteriores.
 */
export const PLAZO_DEL_CONTRATO_DESDE = '2026-10-20T20:20:00Z'

/**
 * ¿Los documentos de este periodo usan la regla nueva del plazo?
 *
 *   · Un periodo que todavía no está aprobado ni radicado: SÍ (sus documentos se emiten de aquí en adelante).
 *   · Uno aprobado o radicado DESPUÉS de publicar el cambio: SÍ.
 *   · Uno aprobado o radicado ANTES: NO, para que lo regenerado diga lo mismo que lo radicado. Los 87 radicados que no
 *     tienen fecha de aprobación son anteriores a que existiera ese campo: también conservan la cuenta vieja.
 */
export function reglaNuevaDelPlazo(periodo: { estado?: string | null; fecha_aprobacion?: string | null }): boolean {
  if (periodo.estado !== 'aprobado' && periodo.estado !== 'radicado') return true
  if (!periodo.fecha_aprobacion) return false
  return new Date(periodo.fecha_aprobacion).getTime() >= new Date(PLAZO_DEL_CONTRATO_DESDE).getTime()
}

/**
 * El plazo, en días, que imprimen las actas y la cuenta de cobro de un periodo; `null` si no hay de dónde sacarlo.
 *
 *   · Periodo ya emitido con la cuenta vieja: las fechas, sin el último día (lo que se imprimió entonces).
 *   · Con plazo escrito: el escrito más los días de los otrosíes aplicados.
 *   · Sin plazo escrito: las fechas, contando el último día.
 */
export function plazoParaDocumento(
  contrato: { plazo_dias?: number | null; dias_otrosi_aplicados?: number | null; fecha_inicio?: string | null; fecha_fin?: string | null },
  periodo: { estado?: string | null; fecha_aprobacion?: string | null },
): number | null {
  if (!reglaNuevaDelPlazo(periodo)) return diasDelPlazo(contrato.fecha_inicio, contrato.fecha_fin, { contarUltimoDia: false })
  const escrito = leerPlazoEscrito(contrato.plazo_dias)
  if (escrito !== null) return escrito + Math.max(0, Math.trunc(contrato.dias_otrosi_aplicados ?? 0))
  return diasDelPlazo(contrato.fecha_inicio, contrato.fecha_fin)
}
