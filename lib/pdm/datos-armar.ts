import type { Asignacion, Indicador } from './plan'

/**
 * De las filas de la base a la lista de indicadores que usan las pantallas.
 *
 * Pura: no lee nada. La lectura vive en `datos.ts` (`server-only`); esto no, para
 * poder ejercitarla con filas reales fuera de Next.
 */

export interface FilaIndicador {
  id: string
  fila_origen: number
  codigo: string
  linea: string
  sector: string
  programa: string
  producto: string
  indicador: string
  unidad: string
  linea_base: number | string | null
  meta_cuatrienio: number | string | null
  responsable_origen: string | null
  dependencia: { nombre: string } | { nombre: string }[] | null
}

/** Meta de UN año (la que se pidió en la lectura). */
export interface FilaMeta {
  indicador_id: string
  meta: number | string | null
}

export interface FilaAsignacion {
  indicador_id: string
  usuario_id: string
  principal: boolean
  grupo_id?: string | null
}

/** PostgREST devuelve `numeric` como número, pero como texto si excede la precisión de un double: se acepta ambos. */
const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function armarIndicadores(
  filas: FilaIndicador[],
  metas: FilaMeta[],
  asignaciones: FilaAsignacion[],
): Indicador[] {
  const metaDe = new Map(metas.map(m => [m.indicador_id, numero(m.meta)]))

  const asignadosDe = new Map<string, Asignacion[]>()
  for (const a of asignaciones) {
    const lista = asignadosDe.get(a.indicador_id) ?? []
    lista.push({ usuarioId: a.usuario_id, principal: a.principal, grupoId: a.grupo_id ?? null })
    asignadosDe.set(a.indicador_id, lista)
  }

  return filas
    .map(f => {
      const dep = Array.isArray(f.dependencia) ? f.dependencia[0] : f.dependencia
      return {
        id: f.fila_origen,
        uuid: f.id,
        codigo: f.codigo,
        linea: f.linea,
        sector: f.sector,
        programa: f.programa,
        producto: f.producto,
        indicador: f.indicador,
        unidad: f.unidad,
        dependencia: dep?.nombre ?? 'Sin secretaría',
        responsable: f.responsable_origen ?? '',
        asignados: asignadosDe.get(f.id) ?? [],
        lineaBase: numero(f.linea_base),
        metaCuatrienio: numero(f.meta_cuatrienio),
        meta2026: metaDe.get(f.id) ?? null,
        // Nadie ha reportado todavía. Cuando existan reportes vendrá de `pdm_reportes`.
        avance: null,
      } satisfies Indicador
    })
    .sort((a, b) => a.id - b.id)
}
