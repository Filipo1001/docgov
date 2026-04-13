/**
 * Service: Admin & Reviewer Dashboard
 *
 * Queries for admin pipeline stats, recent activity,
 * and reviewer pending lists.
 * Uses browser Supabase client — import only in 'use client' components.
 */

import { createClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────

export interface PipelineStats {
  borrador: number
  enviado: number
  revision: number
  aprobado: number
  radicado: number
  rechazado: number
  totalContratos: number
}

export interface ActividadReciente {
  id: string
  tipo: string         // 'envio' | 'aprobacion' | 'rechazo' | 'radicado'
  periodo_id: string
  contrato_id: string
  contrato_numero: string
  contratista_nombre: string
  mes: string
  anio: number
  estado: string
  fecha: string
}

export interface PeriodoPendienteRevisor {
  id: string
  contrato_id: string
  mes: string
  anio: number
  valor_cobro: number
  estado: string
  fecha_envio: string | null
  dias_espera: number
  contratista_nombre: string
  contrato_numero: string
  dependencia_nombre: string | null
}

// ─── Admin Dashboard ──────────────────────────────────────────

export async function getAdminPipeline(): Promise<PipelineStats> {
  const supabase = createClient()

  const [
    { count: borrador },
    { count: enviado },
    { count: revision },
    { count: aprobado },
    { count: radicado },
    { count: rechazado },
    { count: totalContratos },
  ] = await Promise.all([
    supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', 'borrador').eq('es_historico', false),
    supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', 'enviado'),
    supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', 'revision'),
    supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', 'aprobado'),
    supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', 'radicado'),
    supabase.from('periodos').select('*', { count: 'exact', head: true }).eq('estado', 'rechazado'),
    supabase.from('contratos').select('*', { count: 'exact', head: true }),
  ])

  return {
    borrador: borrador ?? 0,
    enviado: enviado ?? 0,
    revision: revision ?? 0,
    aprobado: aprobado ?? 0,
    radicado: radicado ?? 0,
    rechazado: rechazado ?? 0,
    totalContratos: totalContratos ?? 0,
  }
}

export async function getActividadReciente(): Promise<ActividadReciente[]> {
  const supabase = createClient()

  // Get recent period state changes via historial_periodos
  const { data: historial } = await supabase
    .from('historial_periodos')
    .select(`
      id, estado_nuevo, created_at,
      periodo:periodos(
        id, contrato_id, mes, anio, estado,
        contrato:contratos(
          numero,
          contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)
        )
      )
    `)
    .in('estado_nuevo', ['enviado', 'aprobado', 'rechazado', 'radicado'])
    .order('created_at', { ascending: false })
    .limit(8)

  return ((historial ?? []) as any[])
    .filter(h => h.periodo?.contrato)
    .map(h => {
      const p = h.periodo
      const c = p.contrato
      return {
        id: h.id,
        tipo: h.estado_nuevo,
        periodo_id: p.id,
        contrato_id: p.contrato_id,
        contrato_numero: c.numero,
        contratista_nombre: c.contratista?.nombre_completo ?? '',
        mes: p.mes,
        anio: p.anio,
        estado: p.estado,
        fecha: h.created_at,
      }
    })
}

// ─── Reviewer Dashboard (asesor/gobierno/hacienda) ───────────

export async function getPendientesRevisor(
  estadoFiltro: string
): Promise<PeriodoPendienteRevisor[]> {
  const supabase = createClient()
  const now = Date.now()

  const { data } = await supabase
    .from('periodos')
    .select(`
      id, contrato_id, mes, anio, valor_cobro, estado, fecha_envio,
      contrato:contratos(
        numero,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo),
        dependencia:dependencias(nombre)
      )
    `)
    .eq('estado', estadoFiltro)
    .order('fecha_envio', { ascending: true })
    .limit(20)

  return ((data ?? []) as any[]).map(p => ({
    id: p.id,
    contrato_id: p.contrato_id,
    mes: p.mes,
    anio: p.anio,
    valor_cobro: p.valor_cobro,
    estado: p.estado,
    fecha_envio: p.fecha_envio,
    dias_espera: p.fecha_envio
      ? Math.floor((now - new Date(p.fecha_envio).getTime()) / 86_400_000)
      : 0,
    contratista_nombre: p.contrato?.contratista?.nombre_completo ?? '',
    contrato_numero: p.contrato?.numero ?? '',
    dependencia_nombre: p.contrato?.dependencia?.nombre ?? null,
  }))
}
