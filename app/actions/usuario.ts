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
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { firmarUrl } from '@/lib/storage-firmado'
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

    // Fila propia via admin client: las columnas bancarias no tienen SELECT
    // para authenticated, pero el dueño sí debe ver sus propios datos en /perfil.
    const admin = createAdminSupabaseClient()
    const [{ data: u }, { data: m }] = await Promise.all([
      admin.from('usuarios').select('*').eq('id', user.id).single(),
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

/**
 * URL firmada de la firma manuscrita del usuario autenticado.
 * El bucket `documentos` es privado: /perfil no puede renderizar firma_url
 * directamente y pide aquí una URL temporal (6 h).
 */
export async function obtenerFirmaFirmada(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: u } = await supabase
      .from('usuarios')
      .select('firma_url')
      .eq('id', user.id)
      .single()

    if (!u?.firma_url) return null
    return firmarUrl('documentos', u.firma_url)
  } catch {
    return null
  }
}
