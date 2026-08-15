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
import type { Usuario, Municipio, Contrato } from '@/lib/types'

/**
 * Resultado de una carga de pantalla.
 *
 * `ok:false` existe para que la vista pueda distinguir «falló» de «vacío».
 * Sin esa distinción, la única respuesta posible ante un error era seguir
 * mostrando el esqueleto, que para el usuario es indistinguible de un cuelgue.
 */
export type Cargado<T> = { ok: true; datos: T } | { ok: false; error: string }

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
 * Datos de la pantalla /perfil.
 *
 * Antes los pedía el cliente del navegador. Eso ataba la pantalla al token del
 * browser, que en las rutas estáticas (/dashboard, /perfil, /configuracion,
 * /contratos) no se renueva nunca: navegar entre ellas no toca el servidor, y
 * el cliente del navegador tiene `autoRefreshToken:false` a propósito. Tras un
 * rato dentro de la app el token quedaba viejo y las consultas fallaban o se
 * colgaban — mientras la barra lateral seguía perfecta, porque ella sí carga
 * por Server Action.
 *
 * Al pasar por aquí, la petición viaja por el middleware, que renueva la cookie
 * de forma atómica. Es el mismo camino que ya usaba la barra lateral: el que
 * demostradamente se cura solo.
 */
export async function obtenerDatosPerfil(): Promise<Cargado<{
  dependencia: string | null
  contratos: Contrato[]
  supervisedCount: number | null
  asesoredCount: number | null
  creadoEn: string | null
}>> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: ERROR_SESION }

    const { data: yo } = await supabase
      .from('usuarios')
      .select('id, rol, dependencia_id')
      .eq('id', user.id)
      .single()
    if (!yo) return { ok: false, error: ERROR_SESION }

    const rol = (yo as { rol: string }).rol
    const dependenciaId = (yo as { dependencia_id: string | null }).dependencia_id

    // Mismo cliente autenticado que usaba el navegador: las reglas de acceso
    // (RLS) siguen siendo exactamente las mismas, no se amplía ningún permiso.
    const [dep, contratos, supervisados, asesorados] = await Promise.all([
      dependenciaId
        ? supabase.from('dependencias').select('nombre').eq('id', dependenciaId).single()
        : Promise.resolve({ data: null }),
      rol === 'contratista'
        ? supabase
            .from('contratos')
            .select('id, numero, objeto, valor_total, fecha_inicio, fecha_fin, banco, tipo_cuenta, numero_cuenta')
            .eq('contratista_id', user.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null }),
      rol === 'supervisor'
        ? supabase.from('contratos').select('id', { count: 'exact', head: true }).eq('supervisor_id', user.id)
        : Promise.resolve({ count: null }),
      rol === 'asesor'
        ? supabase.from('preaprobaciones').select('id', { count: 'exact', head: true }).eq('asesor_id', user.id)
        : Promise.resolve({ count: null }),
    ])

    return {
      ok: true,
      datos: {
        dependencia: (dep.data as { nombre?: string } | null)?.nombre ?? null,
        contratos: ((contratos.data as Contrato[] | null) ?? []),
        supervisedCount: (supervisados as { count: number | null }).count,
        asesoredCount: (asesorados as { count: number | null }).count,
        creadoEn: user.created_at ?? null,
      },
    }
  } catch {
    return { ok: false, error: ERROR_GENERICO }
  }
}

/**
 * Datos de la pantalla /configuracion. Mismo motivo y mismo camino que
 * `obtenerDatosPerfil` — ver la explicación de arriba.
 */
export async function obtenerDatosConfiguracion(): Promise<Cargado<{
  preferencias: { canal: string; habilitado: boolean }[]
  dependencia: string | null
  contratos: number | null
  creadoEn: string | null
  telefono: string
}>> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: ERROR_SESION }

    const { data: yo } = await supabase
      .from('usuarios')
      .select('id, rol, dependencia_id, telefono')
      .eq('id', user.id)
      .single()
    if (!yo) return { ok: false, error: ERROR_SESION }

    const rol = (yo as { rol: string }).rol
    const dependenciaId = (yo as { dependencia_id: string | null }).dependencia_id
    const telefono = (yo as { telefono: string | null }).telefono ?? ''

    const [prefs, dep, contratos] = await Promise.all([
      supabase.from('preferencias_notificacion').select('canal, habilitado').eq('usuario_id', user.id),
      dependenciaId
        ? supabase.from('dependencias').select('nombre').eq('id', dependenciaId).single()
        : Promise.resolve({ data: null }),
      rol === 'contratista'
        ? supabase.from('contratos').select('id', { count: 'exact', head: true }).eq('contratista_id', user.id)
        : Promise.resolve({ count: null }),
    ])

    return {
      ok: true,
      datos: {
        preferencias: ((prefs.data as { canal: string; habilitado: boolean }[] | null) ?? []),
        dependencia: (dep.data as { nombre?: string } | null)?.nombre ?? null,
        contratos: (contratos as { count: number | null }).count,
        creadoEn: user.created_at ?? null,
        telefono,
      },
    }
  } catch {
    return { ok: false, error: ERROR_GENERICO }
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

/** Guardar el teléfono propio. Mismo motivo que la preferencia de arriba. */
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
