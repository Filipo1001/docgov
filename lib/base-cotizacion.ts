/**
 * Quién puede cambiar la base de cotización a la seguridad social de un periodo (`periodos.base_cotizacion_ss`).
 *
 * Esa base es la que imprime el Acta de Supervisión. Por defecto sale sola (40 % del valor mensual efectivo, con un
 * piso: `calcularBaseCotizacionSS`) y se puede sobrescribir.
 *
 *   · Administrador: cualquier periodo y cualquier estado, también radicados e históricos. Es la corrección de último
 *     recurso y se hace desde Avanzado → Base SS.
 *   · Supervisor: solo los periodos de SUS contratos y solo mientras el informe se está revisando (`enviado` o
 *     `revision`). Es quien compara la planilla con el acta, así que es quien nota que la base no coincide. Después de
 *     aprobado el acta ya está emitida y su contenido deja de ser suyo (regla 3 de CLAUDE.md: un documento emitido
 *     no se reescribe); si hace falta, lo corrige el administrador. Tampoco los periodos históricos.
 *
 * Una sola función para el servidor (`actualizarBaseCotizacion`) y la pantalla (que decide si pinta el control), para
 * que no puedan discrepar.
 */
export const ESTADOS_BASE_EDITABLE_POR_SUPERVISOR = ['enviado', 'revision'] as const

export type DecisionBaseCotizacion = { ok: true } | { ok: false; error: string }

export function puedeEditarBaseCotizacion(p: {
  rol: string | null | undefined
  usuarioId: string | null | undefined
  /** `contratos.supervisor_id` del contrato del periodo. */
  supervisorId: string | null | undefined
  estado: string
  esHistorico: boolean
}): DecisionBaseCotizacion {
  if (p.rol === 'admin') return { ok: true }

  if (p.rol !== 'supervisor') {
    return { ok: false, error: 'Solo el administrador o el supervisor del contrato pueden editar la base de cotización' }
  }
  if (!p.usuarioId || p.supervisorId !== p.usuarioId) {
    return { ok: false, error: 'No eres el supervisor de este contrato' }
  }
  if (p.esHistorico) {
    return { ok: false, error: 'No se puede modificar un periodo histórico' }
  }
  if (!(ESTADOS_BASE_EDITABLE_POR_SUPERVISOR as readonly string[]).includes(p.estado)) {
    return {
      ok: false,
      error: 'La base solo se cambia mientras el informe está enviado o en revisión. Si ya está aprobado, pídele la corrección al administrador.',
    }
  }
  return { ok: true }
}

/**
 * ¿Pinta la pantalla del periodo el control de la base? Solo dentro de la ventana de revisión, también para el
 * administrador: sus correcciones sobre periodos aprobados, radicados o históricos siguen en Avanzado → Base SS, donde
 * el aviso es explícito, y no a un clic de distancia de una revisión normal.
 */
export function mostrarControlDeBaseEnPeriodo(p: Parameters<typeof puedeEditarBaseCotizacion>[0]): boolean {
  return (
    puedeEditarBaseCotizacion(p).ok &&
    !p.esHistorico &&
    (ESTADOS_BASE_EDITABLE_POR_SUPERVISOR as readonly string[]).includes(p.estado)
  )
}
