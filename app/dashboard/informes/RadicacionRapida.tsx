'use client'

/**
 * Radicación rápida — radica en lote todas las cuentas aprobadas del mes.
 *
 * Reemplaza el flujo de entrar contrato por contrato: una tabla con todos los
 * periodos en estado 'aprobado', un campo de N.° de radicado por fila,
 * autocompletado consecutivo a partir del primero, validación en vivo de
 * duplicados y un solo botón que guarda todo via marcarRadicadosMasivo.
 *
 * Reglas de guardado:
 * - Solo se radican las filas con número diligenciado (las vacías se omiten).
 * - Números repetidos dentro del formulario bloquean el guardado (error visual).
 * - Fallos parciales del servidor se reportan por fila sin abortar el resto.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { marcarRadicadosMasivo } from '@/app/actions/periodos'
import type { Periodo } from '@/lib/types'

/** "2026-0451" → "2026-0452"; conserva prefijo y ceros a la izquierda. */
function siguienteConsecutivo(base: string, offset: number): string | null {
  const m = base.trim().match(/^(.*?)(\d+)$/)
  if (!m) return null
  const [, prefijo, digitos] = m
  const siguiente = String(parseInt(digitos, 10) + offset)
  return prefijo + siguiente.padStart(digitos.length, '0')
}

export default function RadicacionRapida({
  periodos,
  mesNombre,
  anio,
  onRadicados,
  onClose,
}: {
  /** Periodos en estado 'aprobado' (no históricos) del mes visible */
  periodos: Periodo[]
  mesNombre: string
  anio: number
  /** Callback con los ids radicados y sus números, para el parche optimista */
  onRadicados: (radicados: { periodoId: string; numeroRadicado: string }[]) => void
  onClose: () => void
}) {
  const [numeros, setNumeros] = useState<Record<string, string>>({})
  const [erroresFila, setErroresFila] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  // Duplicados dentro del formulario — validación en vivo
  const duplicados = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const v of Object.values(numeros)) {
      const n = v.trim()
      if (n) conteo.set(n, (conteo.get(n) ?? 0) + 1)
    }
    return new Set([...conteo.entries()].filter(([, c]) => c > 1).map(([n]) => n))
  }, [numeros])

  const diligenciados = periodos.filter(p => (numeros[p.id] ?? '').trim())
  const hayDuplicados = duplicados.size > 0

  function autocompletar() {
    // Toma el primer número diligenciado (en orden de tabla) como semilla
    const semillaIdx = periodos.findIndex(p => (numeros[p.id] ?? '').trim())
    if (semillaIdx === -1) { toast.error('Escribe el primer número de radicado para autocompletar'); return }
    const semilla = numeros[periodos[semillaIdx].id].trim()
    if (!siguienteConsecutivo(semilla, 1)) {
      toast.error('El número debe terminar en dígitos para autocompletar (ej. 2026-0451)')
      return
    }
    setNumeros(prev => {
      const next = { ...prev }
      let offset = 0
      periodos.slice(semillaIdx).forEach(p => {
        next[p.id] = siguienteConsecutivo(semilla, offset)!
        offset++
      })
      return next
    })
  }

  async function guardarTodos() {
    if (!diligenciados.length) { toast.error('Diligencia al menos un número de radicado'); return }
    if (hayDuplicados) { toast.error('Hay números de radicado repetidos en el formulario'); return }

    setGuardando(true)
    setErroresFila({})
    const items = diligenciados.map(p => ({ periodoId: p.id, numeroRadicado: numeros[p.id].trim() }))
    const res = await marcarRadicadosMasivo(items)
    setGuardando(false)

    if (res.error) { toast.error(res.error); return }

    const { radicados = 0, errores = [] } = res.data ?? {}
    if (radicados > 0) {
      const ok = items.filter(i => !errores.some(e => e.periodoId === i.periodoId))
      onRadicados(ok)
      toast.success(`${radicados} cuenta${radicados === 1 ? '' : 's'} radicada${radicados === 1 ? '' : 's'} ✓`)
    }
    if (errores.length > 0) {
      setErroresFila(Object.fromEntries(errores.map(e => [e.periodoId, e.error])))
      toast.error(`${errores.length} periodo(s) no se pudieron radicar — revisa las filas marcadas`)
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={() => !guardando && onClose()} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Radicación rápida</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {periodos.length} cuenta{periodos.length === 1 ? '' : 's'} aprobada{periodos.length === 1 ? '' : 's'} en {mesNombre} {anio}.
              Solo se radican las filas con número diligenciado.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={guardando}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-6 py-2.5 text-xs font-semibold text-gray-500">Contrato</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Contratista</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-52">N.° de radicado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periodos.map(p => {
                const valor = numeros[p.id] ?? ''
                const esDuplicado = !!valor.trim() && duplicados.has(valor.trim())
                const errorServidor = erroresFila[p.id]
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                      N.° {p.contrato?.numero}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {p.contrato?.contratista?.nombre_completo ?? 'Sin nombre'}
                      <span className="text-xs text-gray-400 ml-2">{p.contrato?.dependencia?.abreviatura}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        value={valor}
                        onChange={e => {
                          setNumeros(prev => ({ ...prev, [p.id]: e.target.value }))
                          if (errorServidor) setErroresFila(prev => { const n = { ...prev }; delete n[p.id]; return n })
                        }}
                        placeholder="Ej. 2026-0451"
                        disabled={guardando}
                        className={`w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 disabled:bg-gray-100 ${
                          esDuplicado || errorServidor
                            ? 'border-red-300 focus:ring-red-300 bg-red-50'
                            : 'border-gray-300 focus:ring-gray-400'
                        }`}
                      />
                      {esDuplicado && (
                        <p className="text-[10px] text-red-600 mt-0.5">Número repetido en el formulario</p>
                      )}
                      {errorServidor && (
                        <p className="text-[10px] text-red-600 mt-0.5">{errorServidor}</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
          <button
            onClick={autocompletar}
            disabled={guardando}
            className="text-xs px-3 py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 disabled:opacity-50"
            title="Escribe el primer número y completa el resto como consecutivo"
          >
            ↓ Autocompletar consecutivo
          </button>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={guardando}
              className="text-sm px-4 py-2 text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={guardarTodos}
              disabled={guardando || diligenciados.length === 0 || hayDuplicados}
              className="text-sm px-5 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
            >
              {guardando ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Radicando…
                </>
              ) : (
                `Radicar ${diligenciados.length} cuenta${diligenciados.length === 1 ? '' : 's'}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
