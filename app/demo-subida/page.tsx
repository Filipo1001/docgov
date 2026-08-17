'use client'

/** Página temporal para revisar el indicador de subida. Se retira al cerrar. */

import { useEffect, useState } from 'react'
import SubiendoArchivo from '@/components/ui/SubiendoArchivo'
import { Iconos, type LucideIcon } from '@/lib/iconos'

const CASOS: { icono: LucideIcon; etiqueta: string }[] = [
  { icono: Iconos.dominio.evidencia, etiqueta: 'Subiendo 3 imágenes' },
  { icono: Iconos.documentos.adjunto, etiqueta: 'Subiendo documento' },
  { icono: Iconos.documentos.planilla, etiqueta: 'Subiendo planilla' },
  { icono: Iconos.documentos.cuentaCobro, etiqueta: 'Subiendo factura electrónica' },
  { icono: Iconos.navegacion.firmas, etiqueta: 'Subiendo firma' },
  { icono: Iconos.navegacion.usuarios, etiqueta: 'Subiendo foto de perfil' },
  { icono: Iconos.navegacion.historicos, etiqueta: 'Procesando archivo' },
]

export default function DemoSubida() {
  const [activo, setActivo] = useState<number | null>(null)

  // Sin cierre automático: se cierra con la tecla Escape o el botón. Así se
  // puede mirar con calma.
  useEffect(() => {
    if (activo === null) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setActivo(null) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [activo])

  const caso = activo !== null ? CASOS[activo] : null

  return (
    <div className="min-h-screen bg-gray-50 p-6 sm:p-10 space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Demo — indicador de subida</h1>
      <p className="text-sm text-gray-500">
        Cada botón simula uno de los puntos de carga reales. Pulsa <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">Esc</kbd> para cerrar.
      </p>

      <div className="flex flex-wrap gap-2 pt-2">
        {CASOS.map((c, i) => (
          <button
            key={c.etiqueta}
            onClick={() => setActivo(i)}
            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm"
          >
            {c.etiqueta}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 pt-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="h-3 bg-gray-200 rounded w-32 mb-2" />
            <div className="h-2.5 bg-gray-100 rounded w-48" />
          </div>
        ))}
      </div>

      <SubiendoArchivo
        abierto={caso !== null}
        icono={caso?.icono ?? Iconos.documentos.adjunto}
        etiqueta={caso?.etiqueta ?? ''}
        detalle="No cierres esta página."
      />
    </div>
  )
}
