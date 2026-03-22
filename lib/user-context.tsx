'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import type { Usuario, Municipio } from '@/lib/types'

interface UserCtx {
  usuario: Usuario | null
  municipio: Municipio | null
  cargando: boolean
}

const Ctx = createContext<UserCtx>({ usuario: null, municipio: null, cargando: true })

export function UserProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [municipio, setMunicipio] = useState<Municipio | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setCargando(false); return }

      const [{ data: u }, { data: m }] = await Promise.all([
        supabase.from('usuarios').select('*').eq('id', session.user.id).single(),
        supabase.from('municipios').select('*').single(),
      ])

      setUsuario(u as Usuario ?? null)
      setMunicipio(m as Municipio ?? null)
      setCargando(false)
    }
    load()
  }, [])

  return <Ctx.Provider value={{ usuario, municipio, cargando }}>{children}</Ctx.Provider>
}

export const useUsuario = () => useContext(Ctx)

// Re-export types for convenience
export type { Usuario, Municipio }
export type { Rol } from '@/lib/types'
