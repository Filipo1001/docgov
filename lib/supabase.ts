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

export function createClient() {
  // En el servidor (SSR de client components) nunca memoizamos: un cliente
  // compartido filtraría estado de auth entre peticiones. El singleton es
  // exclusivo del navegador.
  if (typeof window === 'undefined') {
    return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey)
  }
  if (!browserClient) {
    browserClient = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey)
  }
  return browserClient
}
