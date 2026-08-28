import { createBrowserClient } from '@supabase/ssr'
import { env } from './env'

/**
 * Singleton del browser client.
 *
 * Antes, cada `createClient()` construía un cliente nuevo, y con él un
 * GoTrueClient nuevo. Con 50+ call sites, un F5 (o varias pestañas abiertas)
 * disparaba decenas de instancias compitiendo por el mismo lock de auth del
 * Navigator LockManager. Cuando una adquisición de lock no resolvía, TODAS las
 * queries que dependen de auth quedaban colgadas para siempre — la página se
 * quedaba en blanco / en skeleton sin error (clásico "Multiple GoTrueClient
 * instances detected in the same browser context").
 *
 * Con un único cliente por contexto del navegador no hay contención: el
 * GoTrueClient es uno solo y el lock siempre se libera.
 */
let browserClient: ReturnType<typeof createBrowserClient> | undefined

/**
 * iOS Safari (y otros navegadores móviles) CONGELAN la página al pasar a
 * segundo plano: los fetch en vuelo quedan suspendidos para siempre — nunca
 * resuelven ni rechazan. Si uno de esos fetch era del endpoint de auth, muere
 * DENTRO del Navigator Lock que serializa todas las operaciones de auth, el
 * lock jamás se libera y, al volver a primer plano, cada llamada que toca auth
 * (getSession, cualquier query, signOut) se cuelga en silencio.
 *
 * Este fetch aplica un timeout SOLO a /auth/v1/: al reanudar la página los
 * timers pendientes disparan, el AbortController corta el fetch zombi, el lock
 * se libera y el cliente se recupera solo. Storage y PostgREST no se tocan —
 * una subida de foto lenta en red rural es legítima y no debe abortarse.
 */
const AUTH_TIMEOUT_MS = 15_000

/**
 * Las LECTURAS de datos también necesitan un tope, por el mismo congelamiento.
 *
 * El dashboard pide sus datos con este cliente. Cuando uno de esos fetch queda
 * suspendido —pestaña que volvió de segundo plano, red que se cayó a mitad—
 * la promesa no resuelve ni rechaza nunca, TanStack Query se queda en
 * `isLoading` para siempre y la pantalla muestra el esqueleto de forma
 * indefinida. Sin error, sin reintento, sin nada que el usuario pueda hacer
 * salvo recargar: es el «se demora una eternidad» que se reportó.
 *
 * 20 s es holgado para cualquier consulta legítima —las del dashboard tardan
 * decenas de milisegundos— y convierte el cuelgue infinito en un error normal,
 * que el reintento de TanStack y la pantalla de error sí saben tratar.
 *
 * SOLO lecturas. Las escrituras no se abortan: un POST cortado a mitad deja al
 * usuario sin saber si su informe se envió, que es peor que esperar. Y Storage
 * queda fuera por completo — una subida lenta en red rural es legítima.
 */
const LECTURA_TIMEOUT_MS = 20_000

/**
 * El agujero que dejaba el dashboard "vacío" al volver de segundo plano:
 *
 * supabase-js resuelve el token por petición con getSession(); si esa
 * resolución falla (fetch de refresh congelado por iOS, radio del celular
 * aún dormida), NO lanza error — cae en silencio al token ANÓNIMO. Con RLS,
 * una lectura anónima no es un 401: es un 200 con CERO FILAS. TanStack la
 * cachea como éxito, y el usuario ve "no tienes contrato" hasta el próximo
 * refetch que nadie dispara.
 *
 * Regla: si hay cookie de sesión, ninguna lectura sale como anónima.
 *
 * El token se lee DIRECTO DE LA COOKIE, nunca con getSession(). Esa es la
 * diferencia que importa: getSession() serializa sobre el Navigator Lock de
 * auth —el mismo que la cabecera de este archivo documenta como causa de
 * páginas en blanco— y el websocket de realtime lo disputa sin tregua cuando
 * reconecta con un JWT vencido. Meter ese lock dentro de CADA lectura de
 * datos convertía una contención de auth en un dashboard congelado. Leer la
 * cookie es síncrono, sin lock y sin red: no puede colgar nada.
 */
type TokenDeCookie = { token: string | null; vencido: boolean }

function leerSesionDeCookie(): TokenDeCookie {
  const vacio: TokenDeCookie = { token: null, vencido: false }
  try {
    // Las cookies de @supabase/ssr se parten en .0/.1 cuando no caben.
    const trozos: { nombre: string; valor: string }[] = []
    for (const crudo of document.cookie.split(';')) {
      const i = crudo.indexOf('=')
      if (i < 0) continue
      const nombre = crudo.slice(0, i).trim()
      if (!nombre.startsWith('sb-') || !nombre.includes('-auth-token')) continue
      trozos.push({ nombre, valor: crudo.slice(i + 1).trim() })
    }
    if (!trozos.length) return vacio

    trozos.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }))
    let json = trozos.map(t => decodeURIComponent(t.valor)).join('')
    if (json.startsWith('base64-')) {
      // base64url sin relleno → base64 con relleno: atob del navegador es
      // más estricto que el de Node con ciertas longitudes.
      let b64 = json.slice(7).replace(/-/g, '+').replace(/_/g, '/')
      if (b64.length % 4) b64 += '='.repeat(4 - (b64.length % 4))
      json = new TextDecoder().decode(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)))
    }

    const sesion = JSON.parse(json)
    const token = sesion?.access_token
    if (typeof token !== 'string' || !token) return vacio
    const expira = typeof sesion?.expires_at === 'number' ? sesion.expires_at : null
    return { token, vencido: expira !== null && expira <= Math.floor(Date.now() / 1000) }
  } catch {
    // Cookie ilegible (formato nuevo, cifrada, storage bloqueado): no
    // inventamos nada — la petición sigue su curso como antes.
    return vacio
  }
}

function fetchConTimeoutAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  const esAuth = url.includes('/auth/v1/')
  const metodo = (init?.method ?? 'GET').toUpperCase()
  const esLecturaDeDatos = url.includes('/rest/v1/') && (metodo === 'GET' || metodo === 'HEAD')

  if (!esAuth && !esLecturaDeDatos) return fetch(input, init)

  // Un intento con timeout: convierte el cuelgue infinito en error normal.
  const ejecutar = (initFinal?: RequestInit): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(new DOMException(
        esAuth ? 'auth fetch timeout' : 'lectura de datos sin respuesta', 'TimeoutError')),
      esAuth ? AUTH_TIMEOUT_MS : LECTURA_TIMEOUT_MS,
    )
    // Encadenar una señal externa si venía en el init original
    if (initFinal?.signal) {
      const externa = initFinal.signal
      if (externa.aborted) controller.abort(externa.reason)
      else externa.addEventListener('abort', () => controller.abort(externa.reason), { once: true })
    }
    return fetch(input, { ...initFinal, signal: controller.signal }).finally(() => clearTimeout(timer))
  }

  if (esAuth || typeof window === 'undefined') return ejecutar(init)

  // ── Guardia de identidad para lecturas de datos (solo navegador) ──
  // Todo lo de aquí es síncrono salvo el propio fetch: sin getSession, sin
  // lock de auth, sin red extra. No puede colgar una lectura.
  const headers = new Headers(init?.headers)
  const bearer = headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null
  const conToken = (token: string): RequestInit => {
    headers.set('Authorization', `Bearer ${token}`)
    return { ...init, headers }
  }

  if (bearer !== env.supabaseAnonKey) return ejecutar(init)

  // Sale con la llave anónima: o el usuario no tiene sesión, o supabase-js no
  // pudo resolver su token. La cookie desempata.
  const { token, vencido } = leerSesionDeCookie()

  // Sin cookie legible: usuario anónimo de verdad (o cookie que no sabemos
  // leer). Comportamiento de siempre.
  if (!token) return ejecutar(init)

  // Hay sesión y el token sirve: la lectura JAMÁS sale anónima.
  if (!vencido) return ejecutar(conToken(token))

  // Hay sesión pero el token venció y nadie lo ha renovado todavía. Fallar es
  // lo honesto: TanStack conserva lo anterior, muestra el error y reintenta;
  // mientras, la reconciliación del servidor renueva la cookie y el reintento
  // entra con token bueno. Devolver el vacío anónimo sería mentir.
  return Promise.reject(new Error(
    'sesión vencida al reanudar — lectura bloqueada para no mostrar datos vacíos',
  ))
}

export function createClient() {
  // En el servidor (SSR de client components) nunca memoizamos: un cliente
  // compartido filtraría estado de auth entre peticiones. El singleton es
  // exclusivo del navegador.
  const opciones = {
    global: { fetch: fetchConTimeoutAuth },
    auth: {
      // El refresco de tokens es responsabilidad del middleware (servidor):
      // ocurre de forma atómica durante requests reales, con el usuario activo.
      // El ticker del cliente refrescaba en segundo plano y iOS lo congelaba a
      // mitad de vuelo: el refresh token quedaba consumido en el servidor pero
      // nunca persistido en la cookie → al volver, "Invalid Refresh Token" →
      // sesión revocada y logout forzoso. Sin ticker, ese incendio no ocurre.
      // (El refresh perezoso al detectar un token vencido sigue existiendo
      // dentro de auth-js como respaldo — eso no se puede ni se debe apagar.)
      autoRefreshToken: false,
    },
  }
  if (typeof window === 'undefined') {
    return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey, opciones)
  }
  if (!browserClient) {
    browserClient = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey, opciones)
  }
  return browserClient
}
