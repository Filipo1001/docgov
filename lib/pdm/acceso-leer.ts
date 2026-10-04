import type { SupabaseClient } from '@supabase/supabase-js'
import { esNivelHabilitable, type NivelPdm } from './niveles'

/**
 * Leer el acceso de quien pregunta SIN confundir «no tienes acceso» con «no pude comprobarlo».
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * Antes, cualquier fallo al leer el acceso —una consulta lenta, un corte de red, o la sesión que se
 * renueva en paralelo (el registro de errores del despliegue trae decenas de «Invalid Refresh Token»
 * del middleware)— daba `null`, y `null` quería decir «no tienes acceso». La puerta de cada pantalla
 * respondía con un `redirect('/dashboard')`: la persona salía del módulo hacia el panel de contratos,
 * con su barra lateral de siempre, sin una palabra de explicación.
 *
 * Y justo después de reasignar un indicador es cuando más probable es: la acción revalida la ruta y el
 * servidor vuelve a pintar la pantalla entera, con todas sus consultas, en el mismo instante en que
 * la sesión puede estar renovándose. La reasignación salía bien y la pantalla desaparecía.
 *
 * ── Los cuatro resultados ────────────────────────────────────────────────
 *
 *   ok            hay sesión y acceso: se sabe qué nivel.
 *   sin_sesion    no hay sesión (ni cookie que la sostenga): al inicio de sesión.
 *   sin_acceso    hay sesión y se comprobó que NO tiene acceso al módulo: al panel.
 *   no_verificado no se pudo comprobar. NO es un «no»: la pantalla se queda donde está y ofrece reintentar.
 *
 * Un fallo se reintenta una vez, tras una pausa corta, antes de darse por «no verificado»: casi todos
 * los fallos de este tipo son un instante.
 *
 * Pura a propósito (el cliente de la base entra por parámetro): así se prueba con fallos simulados.
 */

export interface AccesoLeido {
  nivel: NivelPdm
  userId: string
  dependenciaId: string | null
}

export type LecturaAcceso =
  | { estado: 'ok'; acceso: AccesoLeido }
  | { estado: 'sin_sesion' }
  | { estado: 'sin_acceso' }
  | { estado: 'no_verificado' }

/** Una vuelta no pudo concluir: ni sí ni no. */
const REINTENTAR = Symbol('reintentar')

/** Cuánto se espera antes del segundo intento: lo bastante para un parpadeo de red, no para notarse. */
export const PAUSA_REINTENTO_MS = 300

async function unIntento(supabase: SupabaseClient): Promise<LecturaAcceso | typeof REINTENTAR> {
  try {
    const { data, error } = await supabase.auth.getUser()
    const user = data?.user ?? null
    if (!user) {
      // «Sin sesión» es que no hay nada con qué iniciarla. Cualquier otro error (la red, un token que no se
      // pudo renovar a tiempo) es «no se pudo comprobar»: no se le dice a nadie que no tiene sesión.
      if (!error || error.name === 'AuthSessionMissingError') return { estado: 'sin_sesion' }
      return REINTENTAR
    }

    const { data: yo, error: errorUsuario } = await supabase
      .from('usuarios').select('rol, dependencia_id').eq('id', user.id).maybeSingle()
    if (errorUsuario) return REINTENTAR
    if (!yo) return { estado: 'sin_acceso' }
    const dependenciaId = (yo.dependencia_id as string | null) ?? null
    if (yo.rol === 'admin') return { estado: 'ok', acceso: { nivel: 'admin', userId: user.id, dependenciaId } }

    const { data: permiso, error: errorPermiso } = await supabase
      .from('pdm_permisos').select('nivel').eq('usuario_id', user.id).maybeSingle()
    if (errorPermiso) return REINTENTAR
    return esNivelHabilitable(permiso?.nivel)
      ? { estado: 'ok', acceso: { nivel: permiso.nivel, userId: user.id, dependenciaId } }
      : { estado: 'sin_acceso' }
  } catch {
    return REINTENTAR
  }
}

export async function leerAcceso(
  supabase: SupabaseClient,
  pausar: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<LecturaAcceso> {
  const primero = await unIntento(supabase)
  if (primero !== REINTENTAR) return primero
  await pausar(PAUSA_REINTENTO_MS)
  const segundo = await unIntento(supabase)
  return segundo === REINTENTAR ? { estado: 'no_verificado' } : segundo
}
