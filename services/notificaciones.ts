/**
 * Service: Notificaciones
 *
 * Queries for user notifications (browser client).
 */

import { createClient } from '@/lib/supabase'
import type { Notificacion } from '@/lib/types'

/**
 * Get all notifications for a user, ordered by newest first.
 * Throws on DB error so callers can implement circuit-breaker logic.
 */
export async function getNotificaciones(userId: string): Promise<Notificacion[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notificaciones')
    .select(`
      *,
      periodo:periodos(id, mes, anio, contrato_id, contrato:contratos(id, numero))
    `)
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data as Notificacion[]) ?? []
}

/**
 * Count total unread notifications for a user.
 * Separate from getNotificaciones so the badge is always accurate
 * even when there are more than 50 unread items.
 * Throws on DB error so callers can implement circuit-breaker logic.
 */
export async function getConteoNoLeidas(userId: string): Promise<number> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .eq('leida', false)
  if (error) throw error
  return count ?? 0
}

/**
 * Mark a single notification as read.
 */
export async function marcarLeida(notificacionId: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', notificacionId)
}

/**
 * Mark all notifications for a user as read.
 */
export async function marcarTodasLeidas(userId: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('usuario_id', userId)
    .eq('leida', false)
}
