import { sinAsignar, type Indicador } from './plan'
import { reporteDeFila, type FilaVigente } from './datos-armar'
import { resumirCorte, situacionEn, type ReporteCorte, type ResumenCorte } from './seguimiento'

/**
 * Cómo va un corte: cuántos indicadores faltan por reportar, cuántos esperan validación, cuántos
 * están aprobados o devueltos, en total y por secretaría. Es lo que mira quien supervisa o audita
 * («Reportes»), y vale para cualquier corte, abierto o cerrado.
 *
 * Pura: no lee nada. `vigentes` son las filas de `pdm_reportes_vigentes` del corte; `indicadores` los que
 * quien mira tiene a la vista (la base ya recortó lo que no le corresponde).
 */

export interface FilaSecretaria {
  dependencia: string
  resumen: ResumenCorte
}

export interface PorValidar {
  indicador: Indicador
  reporte: ReporteCorte
}

export interface ReportesDelCorte {
  total: ResumenCorte
  /** Orden alfabético. */
  porSecretaria: FilaSecretaria[]
  /** Lo reportado que espera a la secretaría, lo más antiguo primero (lo que más lleva esperando). */
  porValidar: PorValidar[]
}

export function armarReportesDelCorte(indicadores: Indicador[], vigentes: FilaVigente[]): ReportesDelCorte {
  const reporteDe = new Map<string, ReporteCorte>()
  for (const f of vigentes) {
    const r = reporteDeFila(f)
    if (r) reporteDe.set(f.indicador_id, r)
  }

  const situaciones = indicadores.map(i => situacionEn(sinAsignar(i), reporteDe.get(i.uuid)))

  const porDependencia = new Map<string, typeof situaciones>()
  indicadores.forEach((i, k) => {
    const lista = porDependencia.get(i.dependencia) ?? []
    lista.push(situaciones[k])
    porDependencia.set(i.dependencia, lista)
  })

  const porValidar: PorValidar[] = []
  for (const i of indicadores) {
    const reporte = reporteDe.get(i.uuid)
    if (reporte?.estado === 'pendiente') porValidar.push({ indicador: i, reporte })
  }
  porValidar.sort((a, b) => (a.reporte.creado < b.reporte.creado ? -1 : a.reporte.creado > b.reporte.creado ? 1 : a.indicador.id - b.indicador.id))

  return {
    total: resumirCorte(situaciones),
    porSecretaria: [...porDependencia.entries()]
      .map(([dependencia, lista]) => ({ dependencia, resumen: resumirCorte(lista) }))
      .sort((a, b) => a.dependencia.localeCompare(b.dependencia, 'es')),
    porValidar,
  }
}
