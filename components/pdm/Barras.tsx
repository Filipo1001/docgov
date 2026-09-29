'use client'

/**
 * Barras del tablero.
 *
 * Nunca comunican solo con color: cada segmento tiene su cifra escrita en la
 * leyenda, y la barra entera lleva una descripción para lector de pantalla.
 * Quien no distingue el naranja del rojo lee «3 atrasados, 2 críticos».
 */

import { ESTADOS, type Resumen } from '@/lib/pdm/plan'

const SEGMENTOS = [
  { clave: 'cumplidos',  estado: 'cumplido',    rotulo: 'Cumplidos' },
  { clave: 'enRuta',     estado: 'en_ruta',     rotulo: 'En ruta' },
  { clave: 'atrasados',  estado: 'atrasado',    rotulo: 'Atrasados' },
  { clave: 'criticos',   estado: 'critico',     rotulo: 'Críticos' },
  { clave: 'sinReporte', estado: 'sin_reporte', rotulo: 'Sin reporte' },
] as const

export function BarraEstados({ r, alto = 'h-3' }: { r: Resumen; alto?: string }) {
  const descripcion = SEGMENTOS.map(s => `${r[s.clave]} ${s.rotulo.toLowerCase()}`).join(', ')
  return (
    <div
      role="img"
      aria-label={`Estado de ${r.medibles} indicadores con meta 2026: ${descripcion}`}
      className={`flex w-full ${alto} overflow-hidden rounded-full bg-gray-100`}
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
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {SEGMENTOS.map(s => (
        <li key={s.clave} className="flex items-center gap-2 text-sm text-gray-600">
          <span className={`h-2.5 w-2.5 rounded-full ${ESTADOS[s.estado].punto}`} />
          <span>{s.rotulo}</span>
          <span className="font-semibold tabular-nums text-gray-900">{r[s.clave]}</span>
        </li>
      ))}
    </ul>
  )
}

/** Avance de un indicador contra su meta. Se topa en 100 %: pasarse no ensancha la barra. */
export function BarraAvance({ razon, estado }: { razon: number | null; estado: keyof typeof ESTADOS }) {
  const ancho = razon === null ? 0 : Math.min(100, Math.max(0, razon * 100))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
      <div className={`h-full rounded-full ${ESTADOS[estado].barra}`} style={{ width: `${ancho}%` }} />
    </div>
  )
}
