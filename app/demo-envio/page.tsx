'use client'

/**
 * Página temporal para revisar la animación de envío sin pasar por el flujo
 * real (que exige sesión de contratista, un periodo en borrador y planilla).
 * Se retira antes de cerrar la revisión.
 */

import { useState } from 'react'
import EnvioExpediente, { type PiezaExpediente } from '@/components/EnvioExpediente'
import { Iconos } from '@/lib/iconos'

/** Mes corriente: lo que envía un contratista en un periodo intermedio. */
const PIEZAS: PiezaExpediente[] = [
  { icono: Iconos.navegacion.informes, etiqueta: '14 actividades registradas' },
  { icono: Iconos.dominio.evidencia, etiqueta: '23 evidencias adjuntas' },
  { icono: Iconos.documentos.planilla, etiqueta: 'Planilla de seguridad social' },
  { icono: Iconos.documentos.informe, etiqueta: 'Informe de actividades' },
]

/** Último mes del contrato: suma el acta de terminación, que sí se genera. */
const PIEZAS_ULTIMO: PiezaExpediente[] = [
  ...PIEZAS.slice(0, 3),
  { icono: Iconos.documentos.actaTerminacion, etiqueta: 'Acta de terminación' },
  PIEZAS[3],
]

export default function DemoEnvio() {
  const [abierto, setAbierto] = useState(false)
  const [completado, setCompletado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [piezas, setPiezas] = useState<PiezaExpediente[]>(PIEZAS)

  function correr(ms: number, opciones: { fallar?: boolean; ultimo?: boolean } = {}) {
    setError(null)
    setCompletado(false)
    setPiezas(opciones.ultimo ? PIEZAS_ULTIMO : PIEZAS)
    setAbierto(true)
    setTimeout(() => {
      if (opciones.fallar) setError('El plazo para enviar este periodo ya venció. Solo puedes enviar el informe del mes actual.')
      else setCompletado(true)
    }, ms)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 sm:p-10 space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Demo — animación de envío</h1>

      {/* Contenido de relleno: con el velo tenue hay que poder juzgar cuánto
          se ve la aplicación por detrás de la tarjeta. */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => correr(600)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Rápido (600 ms)</button>
        <button onClick={() => correr(2200)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Normal (2,2 s)</button>
        <button onClick={() => correr(10000)} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Lento (10 s)</button>
        <button onClick={() => correr(2200, { ultimo: true })} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm">Último mes (con acta)</button>
        <button onClick={() => correr(1500, { fallar: true })} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm">Con error</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 pt-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="h-3 bg-gray-200 rounded w-32 mb-2" />
            <div className="h-2.5 bg-gray-100 rounded w-48" />
          </div>
        ))}
      </div>

      <EnvioExpediente
        abierto={abierto}
        piezas={piezas}
        completado={completado}
        error={error}
        onCerrar={() => { setAbierto(false); setError(null) }}
      />
    </div>
  )
}
