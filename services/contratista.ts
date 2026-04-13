/**
 * Service: Contratista Dashboard
 *
 * Rich data queries for the contratista home dashboard.
 * Uses browser Supabase client — import only in 'use client' components.
 */

import { createClient } from '@/lib/supabase'
import { MESES } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────

export interface ContratoContratista {
  id: string
  numero: string
  anio: number
  objeto: string
  valor_total: number
  valor_mensual: number
  fecha_inicio: string
  fecha_fin: string
  plazo_meses: number
  dependencia: { nombre: string; abreviatura: string } | null
  supervisor: { nombre_completo: string } | null
}

export interface PeriodoResumen {
  id: string
  contrato_id: string
  numero_periodo: number
  mes: string
  anio: number
  estado: string
  valor_cobro: number
  motivo_rechazo: string | null
  fecha_envio: string | null
  es_historico: boolean
}

export interface DashboardContratista {
  contrato: ContratoContratista | null
  periodos: PeriodoResumen[]
  periodoActual: PeriodoResumen | null
  progreso: {
    diasTranscurridos: number
    diasTotales: number
    porcentaje: number
    diasRestantes: number
    fechaFin: string
  } | null
  stats: {
    totalPeriodos: number
    aprobados: number
    pendientes: number
    rechazados: number
    porCompletar: number
  }
}

// ─── Query ────────────────────────────────────────────────────

export async function getDashboardContratista(userId: string): Promise<DashboardContratista> {
  const supabase = createClient()

  // 1. Get active contract(s) for this user
  const now = new Date().toISOString().slice(0, 10)
  const { data: contratos } = await supabase
    .from('contratos')
    .select(`
      id, numero, anio, objeto, valor_total, valor_mensual,
      fecha_inicio, fecha_fin, plazo_meses,
      dependencia:dependencias(nombre, abreviatura),
      supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo)
    `)
    .eq('contratista_id', userId)
    .order('fecha_inicio', { ascending: false })

  // Prefer active contract, else most recent
  const activo = (contratos ?? []).find(
    (c: any) => c.fecha_inicio <= now && c.fecha_fin >= now
  ) ?? (contratos ?? [])[0]

  if (!activo) {
    return {
      contrato: null,
      periodos: [],
      periodoActual: null,
      progreso: null,
      stats: { totalPeriodos: 0, aprobados: 0, pendientes: 0, rechazados: 0, porCompletar: 0 },
    }
  }

  const contrato = activo as any as ContratoContratista

  // 2. Get all periods for this contract
  const { data: periodosRaw } = await supabase
    .from('periodos')
    .select('id, contrato_id, numero_periodo, mes, anio, estado, valor_cobro, motivo_rechazo, fecha_envio, es_historico')
    .eq('contrato_id', contrato.id)
    .order('numero_periodo')

  const periodos: PeriodoResumen[] = (periodosRaw ?? []) as any[]

  // 3. Find current month's period
  const mesActual = MESES[new Date().getMonth()]
  const anioActual = new Date().getFullYear()

  const periodoActual = periodos.find(
    p => p.mes === mesActual && p.anio === anioActual
  ) ?? null

  // 4. Calculate contract progress
  let progreso: DashboardContratista['progreso'] = null
  if (contrato.fecha_inicio && contrato.fecha_fin) {
    const inicio = new Date(contrato.fecha_inicio).getTime()
    const fin = new Date(contrato.fecha_fin).getTime()
    const hoy = Date.now()
    const diasTotales = Math.round((fin - inicio) / 86_400_000)
    const diasTranscurridos = Math.max(0, Math.min(diasTotales, Math.round((hoy - inicio) / 86_400_000)))
    const porcentaje = diasTotales > 0 ? Math.round((diasTranscurridos / diasTotales) * 100) : 0

    progreso = {
      diasTranscurridos,
      diasTotales,
      porcentaje: Math.min(100, porcentaje),
      diasRestantes: Math.max(0, diasTotales - diasTranscurridos),
      fechaFin: contrato.fecha_fin,
    }
  }

  // 5. Stats
  const stats = {
    totalPeriodos: periodos.length,
    aprobados: periodos.filter(p => p.estado === 'aprobado' || p.estado === 'radicado').length,
    pendientes: periodos.filter(p => ['enviado', 'revision'].includes(p.estado)).length,
    rechazados: periodos.filter(p => p.estado === 'rechazado').length,
    porCompletar: periodos.filter(p => p.estado === 'borrador').length,
  }

  return { contrato, periodos, periodoActual, progreso, stats }
}
