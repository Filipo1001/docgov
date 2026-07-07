'use server'

/**
 * Server Action: carga de datos del módulo "Opciones avanzadas" (admin only).
 *
 * Por qué existe: las mutaciones del módulo corren como server actions
 * (cookies httpOnly renovadas por el middleware — siempre funcionan), pero la
 * relectura corría con el browser client singleton, cuya sesión en memoria
 * puede estar vencida o con el Navigator Lock colgado tras inactividad. Esas
 * queries fallaban en silencio y la UI se quedaba con datos viejos hasta un F5.
 *
 * Al leer por el MISMO camino de confianza que las escrituras, la relectura
 * post-mutación es tan confiable como la mutación misma. Bonus de rendimiento:
 * una sola ida y vuelta (antes eran 3: contrato + periodos por el browser,
 * otrosíes por action) y las URLs de planilla llegan firmadas (bucket privado).
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { firmarUrls } from '@/lib/storage-firmado'
import type { EstadoPeriodo } from '@/lib/types'
import type { Otrosi } from './otrosies'

export interface PeriodoAvanzado {
  id: string
  numero_periodo: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
  estado: EstadoPeriodo
  es_historico: boolean
  planilla_ss_url: string | null
  /** URL firmada temporal para abrir el PDF (bucket privado). */
  planilla_url_firmada: string | null
  numero_planilla: string | null
  planilla_estado: 'pendiente' | 'aprobada' | 'rechazada' | null
  base_cotizacion_ss: number | null
  cotizacion_mes: string | null
  cotizacion_origen: 'inferido' | 'confirmado' | null
}

export interface ContratoAvanzado {
  id: string
  numero: string
  anio: number
  objeto: string
  valor_total: number
  valor_mensual: number
  fecha_inicio: string
  fecha_fin: string
}

export interface AvanzadoData {
  contrato: ContratoAvanzado
  periodos: PeriodoAvanzado[]
  otrosies: Otrosi[]
}

export async function getAvanzadoData(
  contratoId: string,
): Promise<{ data?: AvanzadoData; error?: string }> {
  try {
    // Auth por cookies httpOnly — el mismo camino que las mutaciones
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada. Recarga la página.' }

    const { data: yo } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()
    if (yo?.rol !== 'admin') return { error: 'Solo administradores pueden ver este módulo' }

    const admin = createAdminSupabaseClient()
    const [{ data: contrato }, { data: periodos }, { data: otrosies }] = await Promise.all([
      admin
        .from('contratos')
        .select('id, numero, anio, objeto, valor_total, valor_mensual, fecha_inicio, fecha_fin')
        .eq('id', contratoId)
        .single(),
      admin
        .from('periodos')
        .select('id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado, es_historico, planilla_ss_url, numero_planilla, planilla_estado, base_cotizacion_ss, cotizacion_mes, cotizacion_origen')
        .eq('contrato_id', contratoId)
        .order('numero_periodo'),
      admin
        .from('otrosies')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('numero'),
    ])

    if (!contrato) return { error: 'Contrato no encontrado' }

    // Firmar en batch las URLs de planilla (bucket documentos privado)
    const rows = (periodos ?? []) as Omit<PeriodoAvanzado, 'planilla_url_firmada'>[]
    const firmadas = await firmarUrls('documentos', rows.map(p => p.planilla_ss_url))

    return {
      data: {
        contrato: contrato as ContratoAvanzado,
        periodos: rows.map(p => ({
          ...p,
          planilla_url_firmada: p.planilla_ss_url ? (firmadas[p.planilla_ss_url] ?? null) : null,
        })),
        otrosies: (otrosies ?? []) as Otrosi[],
      },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al cargar los datos' }
  }
}
