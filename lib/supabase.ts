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

function fetchConTimeoutAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  const esAuth = url.includes('/auth/v1/')
  const metodo = (init?.method ?? 'GET').toUpperCase()
  const esLecturaDeDatos = url.includes('/rest/v1/') && (metodo === 'GET' || metodo === 'HEAD')

  if (!esAuth && !esLecturaDeDatos) return fetch(input, init)

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException(
      esAuth ? 'auth fetch timeout' : 'lectura de datos sin respuesta', 'TimeoutError')),
    esAuth ? AUTH_TIMEOUT_MS : LECTURA_TIMEOUT_MS,
  )
  // Encadenar una señal externa si venía en el init original
  if (init?.signal) {
    const externa = init.signal
    if (externa.aborted) controller.abort(externa.reason)
    else externa.addEventListener('abort', () => controller.abort(externa.reason), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
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
