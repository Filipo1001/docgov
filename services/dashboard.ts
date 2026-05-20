/**
 * Service: Admin & Reviewer Dashboard
 *
 * Queries for admin pipeline stats, recent activity,
 * and reviewer pending lists.
 * Uses browser Supabase client — import only in 'use client' components.
 */

import { createClient } from '@/lib/supabase'
import { getMesActual } from '@/lib/constants'

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
  const { mes, anio } = getMesActual()

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
    .eq('mes', mes)
    .eq('anio', anio)
    .eq('es_historico', false)
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

// ─── Asesor Dashboard Stats ───────────────────────────────────

export interface ContadorDestinatarios {
  total: number
  conEmail: number   // non-placeholder (@pendiente.local excluded)
}

export interface AsesorStats {
  totalContratos: number
  sinEnviar: number      // no periodo or borrador (needs action from contratista)
  enMesa: number         // estado: 'enviado' — waiting for asesor review
  conSecretaria: number  // estado: 'revision' — asesor approved, with secretaría
  aprobados: number      // estado: 'aprobado' | 'radicado'
  rechazados: number     // estado: 'rechazado'
  // Recipient counts per email filter (no emails exposed to client)
  correoCounts: {
    sin_enviar: ContadorDestinatarios
    enviaron: ContadorDestinatarios
    rechazados_filtro: ContadorDestinatarios
    todos: ContadorDestinatarios
  }
}

export async function getAsesorStats(
  dependenciaId: string,
  mes: string,
  anio: number,
): Promise<AsesorStats> {
  const supabase = createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const empty: AsesorStats = {
    totalContratos: 0, sinEnviar: 0, enMesa: 0, conSecretaria: 0, aprobados: 0, rechazados: 0,
    correoCounts: {
      sin_enviar:       { total: 0, conEmail: 0 },
      enviaron:         { total: 0, conEmail: 0 },
      rechazados_filtro:{ total: 0, conEmail: 0 },
      todos:            { total: 0, conEmail: 0 },
    },
  }

  // 1. Active contracts in this dependencia with contractor email
  const { data: contratos } = await supabase
    .from('contratos')
    .select('id, contratista:usuarios!contratos_contratista_id_fkey(email)')
    .eq('dependencia_id', dependenciaId)
    .gte('fecha_fin', hoy)

  const contratoList = (contratos ?? []) as unknown as Array<{ id: string; contratista: { email: string } | null }>
  const contratoIds = contratoList.map(c => c.id)
  const totalContratos = contratoIds.length
  if (totalContratos === 0) return empty

  // 2. Periods for this month
  const { data: periodos } = await supabase
    .from('periodos')
    .select('contrato_id, estado')
    .in('contrato_id', contratoIds)
    .eq('mes', mes)
    .eq('anio', anio)
    .eq('es_historico', false)

  const periodoList = (periodos ?? []) as Array<{ contrato_id: string; estado: string }>
  const estadoPorContrato = new Map(periodoList.map(p => [p.contrato_id, p.estado]))

  // 3. Pipeline counts
  const enMesa       = periodoList.filter(p => p.estado === 'enviado').length
  const conSecretaria= periodoList.filter(p => p.estado === 'revision').length
  const aprobados    = periodoList.filter(p => ['aprobado', 'radicado'].includes(p.estado)).length
  const rechazados   = periodoList.filter(p => p.estado === 'rechazado').length
  const sinEnviar    = totalContratos - enMesa - conSecretaria - aprobados - rechazados

  // 4. Email counts per filter (no emails leave server — just counts)
  const hasRealEmail = (email?: string | null) => !!email && !email.includes('@pendiente.local')

  const counts = {
    sin_enviar:       { total: 0, conEmail: 0 },
    enviaron:         { total: 0, conEmail: 0 },
    rechazados_filtro:{ total: 0, conEmail: 0 },
    todos:            { total: 0, conEmail: 0 },
  }

  for (const c of contratoList) {
    const email = c.contratista?.email
    const estado = estadoPorContrato.get(c.id)
    const real = hasRealEmail(email)

    counts.todos.total++
    if (real) counts.todos.conEmail++

    if (!estado || estado === 'borrador') {
      counts.sin_enviar.total++
      if (real) counts.sin_enviar.conEmail++
    } else if (estado === 'enviado') {
      counts.enviaron.total++
      if (real) counts.enviaron.conEmail++
    } else if (estado === 'rechazado') {
      counts.rechazados_filtro.total++
      if (real) counts.rechazados_filtro.conEmail++
    }
  }

  return { totalContratos, sinEnviar, enMesa, conSecretaria, aprobados, rechazados, correoCounts: counts }
}
