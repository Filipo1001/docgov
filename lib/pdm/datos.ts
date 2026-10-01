import 'server-only'
import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ANIO_SEGUIMIENTO } from './identidad'
import {
  armarIndicadores, armarSeguimiento,
  type FilaAsignacion, type FilaAvanceValidado, type FilaCorte, type FilaIndicador, type FilaMeta,
  type FilaMetaAcumulada, type FilaPlanAjustes, type FilaVigente,
} from './datos-armar'
import type { Indicador } from './plan'
import { SIN_SEGUIMIENTO, type Seguimiento } from './seguimiento'

/**
 * El plan, leído de la base.
 *
 * ── Solo lee, con la sesión de quien mira ────────────────────────────────
 *
 * Consultas de lectura sobre tablas y vistas `pdm_*`, con la sesión del usuario: lo
 * que ve lo decide RLS, no este código (las vistas son `security_invoker`). Cada
 * quien recibe solo lo suyo: el administrador y Control Interno todo, una secretaría
 * su dependencia, un responsable sus indicadores.
 *
 * ── Un peligro silencioso: el tope de filas ──────────────────────────────
 *
 * PostgREST devuelve como mucho 1.000 filas por consulta y NO avisa: corta. Las
 * metas son 1.022 (257 × 4 años), así que traerlas todas habría perdido 22 sin
 * error alguno. Solo se piden las del año de seguimiento (257), y si CUALQUIER
 * consulta vuelve con 1.000 filas se trata como fallo, no como dato.
 *
 * ── Si la lectura falla, se dice; no se inventa ──────────────────────────
 *
 * Devuelve `ok: false`. No hay plan B con datos guardados en el código: el único
 * que había traía avances sin dueño, y por eso se retiró. Es preferible una
 * pantalla que dice «no se pudo leer» a una que muestra otra cosa.
 *
 * `cache` de React: una sola lectura por petición, aunque la pidan varios
 * componentes.
 */

export const TOPE_POSTGREST = 1000

export interface PlanPdm {
  ok: boolean
  indicadores: Indicador[]
  /** Los ajustes del plan y sus cortes. */
  seguimiento: Seguimiento
  /** El id del plan activo, para los lugares que lo necesitan. */
  planId: string | null
}

const FALLO: PlanPdm = { ok: false, indicadores: [], seguimiento: SIN_SEGUIMIENTO, planId: null }

const COLUMNAS_VIGENTE =
  'reporte_id, indicador_id, valor, estado, autor_id, autor_nombre, created_at, corrige_a, n_evidencias, validacion_comentario, validador_nombre'

export const cargarPlanPdm = cache(async (): Promise<PlanPdm> => {
  try {
    const supabase = await createServerSupabaseClient()
    const [ind, met, asi, pla, cor, ava, acu] = await Promise.all([
      supabase
        .from('pdm_indicadores')
        .select('id, fila_origen, codigo, linea, sector, programa, producto, indicador, unidad, linea_base, meta_cuatrienio, responsable_origen, dependencia:dependencias(nombre)')
        .eq('activo', true)
        .order('fila_origen'),
      supabase.from('pdm_metas').select('indicador_id, meta').eq('anio', ANIO_SEGUIMIENTO),
      supabase.from('pdm_asignaciones').select('indicador_id, usuario_id, principal, grupo_id'),
      supabase.from('pdm_planes').select('id, avance_modo, periodicidad').eq('activo', true),
      supabase.from('pdm_cortes').select('id, nombre, fecha_corte, estado').order('fecha_corte', { ascending: false }),
      supabase.from('pdm_avance_validado').select('indicador_id, valor, corte_nombre'),
      supabase.from('pdm_metas_acumuladas').select('indicador_id, meta_acumulada').eq('anio', ANIO_SEGUIMIENTO),
    ])

    const error = ind.error ?? met.error ?? asi.error ?? pla.error ?? cor.error ?? ava.error ?? acu.error
    if (error || !ind.data || !met.data || !asi.data || !pla.data || !cor.data || !ava.data || !acu.data) {
      console.error('[pdm/datos] lectura fallida:', error?.message)
      return FALLO
    }
    // Sin exactamente un plan activo no hay a qué atar nada (lo mismo exigen las funciones de la base).
    if (pla.data.length !== 1) {
      console.error('[pdm/datos] se esperaba un único plan activo y hay', pla.data.length)
      return FALLO
    }
    if ([ind.data, met.data, asi.data, cor.data, ava.data, acu.data].some(d => d.length >= TOPE_POSTGREST)) {
      console.error('[pdm/datos] una consulta llegó al tope de filas de PostgREST: los datos pueden estar cortados')
      return FALLO
    }

    const seguimiento = armarSeguimiento(pla.data[0] as FilaPlanAjustes, cor.data as FilaCorte[])

    // Lo reportado, solo del corte abierto (de ahí sale «dónde va cada indicador»). Otro corte no se pide aquí.
    let vigentes: FilaVigente[] = []
    if (seguimiento.abierto) {
      const vig = await supabase.from('pdm_reportes_vigentes').select(COLUMNAS_VIGENTE).eq('corte_id', seguimiento.abierto.id)
      if (vig.error || !vig.data) {
        console.error('[pdm/datos] lectura de reportes fallida:', vig.error?.message)
        return FALLO
      }
      if (vig.data.length >= TOPE_POSTGREST) {
        console.error('[pdm/datos] los reportes del corte llegaron al tope de filas de PostgREST')
        return FALLO
      }
      vigentes = vig.data as FilaVigente[]
    }

    return {
      ok: true,
      planId: pla.data[0].id as string,
      seguimiento,
      indicadores: armarIndicadores(
        ind.data as unknown as FilaIndicador[],
        met.data as FilaMeta[],
        asi.data as FilaAsignacion[],
        {
          modo: seguimiento.ajustes.avanceModo,
          hayCorteAbierto: seguimiento.abierto !== null,
          avances: ava.data as FilaAvanceValidado[],
          acumuladas: acu.data as FilaMetaAcumulada[],
          vigentes,
        },
      ),
    }
  } catch (e) {
    console.error('[pdm/datos] excepción:', e)
    return FALLO
  }
})

/**
 * Los reportes vigentes de UN corte (el que se mira en «Reportes», abierto o cerrado).
 * `null` si no se pudieron leer: la pantalla lo dice, no pinta ceros.
 */
export const cargarVigentesDelCorte = cache(async (corteId: string): Promise<FilaVigente[] | null> => {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('pdm_reportes_vigentes').select(COLUMNAS_VIGENTE).eq('corte_id', corteId)
    if (error || !data) {
      console.error('[pdm/datos] reportes del corte:', error?.message)
      return null
    }
    if (data.length >= TOPE_POSTGREST) {
      console.error('[pdm/datos] los reportes del corte llegaron al tope de filas de PostgREST')
      return null
    }
    return data as FilaVigente[]
  } catch (e) {
    console.error('[pdm/datos] excepción en reportes del corte:', e)
    return null
  }
})

/** Cuántos reportes tiene cada corte (para saber cuáles se pueden eliminar). `null` si no se pudo leer. */
export async function contarReportesPorCorte(corteIds: string[]): Promise<Record<string, number> | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const cuentas = await Promise.all(corteIds.map(async id => {
      const { count, error } = await supabase.from('pdm_reportes').select('id', { count: 'exact', head: true }).eq('corte_id', id)
      return error ? null : ([id, count ?? 0] as const)
    }))
    if (cuentas.some(c => c === null)) return null
    return Object.fromEntries(cuentas as (readonly [string, number])[])
  } catch (e) {
    console.error('[pdm/datos] conteo de reportes:', e)
    return null
  }
}
