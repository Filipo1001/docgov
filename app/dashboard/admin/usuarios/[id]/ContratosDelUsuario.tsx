'use client'

/**
 * Los contratos que la persona ha tenido como contratista, en su ficha de usuario: vigentes y finalizados, con su filtro.
 * Cada tarjeta es un enlace a la ficha del contrato: número y año, y el valor total. Lo vigente y lo finalizado se
 * decide con la misma regla del resto del sistema (lib/vigencia-contrato.ts: fecha de fin efectiva, terminación anticipada,
 * liquidado o cedido), calculada en el servidor para que la pantalla no dependa del reloj del navegador.
 */

import { useState } from 'react'
import Link from 'next/link'
import { pesos } from '@/lib/valor-contrato'

export interface ContratoDelUsuario {
  id: string
  numero: string
  anio: number
  valorTotal: number
  vigencia: 'vigente' | 'vencido'
}

type Filtro = 'todos' | 'vigentes' | 'finalizados'

export default function ContratosDelUsuario({ contratos }: { contratos: ContratoDelUsuario[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const vigentes = contratos.filter(c => c.vigencia === 'vigente').length
  const finalizados = contratos.length - vigentes
  const visibles = contratos.filter(c =>
    filtro === 'vigentes' ? c.vigencia === 'vigente' :
    filtro === 'finalizados' ? c.vigencia === 'vencido' :
    true,
  )

  const opciones: { id: Filtro; label: string }[] = [
    { id: 'todos', label: `Todos (${contratos.length})` },
    { id: 'vigentes', label: `Vigentes (${vigentes})` },
    { id: 'finalizados', label: `Finalizados (${finalizados})` },
  ]

  return (
    <section aria-labelledby="contratos-titulo" className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 id="contratos-titulo" className="text-sm font-semibold text-gray-900">Contratos</h3>
        {contratos.length > 0 && (
          <div role="group" aria-label="Filtrar contratos" className="flex gap-1.5">
            {opciones.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => setFiltro(o.id)}
                aria-pressed={filtro === o.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filtro === o.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {contratos.length === 0 ? (
        <p className="text-sm text-gray-400">Esta persona no tiene contratos registrados.</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-gray-400">No hay contratos en esta categoría.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibles.map(c => (
            <li key={c.id}>
              <Link
                href={`/dashboard/contratos/${c.id}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-300 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 tabular-nums">
                    N.º {c.numero} <span className="font-normal text-gray-400">· {c.anio}</span>
                  </p>
                  <p className="text-xs text-gray-500 tabular-nums mt-0.5">{pesos(c.valorTotal)}</p>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-medium ${c.vigencia === 'vigente' ? 'text-emerald-700' : 'text-gray-400'}`}
                >
                  {c.vigencia === 'vigente' ? 'Vigente' : 'Finalizado'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
