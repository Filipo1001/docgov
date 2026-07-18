'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function verificarSesion() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        router.replace(session ? '/dashboard' : '/login')
      } catch {
        // Cliente de auth atascado o fetch abortado (p. ej. al reanudar en
        // iOS): que decida el servidor — /dashboard redirige a /login por sí
        // solo si no hay sesión válida. Navegación dura: siempre navega.
        window.location.replace('/dashboard')
      }
    }

    verificarSesion()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Cargando...</p>
    </div>
  )
}