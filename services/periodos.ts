/**
 * Service: Periodos
 *
 * All Supabase queries related to periodos, actividades, and evidencias.
 * Components import from here instead of writing queries inline.
 * All functions return typed data, never `any`.
 */

import { createClient } from '@/lib/supabase'
import type { Periodo, Obligacion, Actividad, Contrato } from '@/lib/types'
import type { EstadoPeriodo } from '@/lib/types'

// ─── Periodo queries ──────────────────────────────────────────

export async function getPeriodoConContrato(
  periodoId: string,
  contratoId: string
): Promise<{
  contrato: Contrato | null
  periodo: Periodo | null
  obligaciones: Obligacion[]
  actividades: Actividad[]
}> {
  const supabase = createClient()

  const [
    { data: contrato },
    { data: periodo },
    { data: obligaciones },
    { data: actividades },
  ] = await Promise.all([
    supabase
      .from('contratos')
      .select(`
        *,
        contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula),
        supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo, cedula),
        dependencia:dependencias(nombre, abreviatura)
      `)
      .eq('id', contratoId)
      .single(),

    supabase
      .from('periodos')
      .select('*')
      .eq('id', periodoId)
      .single(),

    supabase
      .from('obligaciones')
      .select('*')
      .eq('contrato_id', contratoId)
      .order('orden'),

    supabase
      .from('actividades')
      .select('*, evidencias(*)')
      .eq('periodo_id', periodoId)
      .order('orden'),
  ])

  return {
    contrato: (contrato as Contrato) ?? null,
    periodo: (periodo as Periodo) ?? null,
    obligaciones: (obligaciones as Obligacion[]) ?? [],
    actividades: (actividades as Actividad[]) ?? [],
  }
}

export async function getPeriodosByContrato(contratoId: string): Promise<Periodo[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('periodos')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('numero_periodo')
  return (data as Periodo[]) ?? []
}

// ─── Approval queue queries ───────────────────────────────────

export async function getPeriodosPendientesParaRol(
  rol: string,
  userId: string
): Promise<Periodo[]> {
  const supabase = createClient()

  type PeriodoConContrato = Periodo & {
    contrato: {
      id: string
      numero: string
      objeto: string
      contratista_id: string
      supervisor_id: string
      contratista: { nombre_completo: string }
      supervisor: { id: string; nombre_completo: string }
      dependencia: { nombre: string; abreviatura: string }
    }
  }

  const estadoPorRol: Record<string, EstadoPeriodo | EstadoPeriodo[]> = {
    supervisor: 'enviado',
    asesor: 'revision_asesor',
    gobierno: 'revision_gobierno',
    hacienda: 'revision_hacienda',
    admin: ['enviado', 'revision_asesor', 'revision_gobierno', 'revision_hacienda'],
  }

  const estadoFiltro = estadoPorRol[rol]
  if (!estadoFiltro) return []

  let query = supabase
    .from('periodos')
    .select(`
      *,
      contrato:contratos(
        id, numero, objeto, contratista_id, supervisor_id,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo),
        supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
        dependencia:dependencias(nombre, abreviatura)
      )
    `)
    .order('fecha_envio', { ascending: true })

  if (Array.isArray(estadoFiltro)) {
    query = query.in('estado', estadoFiltro)
  } else {
    query = query.eq('estado', estadoFiltro)
    // Supervisor only sees their assigned contracts
    if (rol === 'supervisor') {
      const { data: ids } = await supabase
        .from('contratos')
        .select('id')
        .eq('supervisor_id', userId)
      const contratoIds = ids?.map((c) => c.id) ?? []
      if (contratoIds.length === 0) return []
      query = query.in('contrato_id', contratoIds)
    }
  }

  const { data } = await query
  return (data as PeriodoConContrato[]) ?? []
}

// ─── Actividad mutations (lower-risk, kept client-side) ───────

export async function crearActividad(params: {
  periodoId: string
  obligacionId: string
  descripcion: string
  cantidad: number
  orden: number
}): Promise<{ error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('actividades').insert({
    periodo_id: params.periodoId,
    obligacion_id: params.obligacionId,
    descripcion: params.descripcion.trim(),
    cantidad: params.cantidad,
    orden: params.orden,
  })
  return error ? { error: error.message } : {}
}

export async function eliminarActividad(actividadId: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('actividades')
    .delete()
    .eq('id', actividadId)
  return error ? { error: error.message } : {}
}
