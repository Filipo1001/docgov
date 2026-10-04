import 'server-only'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  TAMANO_PAGINA, aplicarFiltros, armarFilas, nombresPedibles, relacionar,
  type EvidenciaFila, type FilaDeVista, type FilaRelacionable, type FiltroEvidencias, type IndicadorRelacionado,
} from './evidencias-armar'

/**
 * Los archivos de evidencia, leídos de la base para la vista «Evidencias».
 *
 * ── Solo lee, con la sesión de quien mira ────────────────────────────────
 *
 * De `pdm_evidencias_vista` (migración 059), que corre con los permisos de quien pregunta: lo que ve cada quien lo
 * decide la base, no este código. Los filtros se aplican EN la consulta y se pide una página (25) a la vez: con el
 * tiempo son miles de archivos, y PostgREST corta en silencio en 1.000.
 *
 * Si la lectura falla, se dice; no se inventa.
 */

export interface Evidencias {
  ok: boolean
  filas: EvidenciaFila[]
  /** Cuántos archivos cumplen el filtro (no solo los de esta página). */
  total: number
  /** La página que de verdad se trajo (si se pidió una que no existe, la primera). */
  pagina: number
}

const COLUMNAS =
  'id, reporte_id, nombre, tipo, bytes, conservada, indicador_id, indicador_fila, codigo, indicador, sector, dependencia, anio, valor, autor_nombre, reportado_en, estado_reporte, reemplazada, observacion'

const COLUMNAS_RELACIONADAS =
  'id, indicador_id, indicador_fila, codigo, indicador, sector, dependencia, anio, estado_reporte, nombre, bytes, tipo, autor_nombre, reportado_en, observacion, conservada'

const FALLO: Evidencias = { ok: false, filas: [], total: 0, pagina: 1 }

export async function cargarEvidencias(f: FiltroEvidencias): Promise<Evidencias> {
  try {
    const supabase = await createServerSupabaseClient()

    const pedir = async (pagina: number) => {
      const q = aplicarFiltros(supabase.from('pdm_evidencias_vista').select(COLUMNAS, { count: 'exact' }), f)
      const desde = (pagina - 1) * TAMANO_PAGINA
      return q.order('reportado_en', { ascending: false }).order('id').range(desde, desde + TAMANO_PAGINA - 1)
    }

    let pagina = f.pagina
    let r = await pedir(pagina)
    // Una página que ya no existe (se quitó un filtro, se corrigió algo): se vuelve a la primera.
    if (r.error && pagina > 1 && r.error.code === 'PGRST103') {
      pagina = 1
      r = await pedir(pagina)
    }
    if (r.error || !r.data) {
      console.error('[pdm/evidencias] lectura fallida:', r.error?.message)
      return FALLO
    }
    const filas = r.data as unknown as FilaDeVista[]

    // Qué otros indicadores respalda cada archivo. Si esta segunda lectura falla, la lista sigue: solo faltan los
    // «también respalda a…», que son un complemento y no justifican esconder los archivos.
    let relaciones = new Map<string, IndicadorRelacionado[]>()
    const nombres = nombresPedibles(filas)
    if (nombres.length > 0) {
      const otras = await supabase
        .from('pdm_evidencias_vista')
        .select(COLUMNAS_RELACIONADAS)
        .in('nombre', nombres)
        .eq('reemplazada', false)
        .limit(1000)
      if (otras.error) console.error('[pdm/evidencias] relaciones no leídas:', otras.error.message)
      else relaciones = relacionar(filas, (otras.data ?? []) as unknown as FilaRelacionable[])
    }

    return { ok: true, filas: armarFilas(filas, relaciones), total: r.count ?? r.data.length, pagina }
  } catch (e) {
    console.error('[pdm/evidencias] excepción:', e)
    return FALLO
  }
}
