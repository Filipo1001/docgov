'use client'

/**
 * Una barra por secretaría: su cumplimiento, repartido en los MISMOS tres tramos y colores de la torta, a lo ancho de una pista
 * del 100 %. Así la torta (el plan entero) y las barras (cada secretaría) se leen con las mismas reglas: lo verde es lo que llegó
 * a su meta, y lo que falta para completar la pista es lo que aún no tiene avance.
 *
 * Las barras se comparan en PORCENTAJE y cada fila dice sobre cuántas metas se calcula: una secretaría con dos indicadores no
 * puede parecer tan firme como una con cien. Con menos de `POCOS` metas, la fila lo advierte.
 *
 * Van del grupo con más indicadores al que menos (no por «quién va mejor»: eso sería un podio). Los tramos se animan con
 * `flex-grow`, como las barras de reportes del módulo: al cambiar de años se acomodan en vez de saltar.
 */

import type { Cumplimiento } from '@/lib/pdm/graficos'
import { pctDe, TRAMOS } from './cumplimiento-tema'

/** Con menos metas que esto, un porcentaje se mueve demasiado con una sola: se avisa. */
const POCOS = 5

export default function BarrasCumplimiento({ filas, resaltado = null }: {
  filas: { nombre: string; c: Cumplimiento }[]
  resaltado?: string | null
}) {
  return (
    <ul className="space-y-4">
      {filas.map(({ nombre, c }) => {
        const pocos = c.total > 0 && c.total < POCOS
        const descripcion = c.total === 0
          ? `${nombre}: sin metas en los años elegidos`
          : `${nombre}: ${c.cumplidos} cumplidas, ${c.parciales} en avance y ${c.sinAvance} sin avance, de ${c.total}`
        return (
          <li key={nombre} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.25rem] sm:items-center" aria-label={descripcion}>
            <div className="min-w-0 sm:col-start-1">
              <p className="text-sm font-medium leading-snug text-[#192031] [overflow-wrap:anywhere]">{nombre}</p>
              <p className="text-xs leading-4 text-[#667085]">
                {c.total === 0 ? 'Sin metas en este período' : `${c.total} ${c.total === 1 ? 'meta' : 'metas'}`}
                {pocos && ' · pocas: lee el porcentaje con cuidado'}
              </p>
            </div>
            <p className="text-right text-sm font-semibold tabular-nums text-[#192031] sm:col-start-3 sm:row-start-1" aria-hidden>
              {c.pctCumplido === null ? <span className="font-normal text-[#667085]">—</span> : `${pctDe(c.cumplidos, c.total)} %`}
            </p>
            <span aria-hidden className="col-span-2 flex h-3 w-full gap-px overflow-hidden rounded-[4px] bg-[#E6E9EF] sm:col-span-1 sm:col-start-2 sm:row-start-1">
              {TRAMOS.map(t => (
                <span
                  key={t.clave}
                  className="block h-full transition-[flex-grow,opacity] duration-500 ease-out motion-reduce:transition-none"
                  style={{
                    flexGrow: c[t.clave], flexBasis: 0, minWidth: c[t.clave] > 0 ? 2 : 0, backgroundColor: t.color,
                    opacity: resaltado === null || resaltado === t.clave ? 1 : 0.3,
                  }}
                />
              ))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
