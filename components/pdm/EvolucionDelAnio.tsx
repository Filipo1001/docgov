/**
 * Cómo fue creciendo lo reportado en un año: un punto por reporte vigente, unidos en escalón (cada reporte dice el avance
 * del año hasta ese día y vale hasta el siguiente), y la meta como línea de trazos (ver `serieDelAnio`).
 *
 * Solo tiene sentido con dos o más puntos: con uno no hay evolución, y lo que dice ya lo dicen la barra del año y la
 * trazabilidad. Quien monta decide; aquí no se vuelve a comprobar.
 *
 * El marcador de cada punto lleva el color de su estado y, abajo, una leyenda con la palabra de cada estado que aparece:
 * el color solo no dice nada. Las líneas son SVG estirado (`non-scaling-stroke`: el trazo no se deforma) y los puntos y
 * los rótulos son HTML posicionado en porcentajes, para que el texto no se estire con el ancho.
 *
 * Es de presentación pura. El eje del tiempo es el de verdad: dos reportes con un mes de por medio no quedan pegados.
 */

import { fmt } from '@/lib/pdm/plan'
import type { PuntoDeSerie } from '@/lib/pdm/graficos'
import type { EstadoReporte } from '@/lib/pdm/seguimiento'
import { PALABRA_DE } from '@/lib/pdm/semaforo'
import { Marcador } from './ui'

const COLOR: Record<EstadoReporte, string> = { aprobado: 'bg-[#2E7D5B]', pendiente: 'bg-[#B7791F]', devuelto: 'bg-[#B42318]' }

const fecha = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).replace('.', '')

export default function EvolucionDelAnio({ puntos, meta, anio }: { puntos: PuntoDeSerie[]; meta: number | null; anio: number }) {
  if (puntos.length < 2) return null

  const t0 = puntos[0].t
  const t1 = puntos[puntos.length - 1].t
  // Con todos los reportes en el mismo instante no hay eje de tiempo: se reparten parejo.
  const x = (p: PuntoDeSerie, k: number) =>
    t1 === t0 ? 6 + (88 * k) / (puntos.length - 1) : 6 + (88 * (p.t - t0)) / (t1 - t0)
  const tope = Math.max(meta ?? 0, ...puntos.map(p => p.valor), 1) * 1.12
  const y = (v: number) => 100 - (100 * v) / tope
  const xs = puntos.map(x)
  const ys = puntos.map(p => y(p.valor))
  const escalon = xs.map((px, k) => (k === 0 ? `M ${px} ${ys[0]}` : `H ${px} V ${ys[k]}`)).join(' ')
  const estados = [...new Set(puntos.map(p => p.estado))]
  const conMeta = meta !== null && meta > 0
  // Con pocos puntos cada uno lleva su cifra; con muchos, solo el último (las demás se estorbarían).
  const rotular = (k: number) => puntos.length <= 6 || k === puntos.length - 1

  const descripcion = `Avance reportado en ${anio}: ${puntos.map(p => `${fmt(p.valor)} el ${fecha(p.t)} (${PALABRA_DE[p.estado].toLowerCase()})`).join(', ')}${conMeta ? `. Meta del año: ${fmt(meta)}` : ''}`

  return (
    <figure className="mb-4">
      <figcaption className="mb-1 text-xs font-medium text-[#556072]">Avance reportado en {anio}</figcaption>
      <div role="img" aria-label={descripcion} className="relative mx-1 mt-5 h-28">
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <line x1="0" y1="100" x2="100" y2="100" stroke="#DCE0E8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {conMeta && (
            <line x1="0" y1={y(meta)} x2="100" y2={y(meta)} stroke="#667085" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          )}
          <path d={escalon} fill="none" stroke="#192031" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {conMeta && (
          <span className="absolute left-0 -translate-y-full pb-0.5 text-[11px] font-medium leading-none tabular-nums text-[#556072]" style={{ top: `${y(meta)}%` }}>
            Meta {fmt(meta)}
          </span>
        )}

        {puntos.map((p, k) => (
          <span key={k} className="absolute" style={{ left: `${xs[k]}%`, top: `${ys[k]}%` }}>
            <span
              title={`${fmt(p.valor)} · ${fecha(p.t)} · ${PALABRA_DE[p.estado]}`}
              className={`absolute block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border-2 border-white ring-1 ring-[#192031]/15 ${COLOR[p.estado]}`}
            />
            {rotular(k) && (
              <span className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap pb-2 text-[11px] font-semibold leading-none tabular-nums text-[#192031]">
                {fmt(p.valor)}
              </span>
            )}
          </span>
        ))}
      </div>

      <div className="mx-1 mt-2 flex justify-between text-[11px] leading-none tabular-nums text-[#667085]" aria-hidden>
        <span>{fecha(t0)}</span>
        <span>{fecha(t1)}</span>
      </div>

      <ul className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#556072]">
        {estados.map(e => (
          <li key={e} className="inline-flex items-center gap-1.5"><Marcador clase={COLOR[e]} />{PALABRA_DE[e]}</li>
        ))}
        {conMeta && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0 w-4 border-t border-dashed border-[#667085]" />Meta
          </li>
        )}
      </ul>
    </figure>
  )
}
