'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'

export type Rol = 'admin' | 'supervisor' | 'contratista' | 'asesor' | 'gobierno' | 'hacienda'

export interface Usuario {
  id: string
  nombre_completo: string
  cedula: string
  email: string
  telefono: string
  rol: Rol
}

interface UserCtx {
  usuario: Usuario | null
  municipio: any
  cargando: boolean
}

const Ctx = createContext<UserCtx>({ usuario: null, municipio: null, cargando: true })

export function UserProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [municipio, setMunicipio] = useState<any>(null)
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

      setUsuario(u)
      setMunicipio(m)
      setCargando(false)
    }
    load()
  }, [])

  return <Ctx.Provider value={{ usuario, municipio, cargando }}>{children}</Ctx.Provider>
}

export const useUsuario = () => useContext(Ctx)
