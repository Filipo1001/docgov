import type { Asignacion, AnioDeIndicador, Indicador } from './plan'
import {
  ANIOS_PLAN, anioIniciado, anioPorDefecto, situacionEn, type EstadoReporte, type ReporteAnio,
} from './seguimiento'

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

/** La meta de un indicador en un año. */
export interface FilaMeta {
  indicador_id: string
  anio: number
  meta: number | string | null
}

export interface FilaAsignacion {
  indicador_id: string
  usuario_id: string
  principal: boolean
  grupo_id?: string | null
}

/** De `pdm_avance_validado`: el último reporte aprobado de cada indicador en cada año. */
export interface FilaAvanceValidado {
  indicador_id: string
  anio: number
  valor: number | string
}

/** De `pdm_reportes_vigentes`: el último reporte de cada indicador en cada año. */
export interface FilaVigente {
  reporte_id: string
  indicador_id: string
  anio: number
  valor: number | string
  estado: string
  autor_id: string | null
  autor_nombre: string
  created_at: string
  corrige_a: string | null
  n_evidencias: number | string
  validacion_comentario: string | null
  validador_nombre: string | null
}

/** Lo que `armarIndicadores` necesita saber del seguimiento. Sin nada de esto, se arma el plan «sin seguimiento». */
export interface DatosSeguimiento {
  /** El año calendario (hora de Colombia): de él depende qué años ya se pueden reportar. */
  anioActual: number
  avances: FilaAvanceValidado[]
  /** El último reporte de cada indicador en cada año. */
  vigentes: FilaVigente[]
}

export const SIN_DATOS_SEGUIMIENTO: DatosSeguimiento = {
  anioActual: ANIOS_PLAN[0], avances: [], vigentes: [],
}

/** PostgREST devuelve `numeric` como número, pero como texto si excede la precisión de un double: se acepta ambos. */
const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const ESTADOS_REPORTE: readonly EstadoReporte[] = ['pendiente', 'aprobado', 'devuelto']
const esEstadoReporte = (v: unknown): v is EstadoReporte => ESTADOS_REPORTE.includes(v as EstadoReporte)

/** Una fila de la vista, como la usan las pantallas. `null` si trae algo que no se entiende (no se inventa un estado). */
export function reporteDeFila(f: FilaVigente): ReporteAnio | null {
  const valor = numero(f.valor)
  if (valor === null || !esEstadoReporte(f.estado)) return null
  return {
    reporteId: f.reporte_id,
    valor,
    estado: f.estado,
    autorId: f.autor_id,
    autorNombre: f.autor_nombre,
    creado: f.created_at,
    nEvidencias: numero(f.n_evidencias) ?? 0,
    esCorreccion: f.corrige_a !== null,
    validacionComentario: f.validacion_comentario,
    validadorNombre: f.validador_nombre,
  }
}

/**
 * El plan listo para pintar: cada indicador con sus cuatro años y, ya proyectado, el que se mira (`anio`, por
 * defecto el de hoy).
 */
export function armarIndicadores(
  filas: FilaIndicador[],
  metas: FilaMeta[],
  asignaciones: FilaAsignacion[],
  seg: DatosSeguimiento = SIN_DATOS_SEGUIMIENTO,
  anio: number = anioPorDefecto(seg.anioActual),
): Indicador[] {
  const clave = (id: string, a: number) => `${id}:${a}`
  const metaDe = new Map(metas.map(m => [clave(m.indicador_id, m.anio), numero(m.meta)]))
  const avanceDe = new Map(seg.avances.map(a => [clave(a.indicador_id, a.anio), numero(a.valor)]))
  const vigenteDe = new Map<string, ReporteAnio>()
  for (const f of seg.vigentes) {
    const r = reporteDeFila(f)
    if (r) vigenteDe.set(clave(f.indicador_id, f.anio), r)
  }

  const asignadosDe = new Map<string, Asignacion[]>()
  for (const a of asignaciones) {
    const lista = asignadosDe.get(a.indicador_id) ?? []
    lista.push({ usuarioId: a.usuario_id, principal: a.principal, grupoId: a.grupo_id ?? null })
    asignadosDe.set(a.indicador_id, lista)
  }

  return filas
    .map(f => {
      const dep = Array.isArray(f.dependencia) ? f.dependencia[0] : f.dependencia
      const asignados = asignadosDe.get(f.id) ?? []

      const anios: AnioDeIndicador[] = ANIOS_PLAN.map(a => {
        const meta = metaDe.get(clave(f.id, a)) ?? null
        const vigente = vigenteDe.get(clave(f.id, a)) ?? null
        // Se espera un reporte cuando el año ya empezó, alguien lo lleva y hay una meta que cumplir.
        const espera = asignados.length > 0 && anioIniciado(a, seg.anioActual) && (meta ?? 0) > 0
        const situacion = situacionEn(espera, vigente)
        return {
          anio: a,
          meta,
          avance: avanceDe.get(clave(f.id, a)) ?? null,
          enAnio: situacion ? { situacion, reporte: vigente } : null,
        }
      })
      const visto = anios.find(a => a.anio === anio)

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
        asignados,
        lineaBase: numero(f.linea_base),
        metaCuatrienio: numero(f.meta_cuatrienio),
        anios,
        anio,
        meta: visto?.meta ?? null,
        avance: visto?.avance ?? null,
        enAnio: visto?.enAnio ?? null,
      } satisfies Indicador
    })
    .sort((a, b) => a.id - b.id)
}
