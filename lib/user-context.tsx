'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
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

export function UserProvider({ children }: { children: ReactNode }) {
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
      const [{ data: u }, { data: m }] = await Promise.all([
        supabase.from('usuarios').select('*').eq('id', userId).single(),
        supabase.from('municipios').select('*').single(),
      ])
      setUsuario((u as Usuario) ?? null)
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

    // React to auth state changes (token refresh, sign-out, sign-in from another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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
        setUsuario(null)
        setMunicipio(null)
        if (tuvoSesion.current) setSesionExpirada(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return <Ctx.Provider value={{ usuario, municipio, cargando, sesionExpirada }}>{children}</Ctx.Provider>
}

export const useUsuario = () => useContext(Ctx)

// Re-export types for convenience
export type { Usuario, Municipio }
export type { Rol } from '@/lib/types'
