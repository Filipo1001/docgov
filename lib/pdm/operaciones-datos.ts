import 'server-only'
import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { operacionDeFila, type OperacionPdm } from './operaciones'

/**
 * Las operaciones recientes del administrador (repartos, grupos, accesos y sus reversiones), con su estado: se puede
 * deshacer, está bloqueada o ya se deshizo. La lee `pdm_operaciones` (migración 067), que solo contesta al administrador.
 *
 * Si la lectura falla devuelve `ok: false`: la pantalla lo dice y no se cae. `cache` de React: una lectura por petición.
 */
export const LIMITE_OPERACIONES = 60

export type LecturaOperaciones = { ok: true; operaciones: OperacionPdm[] } | { ok: false }

export const cargarOperaciones = cache(async (): Promise<LecturaOperaciones> => {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.rpc('pdm_operaciones', { p_limite: LIMITE_OPERACIONES })
    if (error) {
      console.error('[pdm/operaciones] pdm_operaciones:', error.message)
      return { ok: false }
    }
    const filas = (Array.isArray(data) ? data : []) as unknown[]
    return { ok: true, operaciones: filas.map(operacionDeFila).filter((o): o is OperacionPdm => o !== null) }
  } catch (err) {
    console.error('[pdm/operaciones] cargarOperaciones:', err)
    return { ok: false }
  }
})
