/**
 * Los informes de un mes: qué se pide y cómo se reparte en las dos listas de /dashboard/informes.
 *
 * La pantalla muestra dos listas del MISMO mes: los informes presentados (más los históricos) y los que siguen en borrador
 * («Sin enviar»). Antes eran dos consultas separadas con el mismo `select`; ahora es UNA consulta y este reparto. Menos
 * viajes, y las dos listas salen siempre del mismo instante: no puede pasar que una se refresque y la otra no.
 */

import { informePresentado } from '@/lib/constants'
import type { Periodo } from '@/lib/types'

/**
 * Lo que se lee de cada periodo del mes, con su contrato, las personas y las preaprobaciones. `devoluciones` trae solo el
 * estado de cada paso del historial: la tarjeta cuenta cuántas veces se devolvió (`contarDevoluciones`).
 */
export const SELECT_INFORMES_MES = `
  *,
  contrato:contratos(
    id, numero, objeto, contratista_id, supervisor_id, dependencia_id,
    contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, foto_url),
    supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
    dependencia:dependencias(nombre, abreviatura)
  ),
  preaprobaciones(id, asesor_id, created_at, asesor:usuarios!preaprobaciones_asesor_id_fkey(id, nombre_completo)),
  devoluciones:historial_periodos(estado_nuevo)
`

export interface InformesDelMes {
  /** Presentados (enviado en adelante) y los históricos, por fecha de envío. */
  periodos: Periodo[]
  /** Todavía en borrador y no históricos, por contrato. */
  borradores: Periodo[]
}

/** Por fecha de envío, de la más antigua a la más reciente, y los que no tienen fecha al final (como ordena la base). */
function porFechaDeEnvio(a: Periodo, b: Periodo): number {
  if (!a.fecha_envio && !b.fecha_envio) return 0
  if (!a.fecha_envio) return 1
  if (!b.fecha_envio) return -1
  return a.fecha_envio.localeCompare(b.fecha_envio)
}

/**
 * Reparte los periodos de un mes en las dos listas. `dependenciaId` acota al asesor a su dependencia; el supervisor no lo
 * necesita porque la base ya lo limita a sus contratos.
 */
export function separarInformesDelMes(filas: Periodo[], dependenciaId?: string): InformesDelMes {
  const deLaDependencia = (p: Periodo) => !dependenciaId || p.contrato?.dependencia_id === dependenciaId

  const periodos = filas
    .filter(p => informePresentado(p.estado) || p.es_historico === true)
    .filter(deLaDependencia)
    .sort(porFechaDeEnvio)

  const borradores = filas
    .filter(p => p.estado === 'borrador' && p.es_historico === false)
    .filter(deLaDependencia)
    .sort((a, b) => (a.contrato_id ?? '').localeCompare(b.contrato_id ?? ''))

  return { periodos, borradores }
}

/** Cuántas veces se devolvió un informe al contratista, según su historial. */
export function contarDevoluciones(p: Periodo): number {
  return (p.devoluciones ?? []).filter(h => h.estado_nuevo === 'rechazado').length
}

/** Lo que todavía pide algo de quien revisa: por revisar (enviado, en revisión) o aprobado sin radicar. */
export function pendienteDeRevisar(p: Periodo): boolean {
  return !p.es_historico && (p.estado === 'enviado' || p.estado === 'revision' || p.estado === 'aprobado')
}

/**
 * En qué mes abre /dashboard/informes. Los informes de un mes llegan a comienzos del siguiente: el 3 de noviembre, el
 * trabajo está en octubre y noviembre casi vacío. Por eso abre en el mes ANTERIOR mientras ese mes tenga algo pendiente
 * (por revisar o por radicar) para quien mira; cuando queda al día, abre en el mes en curso. Se ajusta solo, sin fechas.
 */
export function mesDeApertura(hoy: Date, anteriorTienePendientes: boolean): { mesIdx: number; anio: number; esAnterior: boolean } {
  const actual = { mesIdx: hoy.getMonth(), anio: hoy.getFullYear() }
  return anteriorTienePendientes ? { ...mesVecino(actual.mesIdx, actual.anio, -1), esAnterior: true } : { ...actual, esAnterior: false }
}

/** El mes y el año a `delta` meses del dado (mesIdx 0 = enero). */
export function mesVecino(mesIdx: number, anio: number, delta: number): { mesIdx: number; anio: number } {
  const total = anio * 12 + mesIdx + delta
  return { mesIdx: ((total % 12) + 12) % 12, anio: Math.floor(total / 12) }
}
