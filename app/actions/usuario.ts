'use server'

/**
 * Server Action: cargar el perfil del usuario autenticado.
 *
 * Se usa desde user-context.tsx en lugar del browser Supabase client para
 * evitar la dependencia en que la sesión del browser esté activa.
 * El server client siempre usa las httpOnly cookies renovadas por el
 * middleware, así que este action funciona incluso si el browser client
 * aún no tiene la sesión cargada (por ejemplo, justo después de un reload).
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Usuario, Municipio } from '@/lib/types'

export async function obtenerPerfilUsuario(): Promise<{
  usuario: Usuario | null
  municipio: Municipio | null
}> {
  try {
    const supabase = await createServerSupabaseClient()

    // getUser() valida el JWT contra Supabase (no solo el cookie local)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { usuario: null, municipio: null }

    const [{ data: u }, { data: m }] = await Promise.all([
      supabase.from('usuarios').select('*').eq('id', user.id).single(),
      supabase.from('municipios').select('*').single(),
    ])

    return {
      usuario: (u as Usuario) ?? null,
      municipio: (m as Municipio) ?? null,
    }
  } catch {
    return { usuario: null, municipio: null }
  }
}
