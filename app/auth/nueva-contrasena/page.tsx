'use client'

/**
 * Último paso del flujo "¿Olvidó su contraseña?".
 *
 * Se llega aquí solo desde /auth/callback, después de que Supabase ya
 * canjeó el código de recuperación por una sesión. Antes el callback mandaba
 * directo a /dashboard sin pasar por aquí: la sesión quedaba iniciada, pero
 * nadie le pedía a la persona una contraseña nueva, así que "recuperar"
 * terminaba siendo un ingreso de un solo uso sin que la contraseña cambiara.
 *
 * Si alguien llega a esta URL sin la sesión que deja ese canje (bookmark,
 * enlace reenviado, sesión expirada), se le manda a /login: no tiene sentido
 * pedir una contraseña nueva sin saber para qué cuenta es.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Toaster, toast } from 'sonner'
import { LogoCD } from '@/components/Logo'

export default function NuevaContrasenaPage() {
  const [verificando, setVerificando] = useState(true)
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mostrar, setMostrar] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function verificarSesion() {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.replace('/login')
        return
      }
      setVerificando(false)
    }
    verificarSesion()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (nueva.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (nueva !== confirmar) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    setGuardando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: nueva })
    setGuardando(false)

    if (error) {
      toast.error('Error: ' + error.message)
      return
    }

    toast.success('Contraseña actualizada')
    router.push('/dashboard')
  }

  if (verificando) return null

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Toaster position="top-center" richColors />

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex mb-4">
            <LogoCD size={64} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#192031]">Contratista Digital</h1>
          <p className="text-sm text-gray-400 mt-1">Alcaldía Municipal de Fredonia</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">
          <div className="p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Crea tu nueva contraseña
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Elige una contraseña que no hayas usado antes en esta cuenta.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Contraseña nueva
                </label>
                <div className="relative">
                  <input
                    type={mostrar ? 'text' : 'password'}
                    value={nueva}
                    onChange={(e) => setNueva(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    autoFocus
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrar(!mostrar)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {mostrar ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirmar contraseña
                </label>
                <input
                  type={mostrar ? 'text' : 'password'}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400"
                />
              </div>

              <button
                type="submit"
                disabled={guardando}
                className="w-full mt-2 bg-gray-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {guardando ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Contratista Digital — Piloto Fredonia, Antioquia
        </p>
      </div>
    </div>
  )
}
