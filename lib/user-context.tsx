'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'
import { obtenerPerfilUsuario } from '@/app/actions/usuario'
import type { Usuario, Municipio } from '@/lib/types'

interface UserCtx {
  usuario: Usuario | null
  municipio: Municipio | null
  cargando: boolean
  sesionExpirada: boolean
}

const Ctx = createContext<UserCtx>({ usuario: null, municipio: null, cargando: true, sesionExpirada: false })

/** No reconciliar más de una vez por minuto (cambios rápidos de app en móvil). */
const RECONCILIACION_DEBOUNCE_MS = 60_000
/** Latido mientras la pestaña está visible: mantiene la cookie fresca en sesiones largas. */
const HEARTBEAT_MS = 10 * 60_000

export function UserProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [municipio, setMunicipio] = useState<Municipio | null>(null)
  const [cargando, setCargando] = useState(true)
  const [sesionExpirada, setSesionExpirada] = useState(false)
  const tuvoSesion = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    // ── Ruta A: browser client ────────────────────────────────────────────────
    // Usada en SIGNED_IN y TOKEN_REFRESHED: el token YA está en el browser,
    // así que el browser client puede hacer las queries directamente.
    // NO usada en page reload: justo después de un reload, el browser client
    // puede no tener sesión activa aunque las cookies del servidor sí existan.
    async function cargarPerfilBrowser(userId: string) {
      // Marcar tuvoSesion SINCRÓNICAMENTE antes del await, para que si load()
      // (Ruta B) completa en paralelo con null, no sobreescriba al usuario real.
      tuvoSesion.current = true
      // Columnas explícitas: las columnas bancarias (banco, tipo_cuenta,
      // numero_cuenta) no tienen SELECT para authenticated — un select('*')
      // fallaría completo. Los datos bancarios propios llegan por la Ruta B
      // (obtenerPerfilUsuario, admin client); aquí se preservan si ya estaban.
      const [{ data: u }, { data: m }] = await Promise.all([
        supabase
          .from('usuarios')
          .select('id, municipio_id, dependencia_id, nombre_completo, cedula, email, telefono, rol, activo, cargo, direccion, foto_url, rh, tipo_documento, firma_url')
          .eq('id', userId)
          .single(),
        supabase.from('municipios').select('*').single(),
      ])
      setUsuario(prev => {
        if (!u) return null
        const nuevo = u as Usuario
        // Conservar datos bancarios cargados por la Ruta B (no vienen en esta query)
        if (prev && prev.id === nuevo.id) {
          return { ...nuevo, banco: prev.banco, tipo_cuenta: prev.tipo_cuenta, numero_cuenta: prev.numero_cuenta }
        }
        return nuevo
      })
      setMunicipio((m as Municipio) ?? null)
    }

    // ── Ruta B: Server Action ─────────────────────────────────────────────────
    // Usada en el load() inicial (page reload): el middleware ya renovó la
    // httpOnly cookie antes de que el componente montara, así que el server
    // client siempre tiene auth válida independiente del browser client.
    // NO usada en SIGNED_IN: justo después de un login fresco, el server aún
    // no tiene la cookie → getUser() devolvería null → usuario queda null.
    async function cargarPerfilServer() {
      const { usuario: u, municipio: m } = await obtenerPerfilUsuario()
      // Si SIGNED_IN ya disparó en paralelo y fijó tuvoSesion=true, no
      // sobreescribir con null (evita condición de carrera en logins rápidos).
      if (u || !tuvoSesion.current) {
        if (u) tuvoSesion.current = true
        setUsuario(u)
        setMunicipio(m)
      }
    }

    // Carga inicial — siempre resuelve cargando via finally
    async function load() {
      try {
        await cargarPerfilServer()
      } catch (err) {
        console.error('[UserProvider] failed to load profile:', err)
      } finally {
        setCargando(false)
      }
    }
    load()

    // ── Reconciliación al volver de segundo plano ─────────────────────────────
    // iOS Safari congela la página al cambiar de app: los fetch en vuelo mueren
    // sin resolver, el auto-refresh no corre y el token de la cookie vence.
    // Al volver, la fuente de verdad es EL SERVIDOR: obtenerPerfilUsuario()
    // viaja por el middleware, que renueva la cookie de forma atómica. Como el
    // storage del browser client lee document.cookie en vivo, esa renovación
    // "cura" también al cliente del navegador — sin recargar, sin re-login.
    let reconciliando = false
    let ultimaReconciliacion = 0
    async function reconciliar(forzar = false, esReanudacion = true) {
      if (reconciliando) return
      if (!forzar && Date.now() - ultimaReconciliacion < RECONCILIACION_DEBOUNCE_MS) return
      reconciliando = true
      try {
        const { usuario: u, municipio: m } = await obtenerPerfilUsuario()
        ultimaReconciliacion = Date.now()
        if (u) {
          tuvoSesion.current = true
          setUsuario(u)
          setMunicipio(m)
          setSesionExpirada(false)
          // Rehidratar el websocket de realtime con el token fresco de la
          // cookie; si no, el canal de notificaciones queda con un JWT vencido.
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.access_token) supabase.realtime.setAuth(session.access_token)
          } catch { /* mejor esfuerzo — el polling de la campana cubre el resto */ }
          // La cookie quedó renovada y la red probó estar viva: es EL momento
          // de refrescar el mundo de datos. Las cachés de TanStack pueden traer
          // horas de atraso — o un vacío mentiroso cacheado como éxito si una
          // query corrió en la ventana sin token. Invalidar aquí marca todo
          // stale y refetchea lo montado, ya con auth garantizada por la
          // guardia del cliente. Solo al REANUDAR (no en el heartbeat: con la
          // pestaña activa los datos fluyen por sus propios canales).
          if (esReanudacion) {
            queryClient.invalidateQueries().catch(() => {})
          }
        } else if (tuvoSesion.current) {
          // El servidor confirma que la sesión murió de verdad (refresh token
          // revocado/vencido). Expirar honestamente — el layout redirige a
          // /login con el aviso, nunca deja la pantalla en blanco.
          setUsuario(null)
          setMunicipio(null)
          setSesionExpirada(true)
        }
      } catch {
        // Red intermitente justo al reanudar (habitual en móvil): NO tocar el
        // estado actual. El siguiente visibilitychange/heartbeat reintenta.
      } finally {
        reconciliando = false
        setCargando(false)
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') reconciliar()
    }
    // pageshow con persisted=true: Safari restauró la página desde bfcache —
    // el estado de JS puede ser de hace horas; reconciliar sin debounce.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reconciliar(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') reconciliar(false, false)
    }, HEARTBEAT_MS)

    // React to auth state changes (token refresh, sign-out, sign-in from another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, session: { user?: { id: string } } | null) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSesionExpirada(false)
        if (session?.user) {
          // Browser client: la sesión ya está en el browser en este momento
          await cargarPerfilBrowser(session.user.id)
          // Garantizar que cargando quede en false aunque load() aún no haya
          // terminado (puede ocurrir si el usuario inicia sesión muy rápido)
          setCargando(false)
        }
      } else if (event === 'SIGNED_OUT') {
        // En iOS este evento puede ser un FALSO POSITIVO: un refresh del
        // cliente que falló por un fetch congelado dispara SIGNED_OUT aunque
        // la sesión del servidor siga viva. No expulsar al usuario a ciegas:
        // reconciliar contra el servidor decide (restaura o expira).
        reconciliar(true)
      }
    })

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      clearInterval(heartbeat)
    }
    // queryClient es estable (useState en QueryProvider): el efecto no se re-ejecuta.
  }, [queryClient])

  return <Ctx.Provider value={{ usuario, municipio, cargando, sesionExpirada }}>{children}</Ctx.Provider>
}

export const useUsuario = () => useContext(Ctx)

// Re-export types for convenience
export type { Usuario, Municipio }
export type { Rol } from '@/lib/types'
