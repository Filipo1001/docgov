'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function verificarSesion() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        router.push('/dashboard')
      } else {
        router.push('/login')
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