'use client'

/**
 * Selección del contratista entre las cuentas existentes.
 *
 * Un desplegable nativo con 116 nombres obliga a recorrer la lista a ciegas y
 * no deja confirmar que se eligió a la persona correcta: dos contratistas
 * pueden llamarse casi igual y solo la cédula los distingue. Aquí se busca por
 * nombre o cédula, y al elegir queda a la vista con su foto.
 */

import { useMemo, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import { formatCedula } from '@/lib/format'

export interface ContratistaOpcion {
  id: string
  nombre_completo: string
  cedula: string
  foto_url: string | null
}

interface Props {
  contratistas: ContratistaOpcion[]
  valor: string
  onChange: (id: string) => void
}

/** Sin tildes ni ñ: "munoz" debe encontrar a MUÑOZ, "jose" a JOSÉ. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const MAX_VISIBLES = 6

export default function SelectorContratista({ contratistas, valor, onChange }: Props) {
  const [busqueda, setBusqueda] = useState('')

  const elegido = contratistas.find(c => c.id === valor) ?? null

  const resultados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    if (!q) return contratistas.slice(0, MAX_VISIBLES)
    return contratistas
      .filter(c => normalizar(c.nombre_completo).includes(q) || c.cedula.includes(q))
      .slice(0, MAX_VISIBLES)
  }, [contratistas, busqueda])

  if (elegido) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Contratista <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-3 p-3 rounded-2xl border border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20">
          <Avatar nombre={elegido.nombre_completo} foto={elegido.foto_url} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-900 truncate">{elegido.nombre_completo}</p>
            <p className="text-xs text-gray-500">C.C. {formatCedula(elegido.cedula)}</p>
          </div>
          <button
            type="button"
            onClick={() => { onChange(''); setBusqueda('') }}
            className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2 shrink-0"
          >
            cambiar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Contratista <span className="text-red-500">*</span>
      </label>

      <div className="relative">
        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o cédula…"
          className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none"
        />
      </div>

      <div className="mt-2 space-y-1">
        {resultados.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-gray-200 hover:bg-gray-50 text-left transition-colors"
          >
            <Avatar nombre={c.nombre_completo} foto={c.foto_url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900 truncate">{c.nombre_completo}</p>
              <p className="text-[11px] text-gray-400">C.C. {formatCedula(c.cedula)}</p>
            </div>
          </button>
        ))}

        {resultados.length === 0 && (
          <p className="text-xs text-gray-400 py-3 text-center">
            Ningún contratista coincide con «{busqueda}».
          </p>
        )}
        {!busqueda && contratistas.length > MAX_VISIBLES && (
          <p className="text-[11px] text-gray-400 pt-1 text-center">
            {contratistas.length - MAX_VISIBLES} más — escribe para buscar
          </p>
        )}
      </div>
    </div>
  )
}
