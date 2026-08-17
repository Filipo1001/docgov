'use client'

/**
 * Página temporal para revisar la animación de envío sin pasar por el flujo
 * real (que exige sesión de contratista, un periodo en borrador y planilla).
 * Se retira antes de cerrar la revisión.
 */

import { useState } from 'react'
import EnvioExpediente, { type PiezaExpediente } from '@/components/EnvioExpediente'
import { Iconos } from '@/lib/iconos'

const PIEZAS: PiezaExpediente[] = [
  { icono: Iconos.navegacion.informes, etiqueta: '14 actividades registradas' },
  { icono: Iconos.dominio.evidencia, etiqueta: '23 evidencias adjuntas' },
  { icono: Iconos.documentos.planilla, etiqueta: 'Planilla de seguridad social' },
  { icono: Iconos.documentos.informe, etiqueta: 'Informe de actividades' },
]

export default function DemoEnvio() {
  const [abierto, setAbierto] = useState(false)
  const [completado, setCompletado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function correr(ms: number, fallar = false) {
    setError(null)
    setCompletado(false)
    setAbierto(true)
    setTimeout(() => {
      if (fallar) setError('El plazo para enviar este periodo ya venció. Solo puedes enviar el informe del mes actual.')
      else setCompletado(true)
    }, ms)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-10 space-y-3">
      <h1 className="text-lg font-bold text-gray-900">Demo — animación de envío</h1>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => correr(600)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Rápido (600 ms)</button>
        <button onClick={() => correr(2200)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Normal (2,2 s)</button>
        <button onClick={() => correr(7000)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Lento (7 s)</button>
        <button onClick={() => correr(1500, true)} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm">Con error</button>
      </div>

      <EnvioExpediente
        abierto={abierto}
        piezas={PIEZAS}
        completado={completado}
        error={error}
        onCerrar={() => { setAbierto(false); setError(null) }}
      />
    </div>
  )
}
