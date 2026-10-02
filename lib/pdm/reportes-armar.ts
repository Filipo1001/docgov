import { sinAsignar, type Indicador } from './plan'
import { resumirAnio, type ReporteAnio, type ResumenAnio } from './seguimiento'

/**
 * Cómo va un año: cuántos indicadores faltan por reportar, cuántos esperan validación, cuántos
 * están aprobados o devueltos, en total y por secretaría. Es lo que mira quien supervisa o audita
 * («Reportes»), y vale para cualquiera de los años del plan.
 *
 * Pura: no lee nada. Recibe los indicadores ya proyectados al año que se mira (`proyectarLista`): lo que quien
 * mira tiene a la vista (la base ya recortó lo que no le corresponde) y, en cada uno, dónde va en ese año.
 */

export interface FilaSecretaria {
  dependencia: string
  resumen: ResumenAnio
  /** Cuántos indicadores de la secretaría tienen a alguien a su cargo. */
  conResponsable: number
}

export interface PorValidar {
  indicador: Indicador
  reporte: ReporteAnio
}

export interface ReportesDelAnio {
  total: ResumenAnio
  /** Indicadores con alguien a su cargo, y los que no tienen a nadie (a esos no se les puede pedir nada). */
  conResponsable: number
  sinResponsable: number
  /** Orden alfabético. */
  porSecretaria: FilaSecretaria[]
  /** Lo reportado que espera a la secretaría, lo más antiguo primero (lo que más lleva esperando). */
  porValidar: PorValidar[]
}

export function armarReportesDelAnio(indicadores: Indicador[]): ReportesDelAnio {
  const situaciones = indicadores.map(i => i.enAnio?.situacion ?? null)

  const porDependencia = new Map<string, Indicador[]>()
  for (const i of indicadores) {
    const lista = porDependencia.get(i.dependencia) ?? []
    lista.push(i)
    porDependencia.set(i.dependencia, lista)
  }

  const porValidar: PorValidar[] = []
  for (const i of indicadores) {
    const reporte = i.enAnio?.reporte
    if (reporte?.estado === 'pendiente') porValidar.push({ indicador: i, reporte })
  }
  porValidar.sort((a, b) => (a.reporte.creado < b.reporte.creado ? -1 : a.reporte.creado > b.reporte.creado ? 1 : a.indicador.id - b.indicador.id))

  const sinResponsable = indicadores.filter(sinAsignar).length
  return {
    total: resumirAnio(situaciones),
    conResponsable: indicadores.length - sinResponsable,
    sinResponsable,
    porSecretaria: [...porDependencia.entries()]
      .map(([dependencia, lista]) => ({
        dependencia,
        resumen: resumirAnio(lista.map(i => i.enAnio?.situacion ?? null)),
        conResponsable: lista.filter(i => !sinAsignar(i)).length,
      }))
      .sort((a, b) => a.dependencia.localeCompare(b.dependencia, 'es')),
    porValidar,
  }
}
