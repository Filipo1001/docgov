import type { Indicador } from './plan'
import type { GrupoVista } from './personas'

/**
 * De las filas de la base a los grupos que pintan las pantallas.
 *
 * Pura: no lee nada. La lectura vive en `directorio.ts` (`server-only`); esto no,
 * para ejercitarla con filas reales fuera de Next.
 */

export interface FilaGrupo {
  id: string
  nombre: string
  dependencia_id: string
  descripcion?: string | null
  dependencia: { nombre: string } | { nombre: string }[] | null
}

export interface FilaMiembro {
  grupo_id: string
  usuario_id: string
  es_lider: boolean
}

export function armarGrupos(grupos: FilaGrupo[], miembros: FilaMiembro[], indicadores: Indicador[]): GrupoVista[] {
  const miembrosDe = new Map<string, FilaMiembro[]>()
  for (const m of miembros) {
    const lista = miembrosDe.get(m.grupo_id) ?? []
    lista.push(m)
    miembrosDe.set(m.grupo_id, lista)
  }

  // Cuántos indicadores sostiene cada grupo: los que tienen al menos una fila marcada con él.
  const indicadoresDe = new Map<string, number>()
  for (const i of indicadores) {
    for (const g of new Set(i.asignados.map(a => a.grupoId).filter((g): g is string => g !== null))) {
      indicadoresDe.set(g, (indicadoresDe.get(g) ?? 0) + 1)
    }
  }

  return grupos
    .map(g => {
      const dep = Array.isArray(g.dependencia) ? g.dependencia[0] : g.dependencia
      const suyos = miembrosDe.get(g.id) ?? []
      return {
        id: g.id,
        nombre: g.nombre,
        secretariaId: g.dependencia_id,
        secretaria: dep?.nombre ?? 'Sin secretaría',
        descripcion: g.descripcion ?? null,
        liderId: suyos.find(m => m.es_lider)?.usuario_id ?? null,
        miembros: suyos.map(m => m.usuario_id),
        indicadores: indicadoresDe.get(g.id) ?? 0,
      } satisfies GrupoVista
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
