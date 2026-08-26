/**
 * lib/jwt-cookie.ts — Cuánta vida le queda al token de la cookie, sin red.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * `supabase.auth.getUser()` SIEMPRE hace una petición de red a `/auth/v1/user`.
 * Es su diferencia de fondo con `getSession()`, que lee local. El middleware lo
 * llamaba en cada request creyendo lo contrario —su comentario afirmaba que
 * «para un token válido el JWT se valida localmente»— y el resultado medido en
 * producción fueron **28.956 llamadas a /auth/v1/user en 24 horas** para unos
 * 130 usuarios: más validaciones de sesión que consultas de datos (ratio 1,3).
 * Cada una cuesta entre 350 y 540 ms desde Colombia.
 *
 * El middleware no está ahí para validar: está para RENOVAR la cookie cuando
 * el token está por vencer. Quien valida es el guardia de cada página y de
 * cada Server Action (`requireRole`, `getAuthContext`). Si al token todavía le
 * quedan minutos de vida, no hay nada que renovar y la llamada es puro coste.
 *
 * ── Por qué es seguro leer el `exp` sin verificar la firma ───────────────
 *
 * Aquí no se decide si alguien entra: solo si conviene gastar un viaje de red.
 * Un atacante que falsifique un `exp` lejano únicamente consigue que el
 * middleware NO refresque su cookie — y entonces su token, ese sí verificado
 * criptográficamente por PostgREST y por los guardias del servidor, lo rechaza.
 * El peor caso de confiar en este dato es perder una renovación, nunca conceder
 * un acceso.
 *
 * Ante cualquier duda —cookie ausente, troceada de forma rara, base64 inválido,
 * JSON corrupto, `exp` que no es número— se devuelve `null`, y quien llama
 * interpreta eso como «hay que preguntarle al servidor». El fallo por defecto
 * es hacer la llamada de red, no saltársela.
 */

/** Margen antes del vencimiento a partir del cual sí conviene renovar. */
export const MARGEN_RENOVACION_S = 10 * 60

/** Descodifica un segmento base64url sin depender de `Buffer` (corre en Edge). */
function base64urlADecodificado(segmento: string): string | null {
  try {
    const base64 = segmento.replace(/-/g, '+').replace(/_/g, '/')
    const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return atob(relleno)
  } catch {
    return null
  }
}

/**
 * Segundos que le quedan de vida al access token guardado en las cookies.
 *
 * `null` si no se puede saber. Supabase trocea la cookie cuando el valor es
 * grande (`...-auth-token.0`, `.1`), así que hay que reensamblarla en orden
 * antes de leerla.
 */
export function segundosRestantesDelToken(
  cookies: { name: string; value: string }[],
): number | null {
  const trozos = cookies
    .filter(c => c.name.includes('-auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))

  if (trozos.length === 0) return null

  let bruto = trozos.map(c => c.value).join('')
  if (bruto.startsWith('base64-')) {
    const decodificado = base64urlADecodificado(bruto.slice('base64-'.length))
    if (!decodificado) return null
    bruto = decodificado
  }

  let accessToken: unknown
  try {
    const sesion = JSON.parse(bruto)
    accessToken = Array.isArray(sesion) ? sesion[0] : sesion?.access_token
  } catch {
    return null
  }
  if (typeof accessToken !== 'string') return null

  const partes = accessToken.split('.')
  if (partes.length !== 3) return null

  const carga = base64urlADecodificado(partes[1])
  if (!carga) return null

  try {
    const { exp } = JSON.parse(carga) as { exp?: unknown }
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
    return exp - Math.floor(Date.now() / 1000)
  } catch {
    return null
  }
}

/**
 * ¿Hace falta pedirle al servidor que renueve la cookie?
 *
 * Solo cuando queda poco —o cuando no se pudo averiguar, que es el caso en el
 * que hay que preguntar sí o sí.
 */
export function necesitaRenovacion(cookies: { name: string; value: string }[]): boolean {
  const restantes = segundosRestantesDelToken(cookies)
  return restantes === null || restantes < MARGEN_RENOVACION_S
}
