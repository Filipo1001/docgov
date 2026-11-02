/**
 * El resumen semanal de gestión: UN correo por persona, los lunes, con todo lo que antes llegaba en correos sueltos.
 *
 * Antes cada regla del cron escribía por su cuenta a quien gestiona: el estado de la bandeja (cada 2 o 3 días, hasta 15
 * al mes por secretario), los informes devueltos sin corregir, los contratistas sin su primer informe, el expediente
 * incompleto y, desde el 2-nov, los contratos por vencer. Cada una tenía su propio asunto y su propio guard, y nada las
 * sumaba: un secretario recibía 12 correos al mes y el administrador, correos distintos el mismo día.
 *
 * Ahora cada regla solo APORTA una sección a quien le toca (`aportar`), y el cron manda una sola notificación al final.
 * Una persona sin nada pendiente no recibe nada. Las secciones son genéricas (título, frase, lista recortada) para que
 * una regla nueva se sume sin tocar la plantilla.
 */

import type { DatosVencimientos } from '@/lib/vencimientos'
import { totalVencimientos } from '@/lib/vencimientos'

export type ClaveSeccion = 'bandeja' | 'devueltos' | 'primerizos' | 'expediente'

export interface SeccionResumen {
  clave: ClaveSeccion
  titulo: string
  /** La frase que dice cuánto hay y qué pasa. */
  intro: string
  /** Lo más importante, ya recortado a `MAX_ITEMS`. */
  items: string[]
  /** Cuántos más había y no caben en el correo. */
  restantes: number
  /** Para el asunto: «5 por revisar». */
  cifra: string
}

export interface DatosResumenSemana {
  secciones: SeccionResumen[]
  vencimientos: DatosVencimientos | null
  asunto: string
}

/** Cuántas filas se muestran por sección: el correo es un resumen, no el listado. El resto está en la aplicación. */
export const MAX_ITEMS = 8

/** Arma una sección recortando la lista. */
export function seccion(
  clave: ClaveSeccion, titulo: string, intro: string, todos: string[], cifra: string,
): SeccionResumen {
  return { clave, titulo, intro, items: todos.slice(0, MAX_ITEMS), restantes: Math.max(0, todos.length - MAX_ITEMS), cifra }
}

/** Lo que cada regla aporta, por persona. */
export class AcumuladoSemanal {
  private porPersona = new Map<string, { secciones: SeccionResumen[]; vencimientos: DatosVencimientos | null }>()

  aportar(personaId: string, s: SeccionResumen): void {
    const e = this.porPersona.get(personaId) ?? { secciones: [], vencimientos: null }
    e.secciones.push(s)
    this.porPersona.set(personaId, e)
  }

  aportarVencimientos(personaId: string, v: DatosVencimientos): void {
    if (!totalVencimientos(v)) return
    const e = this.porPersona.get(personaId) ?? { secciones: [], vencimientos: null }
    e.vencimientos = v
    this.porPersona.set(personaId, e)
  }

  personas(): string[] { return [...this.porPersona.keys()] }

  datosDe(personaId: string): DatosResumenSemana | null {
    const e = this.porPersona.get(personaId)
    if (!e || (!e.secciones.length && !e.vencimientos)) return null
    const orden: ClaveSeccion[] = ['bandeja', 'devueltos', 'primerizos', 'expediente']
    const secciones = [...e.secciones].sort((a, b) => orden.indexOf(a.clave) - orden.indexOf(b.clave))
    const d: DatosResumenSemana = { secciones, vencimientos: e.vencimientos, asunto: '' }
    d.asunto = asuntoDe(d)
    return d
  }
}

/** «Resumen semanal: 5 por revisar, 3 contratos por vencer». Máximo tres piezas: un asunto largo se corta en el buzón. */
export function asuntoDe(d: Pick<DatosResumenSemana, 'secciones' | 'vencimientos'>): string {
  const partes = d.secciones.map(s => s.cifra)
  if (d.vencimientos) {
    const n = totalVencimientos(d.vencimientos)
    partes.push(`${n} ${n === 1 ? 'contrato por vencer' : 'contratos por vencer'}`)
  }
  if (partes.length <= 3) return `Resumen semanal: ${partes.join(', ')}`
  return `Resumen semanal: ${partes.slice(0, 3).join(', ')} y más`
}

/** El texto plano de la campana: una línea por sección, sin listas. */
export function mensajeCampana(d: DatosResumenSemana): string {
  const lineas = d.secciones.map(s => s.intro)
  if (d.vencimientos) {
    const n = totalVencimientos(d.vencimientos)
    lineas.push(`${n} ${n === 1 ? 'contrato se acerca' : 'contratos se acercan'} a su fecha de fin.`)
  }
  return `${lineas.join(' ')} El detalle está en tu correo.`
}

export function tituloCampana(d: DatosResumenSemana): string {
  return d.asunto.replace(/^Resumen semanal:\s*/, 'Esta semana: ')
}
