import 'server-only'
import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hoyBogota } from './contrato'
import {
  armarIndicadores,
  type FilaAsignacion, type FilaAvanceValidado, type FilaIndicador, type FilaMeta, type FilaVigente,
} from './datos-armar'
import type { Indicador } from './plan'
import { ANIOS_PLAN, anioDeFecha, type Seguimiento } from './seguimiento'

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
 * metas son 1.022 (257 × 4 años), y los reportes vigentes pueden llegar a 257 × 4, así que se piden
 * AÑO POR AÑO (257 como mucho cada una), y si CUALQUIER consulta vuelve con 1.000 filas se trata como
 * fallo, no como dato.
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
  /** Con sus cuatro años; proyectados al año de hoy (`proyectarAnio` los cambia de año sin volver a leer). */
  indicadores: Indicador[]
  /** En qué año calendario estamos. */
  seguimiento: Seguimiento
  /** El id del plan activo, para los lugares que lo necesitan. */
  planId: string | null
}

const anioHoy = () => anioDeFecha(hoyBogota())

const FALLO: PlanPdm = { ok: false, indicadores: [], seguimiento: { anioActual: anioHoy() }, planId: null }

const COLUMNAS_VIGENTE =
  'reporte_id, indicador_id, anio, valor, estado, autor_id, autor_nombre, created_at, corrige_a, n_evidencias, validacion_comentario, validador_nombre'

export const cargarPlanPdm = cache(async (): Promise<PlanPdm> => {
  try {
    const supabase = await createServerSupabaseClient()
    const [ind, asi, pla, metas, avances, vigentes] = await Promise.all([
      supabase
        .from('pdm_indicadores')
        .select('id, fila_origen, codigo, linea, sector, programa, producto, indicador, unidad, linea_base, meta_cuatrienio, responsable_origen, dependencia:dependencias(nombre)')
        .eq('activo', true)
        .order('fila_origen'),
      supabase.from('pdm_asignaciones').select('indicador_id, usuario_id, principal, grupo_id'),
      supabase.from('pdm_planes').select('id').eq('activo', true),
      // Una consulta por año: cada una cabe con holgura en el tope de PostgREST.
      Promise.all(ANIOS_PLAN.map(a => supabase.from('pdm_metas').select('indicador_id, anio, meta').eq('anio', a))),
      Promise.all(ANIOS_PLAN.map(a => supabase.from('pdm_avance_validado').select('indicador_id, anio, valor').eq('anio', a))),
      Promise.all(ANIOS_PLAN.map(a => supabase.from('pdm_reportes_vigentes').select(COLUMNAS_VIGENTE).eq('anio', a))),
    ])

    const error = ind.error ?? asi.error ?? pla.error
      ?? [...metas, ...avances, ...vigentes].find(r => r.error)?.error
    if (error || !ind.data || !asi.data || !pla.data || [...metas, ...avances, ...vigentes].some(r => !r.data)) {
      console.error('[pdm/datos] lectura fallida:', error?.message)
      return FALLO
    }
    // Sin exactamente un plan activo no hay a qué atar nada (lo mismo exigen las funciones de la base).
    if (pla.data.length !== 1) {
      console.error('[pdm/datos] se esperaba un único plan activo y hay', pla.data.length)
      return FALLO
    }
    const todas = [ind.data, asi.data, ...metas.map(r => r.data!), ...avances.map(r => r.data!), ...vigentes.map(r => r.data!)]
    if (todas.some(d => d.length >= TOPE_POSTGREST)) {
      console.error('[pdm/datos] una consulta llegó al tope de filas de PostgREST: los datos pueden estar cortados')
      return FALLO
    }

    const seguimiento: Seguimiento = { anioActual: anioHoy() }
    return {
      ok: true,
      planId: pla.data[0].id as string,
      seguimiento,
      indicadores: armarIndicadores(
        ind.data as unknown as FilaIndicador[],
        metas.flatMap(r => r.data!) as FilaMeta[],
        asi.data as FilaAsignacion[],
        {
          anioActual: seguimiento.anioActual,
          avances: avances.flatMap(r => r.data!) as FilaAvanceValidado[],
          vigentes: vigentes.flatMap(r => r.data!) as FilaVigente[],
        },
      ),
    }
  } catch (e) {
    console.error('[pdm/datos] excepción:', e)
    return FALLO
  }
})
