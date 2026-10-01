import type { Asignacion, Indicador } from './plan'
import {
  situacionEn, type AvanceModo, type Corte, type EstadoEnCorte, type EstadoReporte, type ReporteCorte, type Seguimiento,
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

/** De `pdm_avance_validado`: el último reporte aprobado de cada indicador. */
export interface FilaAvanceValidado {
  indicador_id: string
  valor: number | string
  corte_nombre: string
}

/** De `pdm_metas_acumuladas`, para el año de seguimiento. */
export interface FilaMetaAcumulada {
  indicador_id: string
  meta_acumulada: number | string | null
}

/** De `pdm_reportes_vigentes`: el último reporte de cada indicador en UN corte. */
export interface FilaVigente {
  reporte_id: string
  indicador_id: string
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
  modo: AvanceModo | null
  /** Hay un corte abierto: solo entonces los indicadores traen su situación en el corte. */
  hayCorteAbierto: boolean
  avances: FilaAvanceValidado[]
  acumuladas: FilaMetaAcumulada[]
  /** Los vigentes del corte ABIERTO. */
  vigentes: FilaVigente[]
}

export const SIN_DATOS_SEGUIMIENTO: DatosSeguimiento = {
  modo: null, hayCorteAbierto: false, avances: [], acumuladas: [], vigentes: [],
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
export function reporteDeFila(f: FilaVigente): ReporteCorte | null {
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

export function armarIndicadores(
  filas: FilaIndicador[],
  metas: FilaMeta[],
  asignaciones: FilaAsignacion[],
  seg: DatosSeguimiento = SIN_DATOS_SEGUIMIENTO,
): Indicador[] {
  const metaDe = new Map(metas.map(m => [m.indicador_id, numero(m.meta)]))
  const acumuladaDe = new Map(seg.acumuladas.map(m => [m.indicador_id, numero(m.meta_acumulada)]))
  const avanceDe = new Map(seg.avances.map(a => [a.indicador_id, a]))
  const vigenteDe = new Map<string, ReporteCorte>()
  for (const f of seg.vigentes) {
    const r = reporteDeFila(f)
    if (r) vigenteDe.set(f.indicador_id, r)
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
      const meta2026 = metaDe.get(f.id) ?? null
      const metaAcumulada = acumuladaDe.get(f.id) ?? null
      const avance = avanceDe.get(f.id)
      const vigente = vigenteDe.get(f.id) ?? null

      let enCorte: EstadoEnCorte | null = null
      if (seg.hayCorteAbierto) {
        const situacion = situacionEn(asignados.length === 0, vigente)
        if (situacion) enCorte = { situacion, reporte: vigente }
      }

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
        meta2026,
        metaAcumulada,
        criterio: seg.modo,
        // Con el criterio sin definir se mide contra la meta de 2026, y se rotula provisional.
        metaMedida: seg.modo === 'acumulado' ? metaAcumulada : meta2026,
        avance: avance ? numero(avance.valor) : null,
        avanceCorte: avance?.corte_nombre ?? null,
        enCorte,
      } satisfies Indicador
    })
    .sort((a, b) => a.id - b.id)
}

// ─── Cortes y ajustes ─────────────────────────────────────────────────────────

export interface FilaPlanAjustes {
  avance_modo: string | null
  periodicidad: string | null
}

export interface FilaCorte {
  id: string
  nombre: string
  fecha_corte: string
  estado: string
}

/** Lo que la base dice de los cortes y los ajustes, como lo usan las pantallas. Más reciente primero. */
export function armarSeguimiento(plan: FilaPlanAjustes, cortes: FilaCorte[]): Seguimiento {
  const modo: AvanceModo | null = plan.avance_modo === 'acumulado' || plan.avance_modo === 'anual' ? plan.avance_modo : null
  const lista: Corte[] = cortes
    .map(c => ({ id: c.id, nombre: c.nombre, fecha: c.fecha_corte, abierto: c.estado === 'abierto' }))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.nombre.localeCompare(b.nombre, 'es')))
  return {
    ajustes: { avanceModo: modo, periodicidad: plan.periodicidad },
    cortes: lista,
    abierto: lista.find(c => c.abierto) ?? null,
  }
}
