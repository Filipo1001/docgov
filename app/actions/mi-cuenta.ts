'use server'

/**
 * Server Actions de «Mi cuenta» (/dashboard/cuenta): lo que cada persona puede hacer con su propia cuenta.
 *
 * Felipe (31-oct-2026): Perfil y Configuración se funden en una sola sección, sin opciones que aparenten funcionar
 * y no funcionen, y el contratista puede cambiar su foto. Aquí van las tres acciones nuevas; el teléfono y la
 * preferencia de correo siguen en app/actions/usuario.ts.
 *
 * La regla 2 de CLAUDE.md se mantiene: una sesión de usuario solo puede actualizar `usuarios.telefono`. La foto la
 * escribe el cliente de servicio, DESPUÉS de comprobar que la sesión es la dueña de la cuenta y que el archivo está en
 * su propia carpeta del espacio `avatars`. Nunca se acepta un id de usuario del navegador.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { passwordInicialDesdeCedula } from '@/lib/password-inicial'
import { MARCA_CLAVE_INICIAL, debeCambiarClave, validarClaveNueva } from '@/lib/clave-inicial'
import type { ActionResult } from '@/lib/types'

const FOTO_PERMITIDA = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const FOTO_MAX_BYTES = 5 * 1024 * 1024

async function usuarioDeLaSesion(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/**
 * Paso 1 de la foto: valida el archivo y devuelve una URL firmada para subirlo directo al espacio `avatars`, a la
 * carpeta de quien está en sesión (el mismo camino que usa la administración: el archivo no pasa por Vercel).
 */
export async function prepararMiFoto(
  nombreArchivo: string,
  bytes: number,
  tipo: string,
): Promise<ActionResult<{ urlSubida: string; urlPublica: string }>> {
  try {
    const id = await usuarioDeLaSesion()
    if (!id) return { error: 'Tu sesión terminó. Vuelve a iniciar sesión.' }

    const mime = tipo?.toLowerCase() || ''
    if (!FOTO_PERMITIDA.includes(mime)) return { error: 'La foto debe ser JPG, PNG, WEBP o HEIC.' }
    if (bytes > FOTO_MAX_BYTES) return { error: 'La foto no puede pasar de 5 MB.' }

    const ext = nombreArchivo.split('.').pop()?.toLowerCase() || mime.split('/')[1].replace('jpeg', 'jpg')
    if (!/^[a-z0-9]{2,5}$/.test(ext)) return { error: 'El nombre del archivo no es válido.' }
    const ruta = `${id}/foto.${ext}`

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.storage.from('avatars').createSignedUploadUrl(ruta, { upsert: true })
    if (error || !data) return { error: 'No se pudo preparar la subida. Inténtalo de nuevo.' }

    // Como en la administración (app/actions/admin.ts): se guarda la forma «pública» de la URL porque identifica el
    // objeto; quien la pinta la pasa por avatarThumb(), que la sirve por /api/avatar.
    const { data: { publicUrl } } = admin.storage.from('avatars').getPublicUrl(ruta)
    return { data: { urlSubida: data.signedUrl, urlPublica: publicUrl } }
  } catch {
    return { error: 'No se pudo preparar la subida. Inténtalo de nuevo.' }
  }
}

/**
 * Paso 2 de la foto: cuando el archivo ya subió, se guarda en la cuenta. Solo se acepta una URL de la carpeta propia
 * (`avatars/<id>/foto.<ext>`): sin esa comprobación, alguien podría poner como foto un archivo ajeno.
 */
export async function confirmarMiFoto(urlPublica: string): Promise<ActionResult<{ url: string }>> {
  try {
    const id = await usuarioDeLaSesion()
    if (!id) return { error: 'Tu sesión terminó. Vuelve a iniciar sesión.' }

    const limpia = urlPublica.split('?')[0]
    if (!new RegExp(`/storage/v1/object/public/avatars/${id}/foto\\.[a-z0-9]{2,5}$`).test(limpia)) {
      return { error: 'La foto no corresponde a tu cuenta.' }
    }

    // La ruta del objeto no cambia al reemplazar la foto: la versión en la URL evita que la caché muestre la anterior.
    const url = `${limpia}?v=${Date.now()}`
    const { error } = await createAdminSupabaseClient().from('usuarios').update({ foto_url: url }).eq('id', id)
    if (error) return { error: 'No se pudo guardar la foto. Inténtalo de nuevo.' }

    revalidatePath('/dashboard', 'layout')
    return { data: { url } }
  } catch {
    return { error: 'No se pudo guardar la foto. Inténtalo de nuevo.' }
  }
}

/**
 * Quita la marca de «debe cambiar su contraseña» y renueva la sesión para que el token ya no la lleve (si no, el
 * middleware seguiría mandando a la persona a /cambiar-clave hasta que el token se renovara solo, dentro de una hora).
 */
async function quitarMarcaDeClaveInicial(userId: string): Promise<void> {
  await createAdminSupabaseClient().auth.admin.updateUserById(userId, { app_metadata: { [MARCA_CLAVE_INICIAL]: false } })
  await (await createServerSupabaseClient()).auth.refreshSession()
}

/**
 * Cambiar la contraseña propia. Va por el servidor (las cookies que renueva el middleware) y no por el cliente del
 * navegador, cuyo token puede estar vencido en las rutas estáticas: ahí el cambio fallaba sin explicación.
 *
 * Si la cuenta estaba marcada con la contraseña inicial (lib/clave-inicial.ts), la marca se quita aquí.
 */
export async function cambiarMiContrasena(nueva: string, confirmacion: string): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Tu sesión terminó. Vuelve a iniciar sesión.' }

    // La cédula sale de la base, no del navegador: es contra lo que se compara la contraseña nueva.
    const { data: u } = await createAdminSupabaseClient().from('usuarios').select('cedula').eq('id', user.id).single()
    const rechazo = validarClaveNueva(nueva, confirmacion, (u?.cedula as string | null) ?? null)
    if (rechazo) return { error: rechazo }

    const { error } = await supabase.auth.updateUser({ password: nueva })
    if (error) {
      return {
        error: /same|different/i.test(error.message)
          ? 'La nueva contraseña tiene que ser distinta de la actual.'
          : 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
      }
    }

    // La contraseña ya cambió: si la marca no se pudiera quitar, la persona volvería a la pantalla de cambio sin saber
    // por qué. Se registra y se sigue; la próxima visita a /cambiar-clave lo resuelve con `liberarMarcaDeClaveInicial`.
    if (debeCambiarClave(user.app_metadata)) await quitarMarcaDeClaveInicial(user.id).catch(e => console.error('[cuenta] no se pudo quitar la marca de clave inicial:', e instanceof Error ? e.message : e))
    return {}
  } catch {
    return { error: 'No se pudo cambiar la contraseña. Inténtalo de nuevo.' }
  }
}

/**
 * Quita la marca SOLO si la contraseña ya no es la inicial. Es para quien cambió su contraseña por otro camino (el
 * enlace de «¿Olvidó su contraseña?», que establece la clave en el navegador) y volvería a /cambiar-clave sin motivo.
 *
 * No se puede confiar en que el navegador diga «ya la cambié»: cualquiera con la marca podría quitársela sin cambiar
 * nada. Por eso se comprueba de verdad: se intenta entrar con la contraseña inicial desde un cliente aparte, que no
 * guarda sesión. Si entra, la contraseña sigue siendo la inicial y la marca se queda.
 */
export async function liberarMarcaDeClaveInicial(): Promise<ActionResult<{ liberada: boolean }>> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Tu sesión terminó. Vuelve a iniciar sesión.' }
    if (!debeCambiarClave(user.app_metadata)) return { data: { liberada: true } }

    const { data: u } = await createAdminSupabaseClient().from('usuarios').select('cedula, email').eq('id', user.id).single()
    const inicial = passwordInicialDesdeCedula((u?.cedula as string | null) ?? '')
    const correo = (u?.email as string | null) ?? user.email
    if (!inicial || !correo) return { data: { liberada: false } }

    const aparte = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    )
    const { data: intento } = await aparte.auth.signInWithPassword({ email: correo, password: inicial })
    if (intento?.session) {
      await aparte.auth.signOut().catch(() => {})
      return { data: { liberada: false } }
    }

    await quitarMarcaDeClaveInicial(user.id)
    return { data: { liberada: true } }
  } catch {
    return { error: 'No se pudo verificar tu contraseña. Inténtalo de nuevo.' }
  }
}
