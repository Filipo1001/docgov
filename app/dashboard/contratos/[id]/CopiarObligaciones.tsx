'use client'

/**
 * Copia las obligaciones de otro contrato al que se está configurando.
 *
 * Solo aparece cuando el contrato no tiene ninguna: es un atajo para arrancar,
 * no una forma de mezclar dos juegos de obligaciones.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  contratosModelo, copiarObligaciones,
  type ContratoModelo, type ObligacionCreada,
} from '@/app/actions/obligaciones'

export default function CopiarObligaciones({
  contratoId, onCopiado,
}: {
  contratoId: string
  /** Recibe las obligaciones creadas para pintarlas sin reconsultar. */
  onCopiado: (obligaciones: ObligacionCreada[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [modelos, setModelos] = useState<ContratoModelo[] | null>(null)
  const [copiando, setCopiando] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  // Se cargan al abrir y no al montar: la mayoría de las visitas al contrato
  // no van a usar esto.
  useEffect(() => {
    if (abierto && modelos === null) {
      contratosModelo(contratoId).then(setModelos).catch(() => setModelos([]))
    }
  }, [abierto, modelos, contratoId])

  async function copiar(origenId: string) {
    setCopiando(origenId)
    const res = await copiarObligaciones(contratoId, origenId)
    setCopiando(null)
    if (res.error) { toast.error(res.error); return }
    toast.success(`${res.data!.obligaciones.length} obligaciones copiadas`)
    setAbierto(false)
    onCopiado(res.data!.obligaciones)
  }

  const visibles = (modelos ?? []).filter(m => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    return m.numero.toLowerCase().includes(q) || m.objeto.toLowerCase().includes(q)
  })

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
      >
        Copiar las obligaciones de otro contrato
      </button>
    )
  }

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-medium text-gray-900">Copiar obligaciones desde…</p>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Cancelar
        </button>
      </div>

      {modelos === null ? (
        <p className="text-xs text-gray-400 py-3 text-center">Cargando contratos…</p>
      ) : modelos.length === 0 ? (
        <p className="text-xs text-gray-500 py-3 text-center">
          Aún no hay ningún contrato con obligaciones que sirva de modelo.
        </p>
      ) : (
        <>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por número u objeto…"
            className="w-full px-3 py-2 mb-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {visibles.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => copiar(m.id)}
                disabled={!!copiando}
                className="w-full text-left px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/60 disabled:opacity-50 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    N.° {m.numero}-{m.anio}
                  </span>
                  <span className="text-[11px] text-gray-400 shrink-0">
                    {copiando === m.id ? 'Copiando…' : `${m.obligaciones} obligaciones`}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{m.objeto}</p>
              </button>
            ))}
            {visibles.length === 0 && (
              <p className="text-xs text-gray-400 py-3 text-center">Ningún contrato coincide.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
