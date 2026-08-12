'use client'

/**
 * Descarga masiva del mes — ZIP organizado por contratista con los documentos
 * SELECCIONADOS de todas las cuentas aprobadas/radicadas del mes visible.
 *
 * El selector existe porque cada rol necesita cosas distintas: el supervisor
 * suele bajar solo las actas (supervisión + pago) para firmar, mientras la
 * secretaría arma el paquete completo para radicación física. Presets rápidos
 * para ambos casos.
 *
 * La descarga usa fetch → blob (no <a download> directo) para poder mostrar
 * progreso y capturar errores del servidor con su mensaje real.
 */

import { useState } from 'react'
import { toast } from 'sonner'

const DOCS = [
  { id: 'informe',          label: 'Informe de Actividades' },
  // Un lote puede mezclar ambos: quien factura electrónicamente aporta su
  // factura en lugar de la Cuenta de Cobro, y el ZIP la incluye con su nombre.
  { id: 'cuenta-cobro',     label: 'Cuenta de Cobro / Factura' },
  { id: 'acta-supervision', label: 'Acta de Supervisión' },
  { id: 'acta-pago',        label: 'Acta de Pago' },
  { id: 'planilla',         label: 'Planilla de Seguridad Social' },
] as const

type DocId = (typeof DOCS)[number]['id']

const PRESET_TODOS: DocId[] = DOCS.map(d => d.id)
const PRESET_ACTAS: DocId[] = ['acta-supervision', 'acta-pago']

export default function DescargaMasiva({
  mesNombre,
  anio,
  totalCuentas,
  onClose,
}: {
  mesNombre: string
  anio: number
  /** Cuentas aprobadas+radicadas (no históricas) del mes visible */
  totalCuentas: number
  onClose: () => void
}) {
  const [seleccion, setSeleccion] = useState<Set<DocId>>(new Set(PRESET_TODOS))
  const [descargando, setDescargando] = useState(false)

  function toggle(id: DocId) {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function aplicarPreset(ids: DocId[]) {
    setSeleccion(new Set(ids))
  }

  const esPreset = (ids: DocId[]) =>
    seleccion.size === ids.length && ids.every(id => seleccion.has(id))

  async function descargar() {
    if (!seleccion.size) { toast.error('Selecciona al menos un documento'); return }
    setDescargando(true)
    const toastId = toast.loading(`Generando ZIP de ${mesNombre} ${anio}… puede tardar un momento`)
    try {
      const docs = [...seleccion].join(',')
      const res = await fetch(`/api/pdf/mes?mes=${encodeURIComponent(mesNombre)}&anio=${anio}&docs=${docs}`)
      if (!res.ok) {
        let msg = 'No se pudo generar el ZIP'
        try { const j = await res.json(); if (j?.error) msg = j.error } catch { /* no-JSON */ }
        throw new Error(msg)
      }

      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const nombre = cd.match(/filename="?([^"]+)"?/)?.[1] ?? `DOCUMENTOS_${mesNombre.toUpperCase()}_${anio}.zip`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      const nErrores = parseInt(res.headers.get('X-Documentos-Errores') ?? '0', 10)
      if (nErrores > 0) {
        toast.warning(`ZIP descargado — ${nErrores} documento(s) no se pudieron incluir (ver ERRORES.txt dentro del ZIP)`, { id: toastId, duration: 8000 })
      } else {
        toast.success('ZIP descargado', { id: toastId })
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al descargar', { id: toastId })
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !descargando && onClose()} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Descargar mes completo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalCuentas} cuenta{totalCuentas === 1 ? '' : 's'} de {mesNombre} {anio} · una carpeta por contratista
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={descargando}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Presets */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            onClick={() => aplicarPreset(PRESET_TODOS)}
            disabled={descargando}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              esPreset(PRESET_TODOS)
                ? 'bg-gray-900 text-white border-gray-900'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Paquete completo
          </button>
          <button
            onClick={() => aplicarPreset(PRESET_ACTAS)}
            disabled={descargando}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              esPreset(PRESET_ACTAS)
                ? 'bg-gray-900 text-white border-gray-900'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Solo actas
          </button>
        </div>

        {/* Checkboxes */}
        <div className="px-6 py-4 space-y-1">
          {DOCS.map(doc => (
            <label
              key={doc.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                seleccion.has(doc.id) ? 'bg-gray-50' : 'hover:bg-gray-50/60'
              }`}
            >
              <input
                type="checkbox"
                checked={seleccion.has(doc.id)}
                onChange={() => toggle(doc.id)}
                disabled={descargando}
                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
              />
              <span className="text-sm text-gray-700">{doc.label}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={descargando}
            className="text-sm px-4 py-2 text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={descargar}
            disabled={descargando || seleccion.size === 0}
            className="text-sm px-5 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
          >
            {descargando ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Generando…
              </>
            ) : (
              `Descargar ZIP (${seleccion.size} doc${seleccion.size === 1 ? '' : 's'})`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
