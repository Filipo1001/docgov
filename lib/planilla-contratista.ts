/**
 * Quién puede cambiar los documentos de seguridad social de un periodo —la planilla, el soporte del pago y el número de
 * planilla— y qué le pasa a la revisión de la planilla cuando los cambia.
 *
 * LA REGLA DE LA CONTRATISTA (decidida por Felipe el 19-oct-2026). Sube, reemplaza, elimina y cambia el número SOLO en dos
 * situaciones:
 *
 *   1. Mientras el informe es suyo: en `borrador` o `rechazado` (devuelto).
 *   2. Cuando el revisor le devolvió la planilla (`planilla_estado = 'rechazada'`) aunque el informe siga enviado o en
 *      revisión. Es la ventana de corrección: dura hasta que ella pulsa «Enviar corrección a revisión».
 *
 * Antes podía hacerlo en cualquier estado menos `aprobado` y `radicado`: con el informe ya enviado, y la planilla pendiente
 * de revisión, el archivo que el revisor tenía abierto podía cambiar debajo de sus manos.
 *
 * En la ventana de corrección los cambios NO devuelven la revisión a «pendiente» (`revisionTrasCambio`): con la planilla,
 * el soporte y el número por corregir, el primer archivo que subiera cerraría la ventana y dejaría los otros dos sin poder
 * corregirse. La revisión vuelve a «pendiente» solo cuando ella lo envía (`puedeReenviarPlanilla`).
 *
 * El administrador conserva lo que tenía: cualquier estado menos `aprobado` y `radicado`.
 *
 * Una sola función para el servidor (`app/actions/periodos.ts`) y la pantalla (que decide si pinta los controles), para que
 * no puedan discrepar. Mismo criterio que `lib/base-cotizacion.ts`.
 */

import { ESTADOS_EDITABLES } from './constants'
import { validarNumeroPlanilla } from './validaciones'

export type RevisionPlanilla = 'pendiente' | 'aprobada' | 'rechazada' | null | undefined

/** Estados en los que el informe se está revisando: ahí la contratista no cambia nada salvo que le devuelvan la planilla. */
const ESTADOS_DE_REVISION: readonly string[] = ['enviado', 'revision']

export type DecisionPlanilla = { ok: true } | { ok: false; error: string }

/** ¿Está abierta la ventana de corrección? El informe se está revisando y el revisor devolvió la planilla. */
export function hayPlanillaDevuelta(estado: string, planillaEstado: RevisionPlanilla): boolean {
  return ESTADOS_DE_REVISION.includes(estado) && planillaEstado === 'rechazada'
}

export function puedeCambiarDocumentosSS(p: {
  rol: string | null | undefined
  estado: string
  planillaEstado: RevisionPlanilla
  esHistorico?: boolean
}): DecisionPlanilla {
  if (p.rol === 'admin') {
    return p.estado === 'aprobado' || p.estado === 'radicado'
      ? { ok: false, error: 'No se puede modificar la planilla de un periodo ya aprobado o radicado' }
      : { ok: true }
  }
  if (p.rol !== 'contratista') {
    return { ok: false, error: 'Solo el contratista puede modificar la planilla de seguridad social' }
  }
  if (p.esHistorico) return { ok: false, error: 'No se puede modificar un periodo histórico' }
  if ((ESTADOS_EDITABLES as readonly string[]).includes(p.estado)) return { ok: true }
  if (hayPlanillaDevuelta(p.estado, p.planillaEstado)) return { ok: true }
  if (ESTADOS_DE_REVISION.includes(p.estado)) {
    return {
      ok: false,
      error: 'El informe ya fue enviado: la planilla, el soporte del pago y el número solo se pueden cambiar si el revisor devuelve la planilla.',
    }
  }
  return { ok: false, error: 'No se puede modificar la planilla de un periodo ya aprobado o radicado' }
}

/**
 * Cómo queda la revisión de la planilla después de que se sube, reemplaza o elimina un documento.
 *
 * Fuera de la ventana de corrección el conjunto cambió y el revisor tiene que volver a mirarlo: «pendiente», y se borra el
 * motivo anterior. Dentro de la ventana todo se queda como está (devuelta, con su motivo a la vista) hasta que ella envíe la
 * corrección.
 */
export function revisionTrasCambio(estado: string, planillaEstado: RevisionPlanilla): {
  planilla_estado: 'pendiente' | 'rechazada'
  borraMotivo: boolean
} {
  return hayPlanillaDevuelta(estado, planillaEstado)
    ? { planilla_estado: 'rechazada', borraMotivo: false }
    : { planilla_estado: 'pendiente', borraMotivo: true }
}

/**
 * ¿Puede la contratista enviar la corrección de la planilla a revisión? Hace falta que haya una planilla devuelta y que el
 * conjunto esté completo y bien formado: planilla, soporte del pago y número de planilla.
 */
export function puedeReenviarPlanilla(p: {
  rol: string | null | undefined
  estado: string
  planillaEstado: RevisionPlanilla
  tienePlanilla: boolean
  tieneSoporte: boolean
  numeroPlanilla: string | null | undefined
}): DecisionPlanilla {
  if (p.rol !== 'contratista' && p.rol !== 'admin') {
    return { ok: false, error: 'Solo el contratista puede enviar la corrección de la planilla' }
  }
  if (!hayPlanillaDevuelta(p.estado, p.planillaEstado)) {
    return { ok: false, error: 'La planilla no está devuelta: no hay nada que enviar de nuevo' }
  }
  if (!p.tienePlanilla) return { ok: false, error: 'Adjunta la planilla de seguridad social antes de enviar la corrección' }
  if (!p.tieneSoporte) return { ok: false, error: 'Adjunta el soporte del pago antes de enviar la corrección' }
  const errorNumero = validarNumeroPlanilla(p.numeroPlanilla ?? '')
  if (errorNumero) return { ok: false, error: errorNumero }
  return { ok: true }
}

/**
 * ¿Es la dirección de un archivo de planilla de ESTE periodo? La que entrega `prepararUploadPlanilla` tiene la forma
 * `…/documentos/planillas/<periodo>/<marca de tiempo>.pdf`. Antes de registrarla en la base se comprueba: el navegador es
 * quien la devuelve, y una que apunte a otro periodo, a otra carpeta o a otro sitio no se acepta.
 */
export function esUrlDePlanilla(periodoId: string, url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0 || url.length > 1000 || !periodoId) return false
  const sinConsulta = url.split('?')[0]
  const m = /\/documentos\/planillas\/([^/]+)\/\d+\.pdf$/.exec(sinConsulta)
  return !!m && m[1] === periodoId
}
