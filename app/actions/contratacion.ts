'use server'

/**
 * Server Actions del rol Contratación.
 *
 * Lecturas del home del rol via admin client tras verificación de rol por
 * cookies httpOnly — mismo patrón de confianza que el resto de actions
 * (getAvanzadoData, getTodosContratosConBanco).
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export interface ContratacionStats {
  contratosActivos: number
  contratosPorVencer60: number
  importadosPendientes: number
  contratistasSinFirma: number
  /** Contratos que vencen en ≤60 días, para la lista del home */
  proximosVencer: { id: string; numero: string; fecha_fin: string; contratista: string }[]
}

export async function getContratacionStats(): Promise<{ data?: ContratacionStats; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada' }

    const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
    if (!yo || !['admin', 'contratacion'].includes(yo.rol)) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    const hoy = new Date().toISOString().slice(0, 10)
    const en60 = new Date(Date.now() + 60 * 24 * 3600_000).toISOString().slice(0, 10)

    const [activos, porVencer, importados, sinFirma] = await Promise.all([
      admin.from('contratos').select('id', { count: 'exact', head: true }).gte('fecha_fin', hoy),
      admin
        .from('contratos')
        .select('id, numero, fecha_fin, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)')
        .gte('fecha_fin', hoy)
        .lte('fecha_fin', en60)
        .order('fecha_fin'),
      admin.from('contratistas_importados').select('id', { count: 'exact', head: true }),
      admin.from('usuarios').select('id', { count: 'exact', head: true }).eq('rol', 'contratista').is('firma_url', null),
    ])

    type PorVencer = { id: string; numero: string; fecha_fin: string; contratista: { nombre_completo: string } | null }
    const lista = ((porVencer.data ?? []) as unknown as PorVencer[]).map(c => ({
      id: c.id,
      numero: c.numero,
      fecha_fin: c.fecha_fin,
      contratista: c.contratista?.nombre_completo ?? '—',
    }))

    return {
      data: {
        contratosActivos: activos.count ?? 0,
        contratosPorVencer60: lista.length,
        importadosPendientes: importados.count ?? 0,
        contratistasSinFirma: sinFirma.count ?? 0,
        proximosVencer: lista,
      },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
