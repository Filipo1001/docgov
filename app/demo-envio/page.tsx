'use client'

/** Página temporal para probar la confirmación de envío. Se retira al cerrar. */

import { useEffect, useState } from 'react'
import EnvioInforme from '@/components/EnvioInforme'

export default function DemoEnvio() {
  const [abierto, setAbierto] = useState(false)
  const [completado, setCompletado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function correr(opciones: { fallar?: boolean; ms?: number; colgar?: boolean } = {}) {
    setError(null)
    setCompletado(false)
    setAbierto(true)
    if (opciones.colgar) return // nunca completa: para ver el aviso de lentitud
    setTimeout(() => {
      if (opciones.fallar) setError('El plazo para enviar este periodo ya venció. Solo puedes enviar el informe del mes actual.')
      else setCompletado(true)
    }, opciones.ms ?? 2200)
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); setError(null) } }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-6 sm:p-10 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Confirmación de envío — todos los escenarios</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pulsa <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">Esc</kbd> para cerrar a la fuerza.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => correr()} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Normal (2,2 s)</button>
        <button onClick={() => correr({ ms: 300 })} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Muy rápido (300 ms)</button>
        <button onClick={() => correr({ ms: 9000 })} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Lento (9 s)</button>
        <button onClick={() => correr({ colgar: true })} className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm">Colgado (nunca termina)</button>
        <button onClick={() => correr({ fallar: true })} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm">Con error</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 pt-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="h-3 bg-gray-200 rounded w-32 mb-2" />
            <div className="h-2.5 bg-gray-100 rounded w-48" />
          </div>
        ))}
      </div>

      <EnvioInforme
        abierto={abierto}
        completado={completado}
        error={error}
        onCerrar={() => { setAbierto(false); setError(null) }}
      />
    </div>
  )
}
