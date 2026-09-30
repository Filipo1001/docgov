'use server'

/**
 * ¿Debe la barra lateral mostrar el botón de Plan de Desarrollo?
 *
 * La barra es un componente de cliente y `VERCEL_ENV` solo existe en el
 * servidor, así que la pregunta se hace por aquí. Responde únicamente a
 * administradores con sesión y, además, solo donde el módulo existe (ver
 * `pdmHabilitado`).
 *
 * Es una acción y no una variable pública a propósito: una variable pública se
 * fija al compilar y la decisión de «¿estamos en vista previa?» la toma el
 * servidor en cada petición, con la misma función que cierra la página. El
 * botón y la página no pueden discrepar porque leen lo mismo.
 *
 * Devuelve un booleano y nada más: no expone quién es el usuario ni por qué se
 * negó. Ante cualquier duda —sin sesión, rol distinto, error de lectura— la
 * respuesta es `false`, que es el estado seguro.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { pdmHabilitado } from '@/lib/pdm/habilitado'

export async function moduloPdmVisible(): Promise<boolean> {
  try {
    if (!pdmHabilitado()) return false

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data: yo } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    return yo?.rol === 'admin'
  } catch {
    return false
  }
}
