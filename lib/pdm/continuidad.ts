/**
 * La continuidad de los responsables: quién responde como PRINCIPAL por indicadores y ya no tiene contrato, o lo
 * termina antes de que acabe el plan.
 *
 * ── Por qué importa ──────────────────────────────────────────────────────
 *
 * El plan llega a 2027 y los contratos de prestación de servicios de Fredonia terminan, casi todos, en 2026. Un indicador
 * cuyo principal es un contratista queda sin quién lo reporte el día que termina su contrato (la persona sigue existiendo
 * en la plataforma, pero ya no trabaja para la Alcaldía). La práctica sana es que el principal sea alguien de planta (el
 * secretario de despacho o un funcionario) y que el contratista quede de apoyo; mientras eso no se haga, aquí se ve.
 *
 * Puro: recibe el directorio y los indicadores ya cargados (con lo que la base deja ver a quien mira) y devuelve quién
 * está en riesgo. No decide nada: avisa, y la reasignación se hace donde siempre (Indicadores).
 */

import type { Indicador } from './plan'
import type { PersonaDirectorio } from './personas'

export type MotivoDeRiesgo = 'sin_contrato' | 'termina_antes'

export interface ResponsableEnRiesgo {
  persona: PersonaDirectorio
  motivo: MotivoDeRiesgo
  /** Indicadores en que es la responsable PRINCIPAL. */
  principal: number
}

/**
 * Las personas que son principales en algún indicador y:
 *   · `sin_contrato`: ya no tienen contrato en fecha (vencido o ninguno);
 *   · `termina_antes`: su contrato en fecha termina antes del último día del plan.
 *
 * No entran el personal de planta ni nadie cuyo contrato no se puede ver (una secretaría no ve los contratos de otras
 * dependencias: eso es «desconocido», no «vencido»). Primero las que ya no tienen contrato; dentro de cada grupo, la que
 * más indicadores lleva.
 */
export function responsablesEnRiesgo(
  personas: PersonaDirectorio[],
  indicadores: Indicador[],
  finDelPlan: string,
): ResponsableEnRiesgo[] {
  const principalDe = new Map<string, number>()
  for (const i of indicadores) {
    for (const a of i.asignados) if (a.principal) principalDe.set(a.usuarioId, (principalDe.get(a.usuarioId) ?? 0) + 1)
  }
  const fuera: ResponsableEnRiesgo[] = []
  for (const p of personas) {
    const principal = principalDe.get(p.id) ?? 0
    if (principal === 0) continue
    const c = p.contrato
    let motivo: MotivoDeRiesgo | null = null
    if (c.estado === 'vencido' || c.estado === 'sin_contrato') motivo = 'sin_contrato'
    else if (c.estado === 'en_fecha' && c.fin !== null && c.fin < finDelPlan) motivo = 'termina_antes'
    if (motivo) fuera.push({ persona: p, motivo, principal })
  }
  const orden: Record<MotivoDeRiesgo, number> = { sin_contrato: 0, termina_antes: 1 }
  return fuera.sort((a, b) =>
    orden[a.motivo] - orden[b.motivo] || b.principal - a.principal || a.persona.nombre.localeCompare(b.persona.nombre, 'es'))
}

/** Cuántos indicadores quedan expuestos, por motivo (para la frase de arriba). */
export function resumirRiesgo(lista: ResponsableEnRiesgo[]): Record<MotivoDeRiesgo, { personas: number; indicadores: number }> {
  const r = { sin_contrato: { personas: 0, indicadores: 0 }, termina_antes: { personas: 0, indicadores: 0 } }
  for (const x of lista) { r[x.motivo].personas++; r[x.motivo].indicadores += x.principal }
  return r
}
