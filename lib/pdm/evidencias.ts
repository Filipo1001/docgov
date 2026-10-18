import 'server-only'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Indicador } from './plan'
import type { FilaAnulacion } from './anulaciones'
import {
  SIN_CONTEO, anulacionDeArchivos, aplicarBusqueda, armarFilasIndicador, contarPorEstado, indicadoresConEvidencia, indicadoresSoloAnulados,
  nombresPedibles, rangoDePagina, relacionar,
  type AnulacionDeArchivo, type ConteoEstados, type FilaDeVista, type FilaIndicador, type FilaRelacionable, type FiltroEvidencias, type IndicadorRelacionado,
} from './evidencias-armar'

/**
 * Las evidencias para la vista «Evidencias»: los indicadores que tienen archivos en UN año, con esos archivos.
 *
 * ── Solo lee, con la sesión de quien mira ────────────────────────────────
 *
 * Qué indicadores hay (y cuáles ve cada quien) ya lo dice la lista del plan que la pantalla tiene cargada: la base
 * le entregó a cada quien solo lo suyo. De la base se piden únicamente los ARCHIVOS de los indicadores de la página
 * (25), de `pdm_evidencias_vista` (migración 059), que corre con los permisos de quien pregunta.
 *
 * Si se busca por texto, antes se pregunta a la base qué indicadores tienen archivos que coincidan (en el nombre del
 * archivo, en el indicador o en su código). Son solo identificadores, y se piden por tandas de 1.000 porque PostgREST
 * corta en silencio en ese número.
 *
 * ── Lo anulado (migraciones 068 y 069) ───────────────────────────────────
 *
 * Los archivos de un reporte ANULADO no cuentan, pero quien puede verlos (el administrador, Control Interno y quien reportó;
 * para el resto la base ni los entrega) los ve tachados, con quién los anuló y por qué. Salen dentro de la fila de su
 * indicador; y los indicadores cuyo único reporte del año fue anulado salen al final de la lista, sin estado.
 *
 * Si la lectura falla, se dice; no se inventa.
 */

export interface Evidencias {
  ok: boolean
  filas: FilaIndicador[]
  /** Cuántos indicadores cumplen el filtro (no solo los de esta página). */
  total: number
  /** Cuántos hay en cada estado del semáforo, con la secretaría y la búsqueda puestas pero sin el filtro de estado. */
  conteo: ConteoEstados
  /** La página que de verdad se trajo (si se pidió una que no existe, la última). */
  pagina: number
  /**
   * Cuántos indicadores del filtro no tienen reporte vigente con archivos pero sí archivos anulados que quien pregunta ve
   * (con la secretaría y la búsqueda puestas, sin el filtro de estado). Cuentan en «Todos»; no tienen estado.
   */
  soloAnulados: number
}

const COLUMNAS =
  'id, reporte_id, nombre, tipo, bytes, conservada, indicador_id, indicador_fila, codigo, indicador, sector, dependencia, anio, valor, autor_nombre, reportado_en, estado_reporte, reemplazada, anulada, observacion'

const COLUMNAS_RELACIONADAS =
  'id, indicador_id, indicador_fila, codigo, indicador, sector, dependencia, anio, estado_reporte, nombre, bytes, tipo'

const FALLO: Evidencias = { ok: false, filas: [], total: 0, conteo: SIN_CONTEO, pagina: 1, soloAnulados: 0 }

/** Tope de seguridad de la búsqueda por tandas: 20 tandas de 1.000 archivos coincidentes. */
const MAX_TANDAS = 20

export async function cargarEvidencias(indicadores: Indicador[], f: FiltroEvidencias): Promise<Evidencias> {
  try {
    const supabase = await createServerSupabaseClient()

    // 1 · Si se busca por texto: qué indicadores tienen archivos que coincidan en este año.
    let ids: Set<string> | null = null
    if (f.q !== '') {
      ids = new Set<string>()
      for (let t = 0; t < MAX_TANDAS; t++) {
        const r = await aplicarBusqueda(
          supabase.from('pdm_evidencias_vista').select('id, indicador_id').eq('anio', f.anio).eq('reemplazada', false),
          f.q,
        ).order('id').range(t * 1000, t * 1000 + 999)
        if (r.error || !r.data) {
          console.error('[pdm/evidencias] búsqueda fallida:', r.error?.message)
          return FALLO
        }
        for (const x of r.data as { indicador_id: string }[]) ids.add(x.indicador_id)
        if (r.data.length < 1000) break
      }
    }

    // 1b · Qué indicadores tienen archivos de reportes ANULADOS que quien pregunta puede ver (la base entrega solo esos).
    //      Es un complemento: si esta lectura falla se sigue sin ellos y se deja constancia, no se esconde la pantalla.
    const conAnulados = new Set<string>()
    for (let t = 0; t < MAX_TANDAS; t++) {
      const r = await supabase
        .from('pdm_evidencias_vista')
        .select('id, indicador_id')
        .eq('anio', f.anio).eq('reemplazada', false).eq('anulada', true)
        .order('id').range(t * 1000, t * 1000 + 999)
      if (r.error || !r.data) {
        console.error('[pdm/evidencias] anulados no leídos:', r.error?.message)
        break
      }
      for (const x of r.data as { indicador_id: string }[]) conAnulados.add(x.indicador_id)
      if (r.data.length < 1000) break
    }

    // 2 · Los indicadores con evidencia en el año, filtrados y ordenados; después, los que solo tienen archivos anulados.
    //     Se muestra una página.
    const vigentes = indicadoresConEvidencia(indicadores, f, ids)
    const soloAnulados = indicadoresSoloAnulados(indicadores, f, conAnulados, ids)
    const todos = f.estado === null ? [...vigentes, ...soloAnulados] : vigentes
    const conteo = contarPorEstado(indicadores, f, ids)
    const { desde, hasta, pagina } = rangoDePagina(f.pagina, todos.length)
    const deLaPagina = todos.slice(desde === 0 ? 0 : desde - 1, hasta)
    if (deLaPagina.length === 0) return { ok: true, filas: [], total: todos.length, conteo, pagina, soloAnulados: soloAnulados.length }

    // 3 · Los archivos vigentes de esos indicadores en ese año, y los de reportes anulados que quien pregunta ve.
    const a = await supabase
      .from('pdm_evidencias_vista')
      .select(COLUMNAS)
      .in('indicador_id', deLaPagina.map(i => i.uuid))
      .eq('anio', f.anio)
      .eq('reemplazada', false)
      .order('reportado_en', { ascending: false })
      .order('id')
      .limit(1000)
    if (a.error || !a.data) {
      console.error('[pdm/evidencias] lectura fallida:', a.error?.message)
      return FALLO
    }
    const archivos = a.data as unknown as FilaDeVista[]

    // 4 · Qué otros indicadores del mismo año respalda cada archivo. Si esta lectura falla, la lista sigue: solo faltan
    //     los «también respalda a…», que son un complemento y no justifican esconder los archivos.
    let relaciones = new Map<string, IndicadorRelacionado[]>()
    const nombres = nombresPedibles(archivos.filter(x => !x.anulada))
    if (nombres.length > 0) {
      const otras = await supabase
        .from('pdm_evidencias_vista')
        .select(COLUMNAS_RELACIONADAS)
        .in('nombre', nombres)
        .eq('anio', f.anio)
        .eq('reemplazada', false)
        .eq('anulada', false)
        .limit(1000)
      if (otras.error) console.error('[pdm/evidencias] relaciones no leídas:', otras.error.message)
      else relaciones = relacionar(archivos.filter(x => !x.anulada), (otras.data ?? []) as unknown as FilaRelacionable[])
    }

    // 5 · Cómo se anuló cada reporte anulado (quién, cuándo, por qué). Otro complemento: sin él, el archivo sale igual tachado.
    let anulaciones = new Map<string, AnulacionDeArchivo>()
    const reportesAnulados = [...new Set(archivos.filter(x => x.anulada).map(x => x.reporte_id))]
    if (reportesAnulados.length > 0) {
      const an = await supabase
        .from('pdm_anulaciones')
        .select('reporte_id, accion, motivo, actor_nombre, created_at')
        .in('reporte_id', reportesAnulados)
      if (an.error) console.error('[pdm/evidencias] anulaciones no leídas:', an.error.message)
      else anulaciones = anulacionDeArchivos((an.data ?? []) as unknown as FilaAnulacion[])
    }

    return {
      ok: true, filas: armarFilasIndicador(deLaPagina, f.anio, archivos, relaciones, anulaciones),
      total: todos.length, conteo, pagina, soloAnulados: soloAnulados.length,
    }
  } catch (e) {
    console.error('[pdm/evidencias] excepción:', e)
    return FALLO
  }
}
