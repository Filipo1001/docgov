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
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
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
 * Cambiar la contraseña propia. Va por el servidor (las cookies que renueva el middleware) y no por el cliente del
 * navegador, cuyo token puede estar vencido en las rutas estáticas: ahí el cambio fallaba sin explicación.
 */
export async function cambiarMiContrasena(nueva: string, confirmacion: string): Promise<ActionResult> {
  try {
    if (nueva.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' }
    if (nueva !== confirmacion) return { error: 'Las contraseñas no coinciden.' }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Tu sesión terminó. Vuelve a iniciar sesión.' }

    const { error } = await supabase.auth.updateUser({ password: nueva })
    if (error) {
      return {
        error: /same|different/i.test(error.message)
          ? 'La nueva contraseña tiene que ser distinta de la actual.'
          : 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
      }
    }
    return {}
  } catch {
    return { error: 'No se pudo cambiar la contraseña. Inténtalo de nuevo.' }
  }
}
