/**
 * Los informes de un mes: qué se pide y cómo se reparte en las dos listas de /dashboard/informes.
 *
 * La pantalla muestra dos listas del MISMO mes: los informes presentados (más los históricos) y los que siguen en borrador
 * («Sin enviar»). Antes eran dos consultas separadas con el mismo `select`; ahora es UNA consulta y este reparto. Menos
 * viajes, y las dos listas salen siempre del mismo instante: no puede pasar que una se refresque y la otra no.
 */

import { informePresentado } from '@/lib/constants'
import type { Periodo } from '@/lib/types'

/** Lo que se lee de cada periodo del mes, con su contrato, las personas y las preaprobaciones. */
export const SELECT_INFORMES_MES = `
  *,
  contrato:contratos(
    id, numero, objeto, contratista_id, supervisor_id, dependencia_id,
    contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, foto_url),
    supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
    dependencia:dependencias(nombre, abreviatura)
  ),
  preaprobaciones(id, asesor_id, created_at, asesor:usuarios!preaprobaciones_asesor_id_fkey(id, nombre_completo))
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

/** El mes y el año a `delta` meses del dado (mesIdx 0 = enero). */
export function mesVecino(mesIdx: number, anio: number, delta: number): { mesIdx: number; anio: number } {
  const total = anio * 12 + mesIdx + delta
  return { mesIdx: ((total % 12) + 12) % 12, anio: Math.floor(total / 12) }
}
