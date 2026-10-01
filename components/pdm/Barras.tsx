'use client'

/**
 * Barras del tablero.
 *
 * Nunca comunican solo con color: cada segmento tiene su cifra escrita en la
 * leyenda, y la barra entera lleva una descripción para lector de pantalla.
 * Quien no distingue el naranja del rojo lee «3 atrasados, 2 críticos».
 *
 * Son finas y de esquinas casi rectas, como una regla de medir: la barra acompaña a la cifra, no
 * compite con ella.
 */

import { ESTADOS, type Resumen } from '@/lib/pdm/plan'
import { Marcador } from './ui'

const SEGMENTOS = [
  { clave: 'cumplidos',  estado: 'cumplido',    rotulo: 'Cumplidos' },
  { clave: 'enRuta',     estado: 'en_ruta',     rotulo: 'En ruta' },
  { clave: 'atrasados',  estado: 'atrasado',    rotulo: 'Atrasados' },
  { clave: 'criticos',   estado: 'critico',     rotulo: 'Críticos' },
  { clave: 'sinReporte', estado: 'sin_reporte', rotulo: 'Sin avance validado' },
] as const

export function BarraEstados({ r, alto = 'h-2' }: { r: Resumen; alto?: string }) {
  const descripcion = SEGMENTOS.map(s => `${r[s.clave]} ${s.rotulo.toLowerCase()}`).join(', ')
  return (
    <div
      role="img"
      aria-label={`Estado de ${r.medibles} indicadores con meta: ${descripcion}`}
      className={`flex w-full ${alto} gap-px overflow-hidden rounded-[3px] bg-[#E6E9EF]`}
    >
      {r.medibles > 0 && SEGMENTOS.map(s => {
        const n = r[s.clave]
        if (!n) return null
        return (
          <div
            key={s.clave}
            className={ESTADOS[s.estado].barra}
            style={{ width: `${(100 * n) / r.medibles}%` }}
          />
        )
      })}
    </div>
  )
}

export function Leyenda({ r }: { r: Resumen }) {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2">
      {SEGMENTOS.map(s => (
        <li key={s.clave} className="flex items-center gap-2 text-sm text-[#556072]">
          <Marcador clase={ESTADOS[s.estado].punto} />
          <span>{s.rotulo}</span>
          <span className="font-semibold tabular-nums text-[#192031]">{r[s.clave]}</span>
        </li>
      ))}
    </ul>
  )
}

/** Avance de un indicador contra su meta. Se topa en 100 %: pasarse no ensancha la barra. */
export function BarraAvance({ razon, estado, alto = 'h-1.5' }: { razon: number | null; estado: keyof typeof ESTADOS; alto?: string }) {
  const ancho = razon === null ? 0 : Math.min(100, Math.max(0, razon * 100))
  return (
    <div className={`${alto} w-full overflow-hidden rounded-[3px] bg-[#E6E9EF]`} aria-hidden="true">
      <div className={`h-full ${ESTADOS[estado].barra}`} style={{ width: `${ancho}%` }} />
    </div>
  )
}
