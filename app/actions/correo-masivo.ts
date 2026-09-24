'use server'

/**
 * Previsualización del correo masivo del administrador.
 *
 * El envío NO vive aquí: 118 correos a 550 ms son más de un minuto, y una
 * server action no declara duración máxima. Va en una ruta con su
 * `maxDuration` — ver app/api/admin/correo-masivo/route.ts.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import {
  CANDADO_DESTINO, DOMINIO_MARCADOR, ROLES_EQUIPO,
  type FiltroMasivo, type Previsualizacion, type Destinatario,
} from '@/lib/correo-masivo'

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

    const admin = createAdminSupabaseClient()
    let consulta = admin
      .from('usuarios')
      .select('nombre_completo, email, rol')
      .eq('activo', true)
      .order('nombre_completo')

    if (filtro === 'contratistas') consulta = consulta.eq('rol', 'contratista')
    if (filtro === 'equipo')       consulta = consulta.in('rol', [...ROLES_EQUIPO])

    const { data, error } = await consulta
    if (error) return { error: error.message }

    const filas = (data ?? []) as Destinatario[]

    // Un correo real, y uno solo por dirección: dos cuentas de la misma
    // persona —que las hay— no se traducen en dos copias del mismo aviso.
    const vistos = new Set<string>()
    const destinatarios: Destinatario[] = []
    let excluidos = 0

    for (const f of filas) {
      const email = (f.email ?? '').trim().toLowerCase()
      if (!email || !email.includes('@') || email.endsWith(DOMINIO_MARCADOR)) {
        excluidos++
        continue
      }
      if (vistos.has(email)) continue
      vistos.add(email)
      destinatarios.push({ ...f, email })
    }

    return { data: { destinatarios, excluidos, candado: CANDADO_DESTINO } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
