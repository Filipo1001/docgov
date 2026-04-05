'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Toaster, toast } from 'sonner'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [modo, setModo] = useState<'login' | 'magic' | 'recuperar'>('login')
  const [magicEnviado, setMagicEnviado] = useState(false)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const router = useRouter()

  // Login con email + contraseña
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Correo o contraseña incorrectos')
      } else {
        toast.error(error.message)
      }
      setEnviando(false)
      return
    }

    toast.success('Ingresando...')
    router.push('/dashboard')
  }

  // Magic link
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      toast.error('Error: ' + error.message)
      setEnviando(false)
      return
    }

    setMagicEnviado(true)
    setEnviando(false)
  }

  // Recuperar contraseña
  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const supabase = createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })

    if (error) {
      toast.error('Error: ' + error.message)
      setEnviando(false)
      return
    }

    toast.success('Te enviamos un enlace para restablecer tu contraseña')
    setEnviando(false)
    setModo('login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <Toaster position="top-center" richColors />

      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-900 rounded-2xl mb-4">
            <span className="text-2xl font-bold text-white">DG</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">DocGov</h1>
          <p className="text-gray-500 mt-1">Gestión documental contractual</p>
          <p className="text-sm text-gray-400">Alcaldía Municipal de Fredonia</p>
        </div>

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">

          <div className="p-8">

            {/* === MODO LOGIN === */}
            {modo === 'login' && (
              <form onSubmit={handleLogin}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu.correo@ejemplo.com"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={mostrarPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Tu contraseña"
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400 pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarPassword(!mostrarPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {mostrarPassword ? (
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
                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full mt-6 bg-gray-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enviando ? 'Ingresando...' : 'Ingresar'}
                </button>

                <button
                  type="button"
                  onClick={() => setModo('recuperar')}
                  className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-4 bg-white text-gray-400">o</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModo('magic')}
                  className="w-full py-3 px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
                >
                  Ingresar con enlace mágico (sin contraseña)
                </button>
              </form>
            )}

            {/* === MODO MAGIC LINK === */}
            {modo === 'magic' && !magicEnviado && (
              <form onSubmit={handleMagicLink}>
                <button
                  type="button"
                  onClick={() => setModo('login')}
                  className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1"
                >
                  ← Volver al login
                </button>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Enlace mágico
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  Te enviamos un enlace a tu correo. Haz clic y entras directo, sin contraseña.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu.correo@ejemplo.com"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full mt-4 bg-gray-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {enviando ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </form>
            )}

            {/* === MAGIC LINK ENVIADO === */}
            {modo === 'magic' && magicEnviado && (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">¡Revisa tu correo!</h2>
                <p className="text-sm text-gray-500 mb-2">Enviamos un enlace de acceso a:</p>
                <p className="text-sm font-medium text-gray-900 bg-gray-50 py-2 px-4 rounded-lg inline-block">{email}</p>
                <p className="text-xs text-gray-400 mt-4">Si no lo ves, revisa tu carpeta de spam.</p>
                <button
                  onClick={() => { setMagicEnviado(false); setModo('login'); setEmail('') }}
                  className="mt-6 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Volver al login
                </button>
              </div>
            )}

            {/* === MODO RECUPERAR === */}
            {modo === 'recuperar' && (
              <form onSubmit={handleRecuperar}>
                <button
                  type="button"
                  onClick={() => setModo('login')}
                  className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1"
                >
                  ← Volver al login
                </button>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Recuperar contraseña
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  Te enviamos un enlace para crear una nueva contraseña.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu.correo@ejemplo.com"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full mt-4 bg-gray-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {enviando ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>
            )}

          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          DocGov v0.1 — Piloto Fredonia, Antioquia
        </p>
      </div>
    </div>
  )
}
