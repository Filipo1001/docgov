/**
 * lib/avatar.ts — Miniatura de avatar via transformación de Supabase Storage.
 *
 * El bucket `avatars` es público, así que la transformación se pide por el
 * endpoint `render/image/public/` con parámetros de redimensión. Pura
 * manipulación de string (sin secretos) → seguro en el cliente.
 *
 * Beneficio: un avatar antiguo sin comprimir (~500 KB) se sirve como una
 * miniatura de ~3-30 KB al tamaño real de display, sin re-subir nada. Supabase
 * genera la versión una vez y la cachea en su CDN.
 */

const MARCADOR_PUBLICO = '/storage/v1/object/public/avatars/'
const MARCADOR_RENDER = '/storage/v1/render/image/public/avatars/'

/**
 * Devuelve la URL del avatar redimensionado a `px`×`px` (cover).
 * Si la URL no es de un avatar de Storage (o es null), la devuelve sin tocar.
 * 160 px por defecto: nítido hasta 80 px de display en pantallas retina.
 */
export function avatarThumb(url: string | null | undefined, px = 160): string | null {
  if (!url) return null
  if (!url.includes(MARCADOR_PUBLICO)) return url
  const base = url.replace(MARCADOR_PUBLICO, MARCADOR_RENDER)
  return `${base}?width=${px}&height=${px}&resize=cover&quality=75`
}
