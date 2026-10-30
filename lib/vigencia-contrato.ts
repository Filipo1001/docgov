/**
 * lib/vigencia-contrato.ts — ¿Un contrato está vigente o vencido HOY?
 *
 * Vigente: su fecha de fin EFECTIVA es hoy o después, y nadie lo cerró de otro modo. La fecha de fin efectiva es la
 * pactada o, si se terminó antes (migración 081), el último día de ejecución: la base la calcula en
 * `contratos.fecha_fin_efectiva` y es la única definición de «hasta cuándo va el contrato». Un contrato terminado sigue
 * vigente hasta su último día de ejecución (la terminación puede registrarse por adelantado). Liquidado o cedido: vencido.
 * Un contrato suspendido sigue vigente: la suspensión detiene la ejecución, no el contrato.
 *
 * Toda consulta que pregunte por contratos «activos» filtra por `fecha_fin_efectiva`, nunca por `fecha_fin`:
 * tests/cd/terminacion-contrato.test.ts lo vigila en el código.
 *
 * «Hoy» es el día en Colombia, no en UTC. Antes la lista usaba `new Date().toISOString()`, que a partir de las 7 de la
 * noche ya es el día siguiente: un contrato que terminaba ese día aparecía como vencido desde las 7 p. m.
 */

/** La fecha de hoy en Colombia, `AAAA-MM-DD`. */
export function hoyEnColombia(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
}

export type Vigencia = 'vigente' | 'vencido'

/** Los estados que cierran un contrato por un acto que no es la terminación con fecha (lib/estado-contrato.ts). */
const CERRADOS = new Set(['liquidado', 'cedido'])

export type FechasDelContrato = {
  fecha_fin?: string | null
  fecha_terminacion?: string | null
  fecha_fin_efectiva?: string | null
  estado?: string | null
}

/** Hasta qué día va el contrato de verdad: el último de ejecución si se terminó antes, si no, el pactado. */
export function finEfectivo(contrato: FechasDelContrato): string | null {
  const f = contrato.fecha_fin_efectiva ?? contrato.fecha_terminacion ?? contrato.fecha_fin
  return f ? f.slice(0, 10) : null
}

export function vigenciaDe(contrato: FechasDelContrato, hoy: string): Vigencia {
  if (contrato.estado && CERRADOS.has(contrato.estado)) return 'vencido'
  // Un «terminado» sin su fecha no debería existir (la base los ata desde la 081); si llega uno así, no está vigente.
  if (contrato.estado === 'terminado' && !contrato.fecha_terminacion && !contrato.fecha_fin_efectiva) return 'vencido'
  const fin = finEfectivo(contrato)
  if (!fin) return 'vigente'
  return fin >= hoy ? 'vigente' : 'vencido'
}

/**
 * ¿Estuvo vigente en algún momento entre dos días? Para los informes de un mes: empezó antes de que acabara la ventana y
 * no había terminado cuando empezó. Un contrato que nunca se ejecutó (último día anterior al inicio) no lo estuvo nunca.
 */
export function vigenteEntre(
  contrato: FechasDelContrato & { fecha_inicio: string },
  desde: string,
  hasta: string,
): boolean {
  const inicio = contrato.fecha_inicio.slice(0, 10)
  const fin = finEfectivo(contrato)
  if (!fin) return inicio <= hasta
  return inicio <= hasta && fin >= desde && fin >= inicio
}
