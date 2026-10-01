import { nombrePropio } from './personas'

/**
 * El historial de un indicador, dicho como a una persona.
 *
 * La bitácora (`pdm_historial`) guarda cada cambio con su antes y su después; aquí se
 * convierte cada fila en una frase. Pura: no lee nada, así que se prueba con filas reales.
 *
 * Solo traduce los cambios de ASIGNACIÓN. Las filas-resumen de cada operación (`lote_*`) y
 * las de grupos o accesos no pertenecen a la historia de un indicador y devuelven `null`.
 */

export interface FilaHistorial {
  id: number
  created_at: string
  actor_nombre: string
  accion: string
  detalle: Record<string, unknown>
}

export interface EntradaHistorial {
  id: number
  /** ISO. */
  cuando: string
  quien: string
  texto: string
  motivo: string | null
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function describirCambio(f: FilaHistorial): { texto: string; motivo: string | null } | null {
  const d = f.detalle ?? {}
  const persona = texto(d.usuario_nombre) ? nombrePropio(d.usuario_nombre as string) : 'Alguien'
  const grupo = texto(d.grupo_nombre)
  const motivo = texto(d.motivo)

  switch (f.accion) {
    case 'asignacion_creada': {
      const base = d.principal_despues === true ? `${persona} quedó como responsable principal` : `${persona} entró como apoyo`
      return { texto: grupo && d.grupo_despues ? `${base}, por el grupo «${grupo}»` : base, motivo }
    }
    case 'asignacion_cambiada': {
      if (d.principal_antes === true && d.principal_despues === false) return { texto: `${persona} pasó de responsable principal a apoyo`, motivo }
      if (d.principal_antes === false && d.principal_despues === true) return { texto: `${persona} pasó de apoyo a responsable principal`, motivo }
      if (d.grupo_antes && !d.grupo_despues) return { texto: `${persona} dejó de figurar como del grupo «${grupo ?? 'que se disolvió'}»`, motivo }
      if (!d.grupo_antes && d.grupo_despues) return { texto: `${persona} quedó como parte del grupo «${grupo ?? ''}»`.replace(' «»', ''), motivo }
      return { texto: `Se actualizó la asignación de ${persona}`, motivo }
    }
    case 'asignacion_quitada':
      return { texto: d.principal_antes === true ? `${persona} dejó de ser responsable principal` : `${persona} dejó de ser apoyo`, motivo }
    default:
      return null
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * «1 oct 2026 · 11:26», en hora de Bogotá. A mano y no con `toLocaleDateString`: el mes corto
 * cambia según la versión de ICU del navegador («sept», «sep.»), y esto se lee igual en todos.
 */
export function fechaHoraBogota(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(t)
  const v = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? ''
  return `${Number(v('day'))} ${MESES[Number(v('month')) - 1]} ${v('year')} · ${v('hour')}:${v('minute')}`
}
