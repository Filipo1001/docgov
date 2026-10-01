import type { Indicador } from './plan'
import type { GrupoVista, PersonaDirectorio } from './personas'

/**
 * Quién lleva un indicador, con nombre y cara, listo para pintar.
 *
 * Pura: recibe las personas y los grupos ya cargados. El principal va primero; el
 * resto, por nombre. Quien ya no figura entre los usuarios activos se muestra
 * como tal en vez de desaparecer: un indicador no puede perder a un responsable
 * sin que se note.
 */

export interface AsignadoVista {
  usuarioId: string
  nombre: string
  fotoUrl: string | null
  secretaria: string | null
  principal: boolean
  /** Nombre del grupo del que vino, si vino de uno. */
  grupo: string | null
  /** `false` si la persona ya no está entre los usuarios activos. */
  activo: boolean
}

export function asignadosVista(
  indicador: Indicador,
  personas: Map<string, PersonaDirectorio>,
  grupos: Map<string, GrupoVista>,
): AsignadoVista[] {
  return indicador.asignados
    .map(a => {
      const p = personas.get(a.usuarioId)
      return {
        usuarioId: a.usuarioId,
        nombre: p?.nombre ?? 'Usuario que ya no está activo',
        fotoUrl: p?.fotoUrl ?? null,
        secretaria: p?.secretaria ?? null,
        principal: a.principal,
        grupo: a.grupoId ? grupos.get(a.grupoId)?.nombre ?? null : null,
        activo: p !== undefined,
      } satisfies AsignadoVista
    })
    .sort((a, b) => Number(b.principal) - Number(a.principal) || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Quién es el principal de un indicador, si lo hay. */
export const principalDe = (i: Indicador): string | null => i.asignados.find(a => a.principal)?.usuarioId ?? null
