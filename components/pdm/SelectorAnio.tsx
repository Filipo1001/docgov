'use client'

/**
 * El selector de año: los cuatro años del plan en una fila, con el elegido en tinta.
 *
 * Cambia de año sin ir al servidor: cada indicador ya trae los cuatro (`proyectarAnio`). Un año que todavía no
 * empieza se puede mirar (sus metas están ahí) pero se rotula «próximo»: no se espera nada de él.
 */

import { ANIOS_PLAN, ROTULO_ESTADO_ANIO, estadoDelAnio } from '@/lib/pdm/seguimiento'
import { T } from './tema'

export default function SelectorAnio({ anio, anioActual, onCambiar, className = '' }: {
  anio: number
  anioActual: number
  onCambiar: (anio: number) => void
  className?: string
}) {
  return (
    <div className={className}>
      <span className={T.rotulo} id="pdm-anio-rotulo">Año</span>
      <div role="group" aria-labelledby="pdm-anio-rotulo" className="mt-1.5 flex flex-wrap gap-2">
        {ANIOS_PLAN.map(a => {
          const estado = estadoDelAnio(a, anioActual)
          const elegido = a === anio
          return (
            <button
              key={a}
              id={`pdm-anio-${a}`}
              onClick={() => onCambiar(a)}
              aria-pressed={elegido}
              className={`flex min-w-[5.25rem] flex-col items-start rounded-md border px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-1 ${
                elegido
                  ? 'border-[#192031] bg-[#192031] text-white'
                  : 'border-[#C5CBD6] bg-white text-[#4A5568] hover:border-[#192031] hover:text-[#192031]'
              }`}
            >
              <span className="text-sm font-semibold tabular-nums">{a}</span>
              <span className={`text-[11px] ${elegido ? 'text-white/75' : 'text-[#667085]'}`}>{ROTULO_ESTADO_ANIO[estado]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
