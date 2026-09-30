import 'server-only'
import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ANIO_SEGUIMIENTO } from './identidad'
import { armarIndicadores, type FilaAsignacion, type FilaIndicador, type FilaMeta } from './datos-armar'
import type { Indicador } from './plan'

/**
 * El plan, leído de la base.
 *
 * ── Solo lee, con la sesión de quien mira ────────────────────────────────
 *
 * Tres consultas de lectura sobre tablas `pdm_*`, con la sesión del usuario: lo
 * que ve lo decide RLS, no este código. Hoy solo entra el administrador (la
 * puerta es `exigirAccesoPdm`), que lo ve todo.
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

const TOPE_POSTGREST = 1000

export interface PlanPdm {
  ok: boolean
  indicadores: Indicador[]
}

const FALLO: PlanPdm = { ok: false, indicadores: [] }

export const cargarPlanPdm = cache(async (): Promise<PlanPdm> => {
  try {
    const supabase = await createServerSupabaseClient()
    const [ind, met, asi] = await Promise.all([
      supabase
        .from('pdm_indicadores')
        .select('id, fila_origen, codigo, linea, sector, programa, producto, indicador, unidad, linea_base, meta_cuatrienio, responsable_origen, dependencia:dependencias(nombre)')
        .eq('activo', true)
        .order('fila_origen'),
      supabase.from('pdm_metas').select('indicador_id, meta').eq('anio', ANIO_SEGUIMIENTO),
      supabase.from('pdm_asignaciones').select('indicador_id, usuario_id, principal'),
    ])

    const error = ind.error ?? met.error ?? asi.error
    if (error || !ind.data || !met.data || !asi.data) {
      console.error('[pdm/datos] lectura fallida:', error?.message)
      return FALLO
    }
    if ([ind.data, met.data, asi.data].some(d => d.length >= TOPE_POSTGREST)) {
      console.error('[pdm/datos] una consulta llegó al tope de filas de PostgREST: los datos pueden estar cortados')
      return FALLO
    }

    return {
      ok: true,
      indicadores: armarIndicadores(
        ind.data as unknown as FilaIndicador[],
        met.data as FilaMeta[],
        asi.data as FilaAsignacion[],
      ),
    }
  } catch (e) {
    console.error('[pdm/datos] excepción:', e)
    return FALLO
  }
})
