/**
 * lib/avatar.ts — De la URL guardada en la base de datos a la que se pinta.
 *
 * ── Qué cambió y por qué ─────────────────────────────────────────────────
 *
 * El bucket `avatars` era público: la foto se guardaba como una URL directa de
 * Storage y el navegador la pedía tal cual. Como la ruta es predecible
 * —`{id de usuario}/foto.jpg`—, cualquiera con ese enlace veía la cara de un
 * contratista sin haber iniciado sesión. El bucket pasó a privado y las fotos
 * se sirven por `/api/avatar/…`, que exige sesión.
 *
 * Lo que sigue guardado en `usuarios.foto_url` es la misma cadena de antes.
 * Ya no se puede abrir —ese es el punto—, pero identifica el objeto sin
 * ambigüedad, así que se reescribe aquí en vez de migrar 91 registros y todos
 * los sitios que los leen. Esta función es el único lugar que traduce: si un
 * componente pinta `foto_url` directamente, la imagen no cargará.
 *
 * El redimensionado se dejó del lado del servidor. Antes se pedía por el
 * endpoint `render/image/public/`, que ya no aplica a un bucket privado.
 *
 * ── Por qué no se firma, como el resto de buckets privados ───────────────
 *
 * `lib/storage-firmado.ts` resuelve el mismo problema con URL firmadas, pero
 * sirve documentos: uno por descarga y de vida corta. Un avatar aparece decenas
 * de veces por pantalla y en casi todas las pantallas. Como la firma cambia en
 * cada render del servidor, el navegador nunca reconocería la imagen que ya
 * tiene y volvería a bajar las 91 fotos en cada visita. Una ruta estable sí se
 * cachea. Ese módulo además es `server-only`, y esto se ejecuta en el cliente.
 */

const RUTA_API = '/api/avatar/'

/** Forma de las URL guardadas mientras el bucket fue público. */
const MARCADOR_PUBLICO = '/storage/v1/object/public/avatars/'

/**
 * Devuelve la ruta interna que sirve el avatar a `px`×`px` (cover).
 * Si la URL no es de un avatar de Storage (o es null), la devuelve sin tocar.
 * 160 px por defecto: nítido hasta 80 px de display en pantallas retina.
 *
 * `px` debe ser uno de los tamaños que acepta la ruta (80, 160, 192, 320, 640);
 * cualquier otro cae en 160 allí.
 */
export function avatarThumb(url: string | null | undefined, px = 160): string | null {
  if (!url) return null
  // Ya convertida: aplicarla dos veces anidaría la ruta sobre sí misma.
  if (url.startsWith(RUTA_API)) return url
  const [sinQuery, query] = url.split('?')
  // Una ruta cruda ya es lo que la API espera; no toda foto viene de Storage
  // (una URL externa se devuelve intacta).
  const objeto = sinQuery.includes('://')
    ? (sinQuery.includes(MARCADOR_PUBLICO)
        ? sinQuery.slice(sinQuery.indexOf(MARCADOR_PUBLICO) + MARCADOR_PUBLICO.length)
        : null)
    : sinQuery.replace(/^\/+/, '')
  if (!objeto) return url
  // Al reemplazar una foto el objeto conserva su ruta —siempre {id}/foto.ext—,
  // así que la URL no cambiaría y el navegador seguiría mostrando la anterior
  // durante la hora de caché. `v` la escribe confirmarFotoUsuario al guardar,
  // y viaja en foto_url para que la foto nueva se vea en todas las pantallas,
  // no solo en la que hizo la subida.
  const version = new URLSearchParams(query ?? '').get('v')
  return `${RUTA_API}${objeto}?px=${px}${version ? `&v=${encodeURIComponent(version)}` : ''}`
}
