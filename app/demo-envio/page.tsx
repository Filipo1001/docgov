'use client'

/** Página temporal para comparar las dos propuestas. Se retira al elegir. */

import { useEffect, useState } from 'react'
import EnvioInforme, { type VarianteEnvio } from '@/components/EnvioInforme'

export default function DemoEnvio() {
  const [abierto, setAbierto] = useState(false)
  const [completado, setCompletado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variante, setVariante] = useState<VarianteEnvio>('sello')

  function correr(v: VarianteEnvio, opciones: { fallar?: boolean; ms?: number } = {}) {
    setVariante(v)
    setError(null)
    setCompletado(false)
    setAbierto(true)
    setTimeout(() => {
      if (opciones.fallar) setError('El plazo para enviar este periodo ya venció. Solo puedes enviar el informe del mes actual.')
      else setCompletado(true)
    }, opciones.ms ?? 2200)
  }

  // Se cierra con Escape, para poder mirar el resultado con calma.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); setError(null) } }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-6 sm:p-10 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Envío del informe — dos propuestas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Mismo anillo que las subidas de archivo, sin porcentaje. Pulsa <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">Esc</kbd> para cerrar.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">A · El logotipo se queda y el check lo firma</h2>
        <p className="text-xs text-gray-500 max-w-lg">
          El anillo gira alrededor del logotipo. Al terminar se cierra en verde y un sello con
          el check entra en la esquina. La marca sigue presente en el momento de la confirmación.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => correr('sello')} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Probar A</button>
          <button onClick={() => correr('sello', { ms: 700 })} className="px-4 py-2 bg-gray-700 text-white rounded-xl text-sm">A · rápido</button>
          <button onClick={() => correr('sello', { fallar: true })} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm">A · con error</button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">B · El logotipo cede su sitio al check</h2>
        <p className="text-xs text-gray-500 max-w-lg">
          El anillo gira alrededor del logotipo. Al terminar, el logotipo deja el centro y el
          check se dibuja grande en su lugar. La confirmación es más rotunda; la marca, más breve.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => correr('releva')} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Probar B</button>
          <button onClick={() => correr('releva', { ms: 700 })} className="px-4 py-2 bg-gray-700 text-white rounded-xl text-sm">B · rápido</button>
          <button onClick={() => correr('releva', { fallar: true })} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm">B · con error</button>
        </div>
      </section>

      {/* Contenido de fondo, para juzgar cómo se ve la capa sobre la aplicación */}
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
        variante={variante}
        onCerrar={() => { setAbierto(false); setError(null) }}
      />
    </div>
  )
}
