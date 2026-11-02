'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LogoCD } from '@/components/Logo'
import { cambiarMiContrasena, liberarMarcaDeClaveInicial } from '@/app/actions/mi-cuenta'
import { LARGO_MINIMO_CLAVE } from '@/lib/clave-inicial'

const CAMPO =
  'w-full min-h-12 px-3.5 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none transition-shadow focus:border-gray-900 focus:ring-2 focus:ring-gray-900/15'

export default function CambiarClaveClient({ nombre }: { nombre: string | null }) {
  const router = useRouter()
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [saliendo, setSaliendo] = useState(false)

  const noCoinciden = confirmacion.length > 0 && nueva !== confirmacion

  function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    iniciar(async () => {
      const res = await cambiarMiContrasena(nueva, confirmacion).catch(() => ({ error: 'No se pudo cambiar la contraseña. Revisa tu conexión.' }))
      if (res.error) { setError(res.error); return }
      // Si la marca no se hubiera podido quitar al guardar, este paso la comprueba y la quita (la contraseña ya cambió).
      await liberarMarcaDeClaveInicial().catch(() => {})
      router.replace('/dashboard')
      router.refresh()
    })
  }

  async function salir() {
    setSaliendo(true)
    try { await createClient().auth.signOut() } finally { window.location.href = '/login' }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex mb-3"><LogoCD size={56} /></div>
          <h1 className="text-2xl font-bold tracking-tight text-[#192031]">Elige tu contraseña</h1>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <p className="text-sm text-gray-700 leading-relaxed">
            {nombre ? `Hola ${nombre}. ` : ''}Entraste con la contraseña que te dimos al crear tu cuenta, que es tu número de documento.
            Para proteger tus informes y tus datos, elige una contraseña propia antes de continuar.
          </p>

          <form onSubmit={guardar} className="mt-6 space-y-4">
            <div>
              <label htmlFor="clave-nueva" className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
              <input
                id="clave-nueva"
                type={mostrar ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                value={nueva}
                onChange={e => { setNueva(e.target.value); setError(null) }}
                aria-describedby="clave-nueva-ayuda"
                className={CAMPO}
              />
              <p id="clave-nueva-ayuda" className={`mt-1.5 text-sm ${nueva.length > 0 && nueva.length < LARGO_MINIMO_CLAVE ? 'text-amber-700' : 'text-gray-600'}`}>
                Al menos {LARGO_MINIMO_CLAVE} caracteres. No uses tu número de documento.
              </p>
            </div>

            <div>
              <label htmlFor="clave-confirmacion" className="block text-sm font-medium text-gray-700 mb-1.5">Repítela</label>
              <input
                id="clave-confirmacion"
                type={mostrar ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmacion}
                onChange={e => { setConfirmacion(e.target.value); setError(null) }}
                aria-invalid={noCoinciden}
                aria-describedby={noCoinciden ? 'clave-confirmacion-ayuda' : undefined}
                className={CAMPO}
              />
              {noCoinciden && <p id="clave-confirmacion-ayuda" className="mt-1.5 text-sm text-amber-700">Las dos contraseñas no coinciden.</p>}
            </div>

            <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer min-h-11">
              <input type="checkbox" checked={mostrar} onChange={e => setMostrar(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-gray-900" />
              Mostrar lo que escribo
            </label>

            <p role="alert" className="text-sm text-red-700 empty:hidden">{error ?? ''}</p>

            <button
              type="submit"
              disabled={pendiente || nueva.length < LARGO_MINIMO_CLAVE || nueva !== confirmacion}
              className="w-full min-h-12 rounded-xl bg-gray-900 text-white text-sm font-semibold transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            >
              {pendiente ? 'Guardando…' : 'Guardar y continuar'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-600">
          ¿No eres tú?{' '}
          <button type="button" onClick={salir} disabled={saliendo} className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-700 disabled:opacity-50">
            {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
          </button>
        </p>
      </div>
    </main>
  )
}
