import type { EstadoReporte } from './seguimiento'

/**
 * El semáforo del estado de un reporte: qué luz es, qué dice y a quién le toca.
 *
 * ── Qué mide ─────────────────────────────────────────────────────────────
 *
 * Qué pasó con lo que se subió, no cuánto hace. La luz es la del reporte MÁS RECIENTE del año, y eso basta: un reporte
 * se corrige o se reemplaza, así que solo el último puede estar sin aprobar (los anteriores, si siguen vigentes, ya están
 * aprobados). No hay una regla de «el peor gana» que inventar.
 *
 *   rojo   Devuelto      la secretaría pidió una corrección: le toca a quien reportó.
 *   ámbar  Sin validar   se reportó y nadie lo ha revisado: le toca a la secretaría.
 *   verde  Aprobado      la secretaría lo aprobó: cuenta en el cumplimiento.
 *
 * Las palabras son las que el módulo ya usa en todas partes («Sin validar», «Aprobado»): una sola manera de nombrar
 * cada estado entre pestañas. El color nunca va solo: lo acompaña la palabra, y la luz viaja con su posición.
 *
 * NO mide cuánto lleva esperando (eso necesita plazos que la Alcaldía no ha fijado). Cuando los fije, la antigüedad se
 * puede añadir como texto bajo la palabra sin cambiar de dónde sale el color.
 */

export type Luz = 'rojo' | 'ambar' | 'verde'

/** De arriba abajo en el semáforo (y de lo que más urge a lo que menos): rojo, ámbar, verde. */
export const LUCES: readonly Luz[] = ['rojo', 'ambar', 'verde']

export const LUZ_DE: Record<EstadoReporte, Luz> = { devuelto: 'rojo', pendiente: 'ambar', aprobado: 'verde' }

export const PALABRA_DE: Record<EstadoReporte, string> = { devuelto: 'Devuelto', pendiente: 'Sin validar', aprobado: 'Aprobado' }

/** Los estados en el orden del semáforo: lo que más urge primero. */
export const ESTADOS_POR_URGENCIA: readonly EstadoReporte[] = ['devuelto', 'pendiente', 'aprobado']

export interface DatosDeSemaforo {
  /** Quién hizo el último reporte (a quien le toca corregirlo si lo devolvieron). */
  autor: string
  /** La secretaría del indicador (a quien le toca validarlo). */
  dependencia: string
  /** Quién lo aprobó, si se sabe. */
  validador: string | null
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? ''

/**
 * La línea de debajo de la palabra: a quién le toca moverse. `null` si no se sabe (no se inventa un nombre).
 * Los verbos van en paralelo («Lo corrige…», «Lo valida…», «Lo aprobó…») para que se lean de un golpe.
 */
export function lineaDeSemaforo(estado: EstadoReporte, d: DatosDeSemaforo): string | null {
  switch (estado) {
    case 'devuelto': return primerNombre(d.autor) !== '' ? `Lo corrige ${primerNombre(d.autor)}` : null
    case 'pendiente': return d.dependencia.trim() !== '' ? `Lo valida ${d.dependencia.trim()}` : null
    case 'aprobado': return d.validador && d.validador.trim() !== '' ? `Lo aprobó ${d.validador.trim()}` : null
  }
}
