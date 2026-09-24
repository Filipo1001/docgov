'use server'

/**
 * Previsualización del correo masivo del administrador.
 *
 * El envío NO vive aquí: 118 correos a 550 ms son más de un minuto, y una
 * server action no declara duración máxima. Va en una ruta con su
 * `maxDuration` — ver app/api/admin/correo-masivo/route.ts.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolverDestinatarios } from '@/lib/destinatarios-masivo'
import { CANDADO_DESTINO, type FiltroMasivo, type Previsualizacion } from '@/lib/correo-masivo'

export async function previsualizarDestinatarios(
  filtro: FiltroMasivo,
): Promise<{ data?: Previsualizacion; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'Sesión expirada' }

    const { data: yo } = await supabase
      .from('usuarios').select('rol').eq('id', session.user.id).single()
    if (yo?.rol !== 'admin') return { error: 'No autorizado' }

    const { destinatarios, excluidos } = await resolverDestinatarios(filtro)
    return { data: { destinatarios, excluidos, candado: CANDADO_DESTINO } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
