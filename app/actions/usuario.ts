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
import type { Usuario, Municipio } from '@/lib/types'

const ERROR_GENERICO = 'No se pudieron cargar los datos. Revisa tu conexión e inténtalo de nuevo.'
const ERROR_SESION = 'Tu sesión no está disponible. Vuelve a iniciar sesión.'

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
    // para authenticated, pero el dueño sí debe ver sus propios datos en «Mi cuenta».
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
 * Guardar una preferencia de notificación.
 *
 * Iba por el cliente del navegador y, además, sin mirar el error: la pantalla
 * daba el cambio por bueno pasara lo que pasara. Con el token viejo el guardado
 * fallaba en silencio y el interruptor quedaba encendido sobre nada.
 */
export async function guardarPreferenciaNotificacion(
  canal: string,
  habilitado: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: ERROR_SESION }

    const { error } = await supabase.from('preferencias_notificacion').upsert(
      { usuario_id: user.id, canal, habilitado, updated_at: new Date().toISOString() },
      { onConflict: 'usuario_id,canal' },
    )
    if (error) return { ok: false, error: 'No se pudo guardar la preferencia.' }
    return { ok: true }
  } catch {
    return { ok: false, error: ERROR_GENERICO }
  }
}

/** Guardar el teléfono propio (la única columna de `usuarios` que la sesión puede escribir). */
export async function guardarTelefonoUsuario(
  telefono: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: ERROR_SESION }

    const { error } = await supabase
      .from('usuarios')
      .update({ telefono: telefono.trim() || null })
      .eq('id', user.id)
    if (error) return { ok: false, error: 'No se pudo guardar el teléfono.' }
    return { ok: true }
  } catch {
    return { ok: false, error: ERROR_GENERICO }
  }
}
