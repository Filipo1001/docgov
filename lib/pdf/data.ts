/**
 * Assembles the flat PDFData object needed by all PDF templates.
 * Runs server-side only (called from API routes).
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { numeroALetras } from '@/lib/format'
import type { PDFData, PDFPagoHistorial } from './types'

/** Normaliza abreviatura de moneda → siempre M/L */
function normalizaMoneda(texto: string): string {
  return texto.replace(/\bM\/CTE\b/gi, 'M/L').trim()
}

/** Último día del periodo (fecha_fin) + 6 días calendario → 'DD/MM/YYYY' */
function calcFechaPago(fechaFin: string): string {
  const d = new Date(fechaFin + 'T00:00:00')
  d.setDate(d.getDate() + 6)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export async function buildPDFData(periodoId: string): Promise<PDFData | null> {
  const supabase = await createServerSupabaseClient()

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
      planilla_ss_url,
      numero_planilla,
      observacion_supervisor,
      contrato:contratos(
        id,
        numero,
        anio,
        objeto,
        modalidad_seleccion,
        valor_total,
        valor_mensual,
        valor_letras_total,
        valor_letras_mensual,
        plazo_meses,
        banco,
        tipo_cuenta,
        numero_cuenta,
        fecha_inicio,
        fecha_fin,
        cdp,
        crp,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula, cargo, telefono, direccion, firma_url, banco, tipo_cuenta, numero_cuenta),
        supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, cedula, cargo, firma_url),
        dependencia:dependencias(nombre),
        municipio:municipios(nombre, departamento, nit, representante_legal, cedula_representante)
      )
    `)
    .eq('id', periodoId)
    .single()

  if (error || !periodo) return null

  const contrato = periodo.contrato as any
  if (!contrato) return null

  // Queries 2, 3, 4 — run in parallel (independent of each other)
  const [
    { data: allPeriodos },
    { data: obligacionesRaw },
    { data: actividadesDelPeriodo },
  ] = await Promise.all([
    // All periods for payment history + planilla table
    supabase
      .from('periodos')
      .select('numero_periodo, valor_cobro, estado, mes, fecha_fin, numero_planilla')
      .eq('contrato_id', contrato.id)
      .order('numero_periodo'),

    // Obligations for this contract
    supabase
      .from('obligaciones')
      .select('id, descripcion, es_permanente')
      .eq('contrato_id', contrato.id ?? '')
      .order('orden'),

    // Activities + evidence for this period
    supabase
      .from('actividades')
      .select('id, obligacion_id, descripcion, cantidad, evidencias(id, url, nombre_archivo)')
      .eq('periodo_id', periodoId)
      .order('orden'),
  ])

  // Build payment history (up to current period)
  const pagosHistorial: PDFPagoHistorial[] = []
  let acumulado = 0
  for (const p of (allPeriodos ?? []) as any[]) {
    if (p.numero_periodo > periodo.numero_periodo) break
    acumulado += p.valor_cobro
    pagosHistorial.push({
      acta_numero: p.numero_periodo,
      mes: p.mes,
      fecha_pago: calcFechaPago(p.fecha_fin),
      valor_contrato: contrato.valor_total,
      valor_pagado_acumulado: acumulado - p.valor_cobro,
      valor_acta: p.valor_cobro,
      saldo_pendiente: contrato.valor_total - acumulado,
      numero_planilla: p.numero_planilla ?? null,
    })
  }

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
      valor_letras_mensual: normalizaMoneda(contrato.valor_letras_mensual ?? ''),
      valor_letras_total: contrato.valor_letras_total ? normalizaMoneda(contrato.valor_letras_total) : undefined,
      plazo_meses: contrato.plazo_meses ?? undefined,
      duracion_letras: contrato.duracion_letras ?? undefined,
      // Prefer contratista's bank data (single source of truth).
      // Fall back to contract-level data for backwards compatibility.
      banco: contrato.contratista?.banco || contrato.banco,
      tipo_cuenta: contrato.contratista?.tipo_cuenta || contrato.tipo_cuenta,
      numero_cuenta: contrato.contratista?.numero_cuenta || contrato.numero_cuenta,
      dependencia: contrato.dependencia?.nombre ?? '',
      fecha_inicio_contrato: contrato.fecha_inicio ?? undefined,
      fecha_fin_contrato: contrato.fecha_fin ?? undefined,
      cdp: contrato.cdp ?? undefined,
      crp: contrato.crp ?? undefined,
      contratista: {
        nombre_completo: contrato.contratista?.nombre_completo ?? '',
        cedula: contrato.contratista?.cedula ?? '',
        cargo: contrato.contratista?.cargo ?? undefined,
        telefono: contrato.contratista?.telefono ?? undefined,
        direccion: contrato.contratista?.direccion ?? undefined,
        firma_url: contrato.contratista?.firma_url ?? undefined,
      },
      supervisor: {
        nombre_completo: contrato.supervisor?.nombre_completo ?? '',
        cedula: contrato.supervisor?.cedula ?? '',
        cargo: contrato.supervisor?.cargo ?? undefined,
        firma_url: contrato.supervisor?.firma_url ?? undefined,
      },
    },
    periodo: {
      numero: periodo.numero_periodo,
      mes: periodo.mes,
      anio: periodo.anio,
      fecha_inicio: periodo.fecha_inicio,
      fecha_fin: periodo.fecha_fin,
      valor_cobro: periodo.valor_cobro,
      estado: (periodo as any).estado ?? 'borrador',
      // Letras calculadas por periodo: si el valor es proporcional (primer/último mes),
      // las letras del contrato no aplican — se deriva directo de valor_cobro.
      valor_letras: numeroALetras(periodo.valor_cobro),
      numero_planilla: (periodo as any).numero_planilla ?? undefined,
      observacion_supervisor: (periodo as any).observacion_supervisor ?? null,
    },
    obligaciones: (obligacionesRaw ?? []).map((obl: any) => ({
      descripcion: obl.descripcion,
      es_permanente: obl.es_permanente,
      actividades: actsPorObligacion.get(obl.id) ?? [],
    })),
    fechaGeneracion,
    pagosHistorial,
  }
}
