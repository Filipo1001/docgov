/**
 * A quién se le puede escribir desde el módulo Plan de Desarrollo.
 *
 * ── Mientras se prueba, solo a una persona ───────────────────────────────
 *
 * El módulo comparte la base de producción: sus usuarios son los contratistas y secretarías REALES de Fredonia. Un
 * correo mal armado, o uno que salga por un camino que no se pensó, llegaría a una persona de verdad. Por eso, hasta
 * que el módulo se abra, solo esta lista puede recibir correos de él. Cualquier otra persona simplemente no recibe
 * nada (el hecho queda en el registro del servidor, sin su dirección).
 *
 * Se decide por IDENTIFICADOR de usuario y no por nombre ni por correo: en la base hay DOS usuarios que se llaman
 * «FELIPE RESTREPO CEBALLOS» (el real, con su correo, y uno de prueba con un correo `@pendiente.local`). Un filtro por
 * nombre le habría escrito a los dos.
 *
 * Abrirlo a todos el día que toque es borrar esta lista y dejar `puedeRecibirCorreoPdm` devolviendo `true`: ninguna
 * otra pieza de los correos asume que hay un único destinatario.
 */

export const RECEPTORES_DE_PRUEBA: ReadonlySet<string> = new Set([
  '32d89e0e-b3a4-44d2-b08f-fc7929955030', // Felipe Restrepo Ceballos (contratista; correo real)
])

export const puedeRecibirCorreoPdm = (usuarioId: string | null | undefined): boolean =>
  typeof usuarioId === 'string' && RECEPTORES_DE_PRUEBA.has(usuarioId)

/** Quién de una lista puede recibir, y a cuántos se dejó sin correo (para el registro, que cuenta pero no nombra). */
export function filtrarReceptores<T extends { id: string }>(lista: readonly T[]): { permitidos: T[]; omitidos: number } {
  const permitidos = lista.filter(p => puedeRecibirCorreoPdm(p.id))
  return { permitidos, omitidos: lista.length - permitidos.length }
}

/**
 * ¿Es una dirección a la que se puede escribir? Los usuarios sin correo real tienen uno de relleno `@pendiente.local`
 * (no existe en internet) o ninguno. Escribirles solo produce rebotes que dañan la reputación del dominio de envío.
 */
export function esCorreoEntregable(correo: string | null | undefined): correo is string {
  if (typeof correo !== 'string') return false
  const c = correo.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return false
  return !/@(pendiente|example|invalid|localhost)(\.|$)/.test(c) && !c.endsWith('.local')
}
