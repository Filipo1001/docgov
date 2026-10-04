/**
 * Qué le pasó a cada persona en un cambio de reparto, leído de la bitácora.
 *
 * ── De dónde sale la verdad ──────────────────────────────────────────────
 *
 * Quien reparte indicadores llama a una función de la base (`pdm_asignar`, `pdm_asignar_grupo`, `pdm_quitar`) que
 * abre un LOTE y devuelve su identificador. Un disparador escribe en `pdm_historial` una fila por cada asignación que
 * se crea, cambia o quita, con el lote, la persona y si era principal antes y después. Esas filas son el registro
 * oficial de lo ocurrido: aquí se lee eso, no se reconstruye comparando fotos ni se confía en lo que la pantalla dice
 * haber pedido.
 *
 * Puro y sin `server-only`: recibe filas y devuelve cambios.
 */

import type { TipoCambio } from './plantillas'

export type Papel = 'ninguno' | 'apoyo' | 'principal'

/** Una fila de `pdm_historial` de la entidad «indicador» que habla de una asignación. */
export interface FilaDeAsignacion {
  id: number
  accion: string
  /** El indicador. */
  entidad_id: string
  detalle: {
    usuario_id?: string
    principal_antes?: boolean | null
    principal_despues?: boolean | null
    motivo?: string
  } | null
}

export const ACCIONES_DE_ASIGNACION = ['asignacion_creada', 'asignacion_cambiada', 'asignacion_quitada'] as const

const papelDe = (principal: boolean | null | undefined): Papel => (principal === true ? 'principal' : 'apoyo')

/** El papel que tenía la persona ANTES de esa fila. */
export const papelAntes = (f: FilaDeAsignacion): Papel => (f.accion === 'asignacion_creada' ? 'ninguno' : papelDe(f.detalle?.principal_antes))

/** El papel que tiene DESPUÉS de esa fila. */
export const papelDespues = (f: FilaDeAsignacion): Papel => (f.accion === 'asignacion_quitada' ? 'ninguno' : papelDe(f.detalle?.principal_despues))

/** Qué es pasar de un papel a otro, o `null` si no cambió nada que la persona note (p. ej. solo cambió el grupo de origen). */
export function clasificar(antes: Papel, despues: Papel): TipoCambio | null {
  if (antes === despues) return null
  if (despues === 'ninguno') return 'quitado'
  if (antes === 'ninguno') return despues === 'principal' ? 'asignado_principal' : 'asignado_apoyo'
  return despues === 'principal' ? 'paso_a_principal' : 'paso_a_apoyo'
}

export interface CambioDeUsuario {
  usuarioId: string
  indicadorId: string
  tipo: TipoCambio
}

/**
 * Los cambios netos de un lote: UNO por persona e indicador, del papel con que empezó al papel con que terminó.
 *
 * Si dentro de un mismo lote una asignación se tocó dos veces (por ejemplo se crea como apoyo y se sube a principal),
 * la persona recibe lo que de verdad le quedó, no la historia intermedia. Y si terminó como empezó, no recibe nada.
 */
export function cambiosDeLote(filas: readonly FilaDeAsignacion[]): CambioDeUsuario[] {
  const ordenadas = [...filas].sort((a, b) => a.id - b.id)
  const porClave = new Map<string, { usuarioId: string; indicadorId: string; antes: Papel; despues: Papel }>()
  for (const f of ordenadas) {
    const usuarioId = f.detalle?.usuario_id
    if (!usuarioId || !f.entidad_id) continue
    const clave = `${usuarioId}|${f.entidad_id}`
    const previo = porClave.get(clave)
    porClave.set(clave, { usuarioId, indicadorId: f.entidad_id, antes: previo?.antes ?? papelAntes(f), despues: papelDespues(f) })
  }
  const cambios: CambioDeUsuario[] = []
  for (const c of porClave.values()) {
    const tipo = clasificar(c.antes, c.despues)
    if (tipo) cambios.push({ usuarioId: c.usuarioId, indicadorId: c.indicadorId, tipo })
  }
  return cambios
}

/** Los cambios de un lote agrupados por persona (cada una recibe UN correo, no uno por indicador). */
export function agruparPorUsuario(cambios: readonly CambioDeUsuario[]): Map<string, CambioDeUsuario[]> {
  const m = new Map<string, CambioDeUsuario[]>()
  for (const c of cambios) m.set(c.usuarioId, [...(m.get(c.usuarioId) ?? []), c])
  return m
}
