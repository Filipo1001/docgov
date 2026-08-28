'use server'

/**
 * Server Actions: datos de los paneles de inicio (/dashboard).
 *
 * Por qué existen: el panel era la ÚNICA pantalla que pedía sus datos con el
 * cliente de Supabase del NAVEGADOR (via TanStack Query). Tras reanudar una
 * pestaña congelada, la capa de auth de ese cliente puede quedar colgada —
 * una promesa interna que nunca se asienta— y con ella toda lectura: el panel
 * se dibujaba como esqueleto para siempre, sin emitir una sola petición.
 * Mientras tanto /dashboard/contratos, que pide por server action, cargaba
 * perfecto en el mismo estado. Este archivo mueve el panel a ese patrón: la
 * petición viaja por HTTP al servidor de Next (pasando por el middleware, que
 * renueva la cookie), y la capa de auth del navegador deja de estar en la
 * ruta crítica.
 *
 * La identidad se deriva SIEMPRE de la sesión, nunca de parámetros del
 * cliente — mismo principio que app/actions/contratos-lista.ts.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getDashboardContratista, type DashboardContratista } from '@/services/contratista'
import { getSupervisorDashboard, type SupervisorDashboard } from '@/services/supervisor'
import {
  getAdminPipeline,
  getActividadReciente,
  getAsesorStats,
  getPendientesRevisor,
  type PipelineStats,
  type ActividadReciente,
  type AsesorStats,
  type PeriodoPendienteRevisor,
} from '@/services/dashboard'

/** Sesión verificada en servidor; lanza si no la hay (la pantalla muestra
 *  su estado de error con reintento y la reconciliación decide el resto). */
async function usuarioDeSesion() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión no disponible')
  return { supabase, userId: user.id }
}

export async function getPanelContratista(): Promise<DashboardContratista> {
  const { supabase, userId } = await usuarioDeSesion()
  return getDashboardContratista(userId, supabase)
}

export async function getPanelSupervisor(): Promise<SupervisorDashboard> {
  const { supabase, userId } = await usuarioDeSesion()
  return getSupervisorDashboard(userId, supabase)
}

export async function getPanelAdmin(): Promise<{
  pipeline: PipelineStats
  actividad: ActividadReciente[]
}> {
  const { supabase } = await usuarioDeSesion()
  const [pipeline, actividad] = await Promise.all([
    getAdminPipeline(supabase),
    getActividadReciente(supabase),
  ])
  return { pipeline, actividad }
}

export async function getPanelReviewer(
  mes: string,
  anio: number,
): Promise<{ stats: AsesorStats | null; pendientes: PeriodoPendienteRevisor[] }> {
  const { supabase, userId } = await usuarioDeSesion()
  // La dependencia sale de la sesión, no del cliente. Sin dependencia
  // (gobierno/hacienda) no hay stats — mismo contrato que tenía la pantalla.
  const { data: yo, error } = await supabase
    .from('usuarios')
    .select('dependencia_id')
    .eq('id', userId)
    .single()
  if (error) throw error
  const [stats, pendientes] = await Promise.all([
    yo?.dependencia_id ? getAsesorStats(yo.dependencia_id, mes, anio, supabase) : Promise.resolve(null),
    getPendientesRevisor('enviado', supabase),
  ])
  return { stats, pendientes }
}
