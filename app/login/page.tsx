'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Toaster, toast } from 'sonner'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)

    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      toast.error('Error al enviar el enlace: ' + error.message)
      setEnviando(false)
      return
    }

    setEnviado(true)
    setEnviando(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Toaster position="top-center" />

      <div className="w-full max-w-md">
        {/* Logo / Título */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">DocGov</h1>
          <p className="text-gray-500 mt-2">
            Gestión documental contractual
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Alcaldía Municipal de Fredonia
          </p>
        </div>

        {/* Card de login */}
        <div className="bg-white rounded-2xl shadow-sm border p-8">
          {!enviado ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Iniciar sesión
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Ingresa tu correo electrónico y te enviaremos un enlace para acceder al sistema. Sin contraseña.
              </p>

              <form onSubmit={handleLogin}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu.correo@ejemplo.com"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 placeholder-gray-400"
                />

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full mt-4 bg-gray-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enviando ? 'Enviando...' : 'Enviar enlace de acceso'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                ¡Revisa tu correo!
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Enviamos un enlace de acceso a:
              </p>
              <p className="text-sm font-medium text-gray-900 bg-gray-50 py-2 px-4 rounded-lg inline-block">
                {email}
              </p>
              <p className="text-xs text-gray-400 mt-4">
                Haz clic en el enlace del correo para acceder al sistema.
                <br />Si no lo ves, revisa tu carpeta de spam.
              </p>
              <button
                onClick={() => { setEnviado(false); setEmail(''); }}
                className="mt-6 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Usar otro correo
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          DocGov v0.1 — Piloto Fredonia, Antioquia
        </p>
      </div>
    </div>
  )
}