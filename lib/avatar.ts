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
 * ── Por qué ya no se pide un tamaño ──────────────────────────────────────
 *
 * Esta función emitía `?px=160` y la ruta le pedía a Supabase la miniatura.
 * Las transformaciones se facturan POR IMAGEN DISTINTA transformada en el
 * periodo —no por petición—, así que la caché del navegador no bajaba el
 * contador: bastaba con que alguien abriera cada foto una vez al mes para
 * gastar las 93. Con 100 incluidas en el plan Pro, los avatares solos se
 * comían el cupo y dejaban fuera a las evidencias, que ya habían pasado por
 * esto mismo (ver UMBRAL_MINIATURA_BYTES en `lib/storage-firmado.ts`).
 *
 * No hacía falta: `comprimirFoto` deja la foto en 400×400 WebP —unos 12 KB
 * medidos sobre las 75 que entraron por ese camino— antes de subirla. Pedir
 * una miniatura de eso es comprimir lo ya comprimido. Se sirve el objeto tal
 * cual y el navegador lo escala; a 400 px de lado alcanza de sobra para los
 * 192 px del avatar más grande de la aplicación, incluso en pantallas retina.
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
 * Devuelve la ruta interna que sirve el avatar.
 * Si la URL no es de un avatar de Storage (o es null), la devuelve sin tocar.
 */
export function avatarThumb(url: string | null | undefined): string | null {
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
  return `${RUTA_API}${objeto}${version ? `?v=${encodeURIComponent(version)}` : ''}`
}
