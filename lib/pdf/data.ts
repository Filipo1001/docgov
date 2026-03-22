/**
 * Assembles the flat PDFData object needed by both PDF templates.
 * Runs server-side only (called from API routes).
 *
 * IMPORTANT: Only query columns that are guaranteed to exist in the current
 * schema. Optional fields (NIT, cargo, telefono, etc.) are set to undefined
 * and the PDF templates handle their absence gracefully.
 * Run supabase/migrations/002_pdf_fields.sql to unlock those fields.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { PDFData } from './types'

export async function buildPDFData(periodoId: string): Promise<PDFData | null> {
  const supabase = await createServerSupabaseClient()

  // Only query columns that are guaranteed to exist in the base schema
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
        id,
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

  const contrato = periodo.contrato as any
  if (!contrato) return null

  // Optional secondary query for contract start/end dates.
  // If the columns don't exist yet, Supabase returns error + null data — we
  // just skip them rather than failing the whole PDF generation.
  const { data: contratoDates } = await supabase
    .from('contratos')
    .select('fecha_inicio, fecha_fin')
    .eq('id', contrato.id ?? '')
    .single()

  // Fetch obligations for this contract
  const { data: obligacionesRaw } = await supabase
    .from('obligaciones')
    .select('id, descripcion, es_permanente')
    .eq('contrato_id', contrato.id ?? '')
    .order('orden')

  // Fetch activities WITH their evidence photos for this specific period
  const { data: actividadesDelPeriodo } = await supabase
    .from('actividades')
    .select('id, obligacion_id, descripcion, cantidad, evidencias(id, url, nombre_archivo)')
    .eq('periodo_id', periodoId)
    .order('orden')

  type ActRow = {
    id: string
    obligacion_id: string
    descripcion: string
    cantidad: number
    evidencias: Array<{ id: string; url: string; nombre_archivo: string }>
  }

  const actsPorObligacion = new Map<
    string,
    Array<{ descripcion: string; cantidad: number; evidencias: Array<{ url: string; nombre_archivo: string }> }>
  >()
  for (const act of (actividadesDelPeriodo ?? []) as ActRow[]) {
    const list = actsPorObligacion.get(act.obligacion_id) ?? []
    list.push({
      descripcion: act.descripcion,
      cantidad: act.cantidad,
      evidencias: (act.evidencias ?? []).map((ev) => ({
        url: ev.url,
        nombre_archivo: ev.nombre_archivo,
      })),
    })
    actsPorObligacion.set(act.obligacion_id, list)
  }

  const hoy = new Date()
  const fechaGeneracion = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  const municipio = contrato.municipio ?? {}

  return {
    municipio: {
      nombre: municipio.nombre ?? 'Municipio',
      // Extended fields — available after running migration 002_pdf_fields.sql
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
      valor_mensual: contrato.valor_mensual,
      valor_letras_mensual: contrato.valor_letras_mensual ?? '',
      // Extended fields — available after running migration 002_pdf_fields.sql
      valor_letras_total: contrato.valor_letras_total ?? undefined,
      plazo_meses: contrato.plazo_meses ?? undefined,
      duracion_letras: contrato.duracion_letras ?? undefined,
      banco: contrato.banco,
      tipo_cuenta: contrato.tipo_cuenta,
      numero_cuenta: contrato.numero_cuenta,
      dependencia: contrato.dependencia?.nombre ?? '',
      fecha_inicio_contrato: (contratoDates as any)?.fecha_inicio ?? undefined,
      fecha_fin_contrato: (contratoDates as any)?.fecha_fin ?? undefined,
      contratista: {
        nombre_completo: contrato.contratista?.nombre_completo ?? '',
        cedula: contrato.contratista?.cedula ?? '',
        // Extended fields — available after running migration 002_pdf_fields.sql
        cargo: contrato.contratista?.cargo ?? undefined,
        telefono: contrato.contratista?.telefono ?? undefined,
        direccion: contrato.contratista?.direccion ?? undefined,
      },
      supervisor: {
        nombre_completo: contrato.supervisor?.nombre_completo ?? '',
        cedula: contrato.supervisor?.cedula ?? '',
        // Extended fields — available after running migration 002_pdf_fields.sql
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
      // Extended field — available after running migration 002_pdf_fields.sql
      valor_letras: undefined,
    },
    obligaciones: (obligacionesRaw ?? []).map((obl: any) => ({
      descripcion: obl.descripcion,
      es_permanente: obl.es_permanente,
      actividades: actsPorObligacion.get(obl.id) ?? [],
    })),
    fechaGeneracion,
  }
}
