'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
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
  // Whether a session was ever established in this browser session
  const tuvoSesion = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    async function cargarPerfil(userId: string) {
      const [{ data: u }, { data: m }] = await Promise.all([
        supabase.from('usuarios').select('*').eq('id', userId).single(),
        supabase.from('municipios').select('*').single(),
      ])
      setUsuario(u as Usuario ?? null)
      setMunicipio(m as Municipio ?? null)
    }

    // Initial load
    // try/finally guarantees setCargando(false) is always called — even if
    // cargarPerfil() throws (network error, unexpected Supabase error, etc.).
    // Without the finally, cargando stays true forever and the sidebar gets
    // stuck in skeleton state.
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          tuvoSesion.current = true
          await cargarPerfil(session.user.id)
        }
      } catch (err) {
        console.error('[UserProvider] failed to load session:', err)
      } finally {
        setCargando(false)
      }
    }
    load()

    // React to auth state changes (token refresh, sign-out, sign-in from another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          tuvoSesion.current = true
          setSesionExpirada(false)
          await cargarPerfil(session.user.id)
        }
      } else if (event === 'SIGNED_OUT') {
        setUsuario(null)
        setMunicipio(null)
        // Only flag as expired if we had an active session — not on a fresh logout
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
