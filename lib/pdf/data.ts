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
      valor_letras,
      estado,
      contrato:contratos(
        id,
        numero,
        anio,
        objeto,
        modalidad_seleccion,
        valor_total,
        valor_letras_total,
        valor_mensual,
        valor_letras_mensual,
        plazo_meses,
        duracion_letras,
        banco,
        tipo_cuenta,
        numero_cuenta,
        contratista:usuarios!contratos_contratista_id_fkey(
          nombre_completo, cedula, telefono, direccion, cargo
        ),
        supervisor:usuarios!contratos_supervisor_id_fkey(
          nombre_completo, cedula, cargo
        ),
        dependencia:dependencias(nombre),
        municipio:municipios(
          nombre, departamento, nit, representante_legal, cedula_representante
        )
      )
    `)
    .eq('id', periodoId)
    .single()

  if (error || !periodo) return null

  const contrato = periodo.contrato as any
  if (!contrato) return null

  // Filter activities to only those registered in THIS period
  const { data: actividadesDelPeriodo } = await supabase
    .from('actividades')
    .select('obligacion_id, descripcion, cantidad')
    .eq('periodo_id', periodoId)
    .order('orden')

  // Fetch obligations for this contract
  const { data: obligacionesRaw } = await supabase
    .from('obligaciones')
    .select('id, descripcion, es_permanente')
    .eq('contrato_id', contrato.id ?? '')
    .order('orden')

  const actsPorObligacion = new Map<string, Array<{ descripcion: string; cantidad: number }>>()
  for (const act of actividadesDelPeriodo ?? []) {
    const list = actsPorObligacion.get(act.obligacion_id) ?? []
    list.push({ descripcion: act.descripcion, cantidad: act.cantidad })
    actsPorObligacion.set(act.obligacion_id, list)
  }

  const hoy = new Date()
  const fechaGeneracion = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  const municipio = contrato.municipio ?? {}

  return {
    municipio: {
      nombre: municipio.nombre ?? 'Municipio',
      departamento: municipio.departamento ?? undefined,
      nit: municipio.nit ?? undefined,
      representante_legal: municipio.representante_legal ?? undefined,
      cedula_representante: municipio.cedula_representante ?? undefined,
    },
    contrato: {
      numero: contrato.numero,
      anio: contrato.anio,
      objeto: contrato.objeto,
      modalidad_seleccion: contrato.modalidad_seleccion ?? 'Contratación Directa',
      valor_total: contrato.valor_total,
      valor_letras_total: contrato.valor_letras_total ?? undefined,
      valor_mensual: contrato.valor_mensual,
      valor_letras_mensual: contrato.valor_letras_mensual ?? '',
      plazo_meses: contrato.plazo_meses ?? undefined,
      duracion_letras: contrato.duracion_letras ?? undefined,
      banco: contrato.banco,
      tipo_cuenta: contrato.tipo_cuenta,
      numero_cuenta: contrato.numero_cuenta,
      dependencia: contrato.dependencia?.nombre ?? '',
      contratista: {
        nombre_completo: contrato.contratista?.nombre_completo ?? '',
        cedula: contrato.contratista?.cedula ?? '',
        cargo: contrato.contratista?.cargo ?? undefined,
        telefono: contrato.contratista?.telefono ?? undefined,
        direccion: contrato.contratista?.direccion ?? undefined,
      },
      supervisor: {
        nombre_completo: contrato.supervisor?.nombre_completo ?? '',
        cedula: contrato.supervisor?.cedula ?? '',
        cargo: contrato.supervisor?.cargo ?? undefined,
      },
    },
    periodo: {
      numero: periodo.numero_periodo,
      mes: periodo.mes,
      anio: periodo.anio,
      fecha_inicio: periodo.fecha_inicio,
      fecha_fin: periodo.fecha_fin,
      valor_cobro: periodo.valor_cobro,
      valor_letras: (periodo as any).valor_letras ?? undefined,
    },
    obligaciones: (obligacionesRaw ?? []).map((obl: any) => ({
      descripcion: obl.descripcion,
      es_permanente: obl.es_permanente,
      actividades: actsPorObligacion.get(obl.id) ?? [],
    })),
    fechaGeneracion,
  }
}
