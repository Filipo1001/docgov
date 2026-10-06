/**
 * Cómo se ve cada tramo del cumplimiento, en los diagramas de cumplimiento del módulo (ver `cumplimientoDe` en `lib/pdm/graficos.ts`).
 *
 * Tres tonos que van de lo hecho a lo que falta: verde hondo (cumplido), verde medio (en avance) y gris claro (sin avance). Se
 * separan por CLARIDAD, no solo por tono: del más oscuro al más claro hay un salto parecido entre uno y otro, así que se distinguen
 * también en blanco y negro o por quien no ve bien el verde. Y ningún tramo se entiende solo por su color: cada uno lleva su palabra
 * y su cifra en la leyenda.
 *
 * Es un reparto de HECHOS (cuántos llegaron a su meta, cuántos van en camino, cuántos aún no tienen avance validado). No usa el
 * rojo ni el ámbar del semáforo: «atrasado» y «crítico» siguen sin umbrales definidos por la Alcaldía.
 */

import type { Cumplimiento } from '@/lib/pdm/graficos'

export type ClaveTramo = 'cumplidos' | 'parciales' | 'sinAvance'

export const TRAMOS: readonly { clave: ClaveTramo; etiqueta: string; detalle: string; color: string }[] = [
  { clave: 'cumplidos', etiqueta: 'Cumplido', detalle: 'Llegó a su meta', color: '#2E7D5B' },
  { clave: 'parciales', etiqueta: 'En avance', detalle: 'Con avance validado, sin llegar a la meta', color: '#6DB592' },
  { clave: 'sinAvance', etiqueta: 'Sin avance', detalle: 'Aún sin avance validado', color: '#D5DAE3' },
]

/** El porcentaje de un tramo sobre el total, entero. Nunca redondea hacia un extremo que no es cierto (99,6 no es «100»). */
export function pctDe(parte: number, total: number): number {
  if (total <= 0 || parte <= 0) return 0
  const p = (100 * parte) / total
  if (p > 0 && p < 1) return 1
  return parte >= total ? 100 : Math.min(Math.round(p), 99)
}

export const cuentaDeTramo = (c: Cumplimiento, clave: ClaveTramo): number => c[clave]
