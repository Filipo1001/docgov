/**
 * lib/vigencia-contrato.ts — ¿Un contrato está vigente o vencido HOY?
 *
 * Vigente: su fecha de terminación es hoy o después, y nadie lo cerró antes de tiempo. Vencido: su fecha ya pasó, o
 * se terminó anticipadamente, se liquidó o se cedió (lib/estado-contrato.ts). Un contrato suspendido sigue vigente: la
 * suspensión detiene la ejecución, no el contrato.
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

/** Los estados que cierran un contrato antes de su fecha (un acto de alguien, no el calendario). */
const CERRADOS = new Set(['terminado', 'liquidado', 'cedido'])

export function vigenciaDe(
  contrato: { fecha_fin?: string | null; estado?: string | null },
  hoy: string,
): Vigencia {
  if (contrato.estado && CERRADOS.has(contrato.estado)) return 'vencido'
  if (!contrato.fecha_fin) return 'vigente'
  return contrato.fecha_fin.slice(0, 10) >= hoy ? 'vigente' : 'vencido'
}
