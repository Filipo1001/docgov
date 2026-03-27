/**
 * Service: Notificaciones
 *
 * Queries for user notifications (browser client).
 */

import { createClient } from '@/lib/supabase'
import type { Notificacion } from '@/lib/types'

/**
 * Get all notifications for a user, ordered by newest first.
 */
export async function getNotificaciones(userId: string): Promise<Notificacion[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('notificaciones')
    .select(`
      *,
      periodo:periodos(id, mes, anio, contrato_id, contrato:contratos(id, numero))
    `)
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  return (data as Notificacion[]) ?? []
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
