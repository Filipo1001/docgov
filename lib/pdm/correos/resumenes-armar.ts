/**
 * Las cuentas de los RESÚMENES por correo (el mensual de cada secretaría y el semanal del administrador).
 *
 * Funciones PURAS: reciben el plan ya armado (`Indicador[]`, el mismo que alimenta el tablero) y devuelven cifras. No leen
 * nada: la lectura vive en `datos-resumenes.ts`. Así lo que un correo cuenta se puede comprobar contra la pantalla.
 *
 * ── Qué cuenta como «esperando validación» ───────────────────────────────
 *
 * Un reporte VIGENTE de un indicador en un año, enviado y sin aprobar ni devolver (`situacion === 'pendiente'`). Es
 * exactamente el filtro «Sin validar» de la lista de indicadores. Se cuentan los de TODOS los años del plan, no solo el
 * año en curso: un reporte de un año anterior que sigue esperando también es trabajo de la secretaría.
 */

import { cuentaDeAnio } from '../graficos'
import { hoyBogota } from '../contrato'
import { sinAsignar, type Indicador } from '../plan'
import type { IndicadorDeCorreo } from './plantillas'

const MS_DIA = 86_400_000

/** Un indicador del plan, como lo necesitan las plantillas (la fila del plan es lo que lo identifica en la pantalla). */
export const filaDeCorreo = (i: Indicador): IndicadorDeCorreo => ({ fila: i.id, codigo: i.codigo, nombre: i.indicador, unidad: i.unidad, dependencia: i.dependencia })

/** Días enteros desde un instante ISO hasta `ahora` (nunca negativo: un reloj adelantado no da días «de menos uno»). */
export function diasDesde(iso: string, ahora: Date): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((ahora.getTime() - t) / MS_DIA))
}

export interface Pendiente {
  indicador: Indicador
  anio: number
  /** Quién reportó (nombre completo, tal como está en la base). */
  autorNombre: string
  dias: number
}

/**
 * Los reportes que esperan validación, del MÁS ANTIGUO al más reciente. Con `dependencia`, solo los de esa secretaría
 * (por su nombre, que es como el plan llama a la dependencia). A igual antigüedad: por código y por año, para que el
 * orden no cambie de un envío a otro.
 */
export function pendientesDeValidar(lista: Indicador[], ahora: Date, dependencia?: string): Pendiente[] {
  const salida: Pendiente[] = []
  for (const i of lista) {
    if (dependencia !== undefined && i.dependencia !== dependencia) continue
    for (const a of i.anios) {
      const e = a.enAnio
      if (e?.situacion !== 'pendiente' || !e.reporte) continue
      salida.push({ indicador: i, anio: a.anio, autorNombre: e.reporte.autorNombre, dias: diasDesde(e.reporte.creado, ahora) })
    }
  }
  return salida.sort((x, y) => y.dias - x.dias || x.indicador.codigo.localeCompare(y.indicador.codigo) || x.anio - y.anio)
}

/**
 * El año al que lleva el botón «Validar ahora»: el año en curso si tiene algo esperando; si no, el año más antiguo que
 * lo tenga (que es donde está lo que más tiempo lleva).
 */
export function anioDelEnlace(pendientes: Pendiente[], anioActual: number): number {
  if (pendientes.length === 0 || pendientes.some(p => p.anio === anioActual)) return anioActual
  return Math.min(...pendientes.map(p => p.anio))
}

/** Cómo va una secretaría en un año, con las definiciones del tablero (`cuentaDeAnio`). */
export function estadoDeSecretaria(lista: Indicador[], dependencia: string, anio: number) {
  const c = cuentaDeAnio(lista.filter(i => i.dependencia === dependencia), anio, anio)
  return { aprobados: c.aprobados, sinValidar: c.porValidar, devueltos: c.devueltos, faltanReportar: c.faltan, sinResponsable: c.sinResponsable }
}

/** Lo que hay HOY en todo el plan (para el semanal del administrador). */
export function panoramaDeHoy(lista: Indicador[], ahora: Date) {
  const esperando = pendientesDeValidar(lista, ahora)
  return {
    porValidar: esperando.length,
    porValidarMasDe30Dias: esperando.filter(p => p.dias > 30).length,
    sinResponsable: lista.filter(sinAsignar).length,
  }
}

/** Cuántos esperan validación en cada secretaría y cuánto lleva el más antiguo. Solo las que tienen alguno; las más cargadas primero. */
export function esperandoPorSecretaria(pendientes: Pendiente[]): { nombre: string; porValidar: number; masAntiguoDias: number }[] {
  const grupos = new Map<string, { nombre: string; porValidar: number; masAntiguoDias: number }>()
  for (const p of pendientes) {
    const g = grupos.get(p.indicador.dependencia) ?? { nombre: p.indicador.dependencia, porValidar: 0, masAntiguoDias: 0 }
    g.porValidar++
    g.masAntiguoDias = Math.max(g.masAntiguoDias, p.dias)
    grupos.set(p.indicador.dependencia, g)
  }
  return [...grupos.values()].sort((a, b) => b.porValidar - a.porValidar || a.nombre.localeCompare(b.nombre, 'es'))
}

// ─── Fechas del envío (siempre en hora de Colombia: el servidor corre en UTC) ─────────────────────────────

/** «noviembre de 2026» para el mes en que cae `ahora`. */
export function mesDe(ahora: Date): string {
  const [y, m] = hoyBogota(ahora).split('-')
  return new Date(Date.UTC(Number(y), Number(m) - 1, 15, 12)).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const parteDeFecha = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d, fecha: new Date(Date.UTC(y, m - 1, d, 12)) }
}
const nombreMes = (f: Date) => f.toLocaleDateString('es-CO', { month: 'long', timeZone: 'UTC' })

/**
 * La semana que cubre un envío del lunes: los siete días anteriores, del lunes al domingo pasados. «del 12 al 18 de
 * octubre»; si cruza de mes, «del 28 de septiembre al 4 de octubre»; si cruza de año, con los años.
 */
export function rangoDeSemana(ahora: Date): string {
  const ini = parteDeFecha(hoyBogota(new Date(ahora.getTime() - 7 * MS_DIA)))
  const fin = parteDeFecha(hoyBogota(new Date(ahora.getTime() - MS_DIA)))
  if (ini.y !== fin.y) return `del ${ini.d} de ${nombreMes(ini.fecha)} de ${ini.y} al ${fin.d} de ${nombreMes(fin.fecha)} de ${fin.y}`
  if (ini.m !== fin.m) return `del ${ini.d} de ${nombreMes(ini.fecha)} al ${fin.d} de ${nombreMes(fin.fecha)}`
  return `del ${ini.d} al ${fin.d} de ${nombreMes(fin.fecha)}`
}

/** El instante desde el cual cuenta «la semana»: siete días antes de `ahora`. */
export const inicioDeSemana = (ahora: Date): Date => new Date(ahora.getTime() - 7 * MS_DIA)
