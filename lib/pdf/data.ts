/**
 * Assembles the flat PDFData object needed by both PDF templates.
 * Runs server-side only (called from API routes).
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { PDFData } from './types'

export async function buildPDFData(periodoId: string): Promise<PDFData | null> {
  const supabase = await createServerSupabaseClient()

  // Single query — all joined data
  const { data: periodo, error } = await supabase
    .from('periodos')
    .select(`
      id,
      numero_periodo,
      mes,
      anio,
      fecha_inicio,
      fecha_fin,
      valor_cobro,
      estado,
      contrato:contratos(
        numero,
        anio,
        objeto,
        modalidad_seleccion,
        valor_total,
        valor_mensual,
        valor_letras_mensual,
        banco,
        tipo_cuenta,
        numero_cuenta,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula),
        supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, cedula),
        dependencia:dependencias(nombre),
        municipio:municipios(nombre)
      )
    `)
    .eq('id', periodoId)
    .single()

  if (error || !periodo) return null

  // Fetch obligations with their activities for this period
  const { data: obligacionesRaw } = await supabase
    .from('obligaciones')
    .select(`
      id,
      descripcion,
      es_permanente,
      actividades(descripcion, cantidad)
    `)
    .eq('contrato_id', (periodo.contrato as any).id ?? '')
    .order('orden')

  const contrato = periodo.contrato as any
  if (!contrato) return null

  // Filter activities to only those registered in THIS period
  const { data: actividadesDelPeriodo } = await supabase
    .from('actividades')
    .select('obligacion_id, descripcion, cantidad')
    .eq('periodo_id', periodoId)
    .order('orden')

  const actsPorObligacion = new Map<string, Array<{ descripcion: string; cantidad: number }>>()
  for (const act of actividadesDelPeriodo ?? []) {
    const list = actsPorObligacion.get(act.obligacion_id) ?? []
    list.push({ descripcion: act.descripcion, cantidad: act.cantidad })
    actsPorObligacion.set(act.obligacion_id, list)
  }

  const hoy = new Date()
  const fechaGeneracion = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  return {
    municipio: contrato.municipio?.nombre ?? 'Municipio',
    contrato: {
      numero: contrato.numero,
      anio: contrato.anio,
      objeto: contrato.objeto,
      modalidad_seleccion: contrato.modalidad_seleccion,
      valor_total: contrato.valor_total,
      valor_mensual: contrato.valor_mensual,
      valor_letras_mensual: contrato.valor_letras_mensual,
      banco: contrato.banco,
      tipo_cuenta: contrato.tipo_cuenta,
      numero_cuenta: contrato.numero_cuenta,
      dependencia: contrato.dependencia?.nombre ?? '',
      contratista: {
        nombre_completo: contrato.contratista?.nombre_completo ?? '',
        cedula: contrato.contratista?.cedula ?? '',
      },
      supervisor: {
        nombre_completo: contrato.supervisor?.nombre_completo ?? '',
        cedula: contrato.supervisor?.cedula ?? '',
      },
    },
    periodo: {
      numero: periodo.numero_periodo,
      mes: periodo.mes,
      anio: periodo.anio,
      fecha_inicio: periodo.fecha_inicio,
      fecha_fin: periodo.fecha_fin,
      valor_cobro: periodo.valor_cobro,
    },
    obligaciones: (obligacionesRaw ?? []).map((obl: any) => ({
      descripcion: obl.descripcion,
      es_permanente: obl.es_permanente,
      actividades: actsPorObligacion.get(obl.id) ?? [],
    })),
    fechaGeneracion,
  }
}
