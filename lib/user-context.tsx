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
  // Whether a session was ever established in this browser session
  const tuvoSesion = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    // ── cargarPerfil usa Server Action en lugar del browser client ──────────
    // El browser Supabase client puede no tener sesión activa justo después
    // de un page reload (token expirado, cookie no sincronizada, etc.).
    // El Server Action siempre usa las httpOnly cookies renovadas por el
    // middleware, garantizando que auth.uid() esté disponible en el servidor.
    async function cargarPerfil() {
      const { usuario: u, municipio: m } = await obtenerPerfilUsuario()
      if (u) tuvoSesion.current = true
      setUsuario(u)
      setMunicipio(m)
    }

    // Initial load — try/finally garantiza que setCargando(false) siempre se
    // llame, incluso si cargarPerfil() falla por red u otro error.
    async function load() {
      try {
        await cargarPerfil()
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
        // Token renovado o nueva sesión — recargar perfil vía Server Action
        setSesionExpirada(false)
        await cargarPerfil()
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
