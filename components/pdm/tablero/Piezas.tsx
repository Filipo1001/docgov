'use client'

/**
 * Las piezas que el tablero reparte entre sus paneles: el contador animado, las pistas apiladas y las leyendas.
 *
 * Todo lo que se dibuja con una cifra (un tramo de anillo, un segmento de pista, un número) parte de CERO la primera vez y viaja al
 * valor: cuando cambia el año o la medida, el dibujo se acomoda desde donde estaba en vez de saltar. Con `prefers-reduced-motion`
 * los tramos se pintan de una vez (las transiciones se apagan) y los números llegan sin contar.
 */

import { useEffect, useState } from 'react'
import { ROTULO_DE_PARTE } from '@/lib/pdm/graficos'
import { ESTADOS_DE_REPORTE, valorDeTramo, type CifrasDeAnio, type EstadoDeReporte, type TramoDeCumplimiento } from '@/lib/pdm/tablero'
import { MarcadorDeParte } from '../Barras'
import { TRAMOS } from '../cumplimiento-tema'
import { useContador } from './useContador'

export const fmt = (n: number): string => Math.round(n).toLocaleString('es-CO')

/** `false` en el primer pintado y `true` un instante después: lo que depende de esto parte de cero y viaja a su valor. */
export function useListo(demora = 40): boolean {
  const [listo, setListo] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setListo(true), demora)
    return () => clearTimeout(id)
  }, [demora])
  return listo
}

/** Verdadero solo mientras entra el tablero: el escalonado de las barras no debe retrasar los cambios de año. */
function useEntrando(ms = 1400): boolean {
  const [entrando, setEntrando] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setEntrando(false), ms)
    return () => clearTimeout(id)
  }, [ms])
  return entrando
}

export function Contador({ valor, className = '' }: { valor: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{fmt(useContador(valor))}</span>
}

/** El cuadradito de un tramo del cumplimiento. Nunca va solo: lo acompaña la palabra. */
export function MarcaTramo({ tramo }: { tramo: TramoDeCumplimiento }) {
  const color = TRAMOS.find(t => t.clave === tramo)!.color
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
}

// ─── La pista apilada ─────────────────────────────────────────────────────────

const HACHURA = 'bg-[repeating-linear-gradient(135deg,#AEB6C4_0_2px,#EEF0F4_2px_4px)]'
/** El relleno de cada estado de reporte. «Falta reportar» no pinta nada: deja ver la pista, como en el resto del módulo. */
export const RELLENO_ESTADO: Record<EstadoDeReporte, string> = {
  aprobados: 'bg-[#2E7D5B]', porValidar: 'bg-[#B7791F]', devueltos: 'bg-[#B42318]', faltan: '', sinResponsable: HACHURA,
}

export interface SegmentoDePista {
  clave: string
  valor: number
  /** Color de fondo (los tramos del cumplimiento). */
  color?: string
  /** Clases de relleno (los estados de reporte). */
  clase?: string
  titulo: string
}

/**
 * Segmentos a lo ancho de una pista, cada uno del largo de su cifra. `flex-grow` y no `width`: al cambiar los valores los segmentos
 * se acomodan en vez de saltar. Un segmento con algo mide al menos 2 px: un indicador entre cien no puede desaparecer de la barra.
 */
export function PistaApilada({ segmentos, alta = false, descripcion, escalon = 0 }: {
  segmentos: SegmentoDePista[]
  alta?: boolean
  descripcion: string
  /** Retraso, en pasos, con que entra esta pista (para que una lista de filas se dibuje en cascada). */
  escalon?: number
}) {
  const listo = useListo()
  const entrando = useEntrando()
  return (
    <span role="img" aria-label={descripcion} className={`flex w-full gap-px overflow-hidden rounded-[3px] bg-[#E6E9EF] ${alta ? 'h-3.5' : 'h-2.5'}`}>
      {segmentos.map((s, k) => (
        <span
          key={s.clave}
          title={s.titulo}
          className={`block h-full transition-[flex-grow] duration-700 ease-out motion-reduce:transition-none ${s.clase ?? ''}`}
          style={{
            flexGrow: listo ? s.valor : 0, flexBasis: 0, minWidth: listo && s.valor > 0 ? 2 : 0, backgroundColor: s.color,
            transitionDelay: entrando ? `${escalon * 70 + k * 60}ms` : '0ms',
          }}
        />
      ))}
    </span>
  )
}

/** Los tres tramos del cumplimiento como segmentos de pista. */
export function segmentosDeCumplimiento(c: CifrasDeAnio): SegmentoDePista[] {
  return TRAMOS.map(t => ({ clave: t.clave, valor: valorDeTramo(c, t.clave), color: t.color, titulo: `${t.etiqueta}: ${fmt(valorDeTramo(c, t.clave))} de ${fmt(c.conMeta)}` }))
}

/** Los cinco estados de reporte como segmentos de pista. */
export function segmentosDeReportes(c: CifrasDeAnio): SegmentoDePista[] {
  return ESTADOS_DE_REPORTE.map(e => ({ clave: e, valor: c[e], clase: RELLENO_ESTADO[e], titulo: `${ROTULO_DE_PARTE[e]}: ${fmt(c[e])} de ${fmt(c.conMeta)}` }))
}

export function descripcionDeCumplimiento(c: CifrasDeAnio): string {
  return TRAMOS.map(t => `${fmt(valorDeTramo(c, t.clave))} ${t.etiqueta.toLowerCase()}`).join(', ')
}

export function descripcionDeReportes(c: CifrasDeAnio): string {
  return ESTADOS_DE_REPORTE.map(e => `${fmt(c[e])} ${ROTULO_DE_PARTE[e].toLowerCase()}`).join(', ')
}

// ─── Leyendas ─────────────────────────────────────────────────────────────────

/** Los estados de reporte en una línea que se acomoda, cada uno con su marcador, su palabra y su cifra. */
export function LeyendaDeEstados({ c }: { c: CifrasDeAnio }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#556072]">
      {ESTADOS_DE_REPORTE.map(e => (
        <li key={e} className="inline-flex items-center gap-1.5">
          <MarcadorDeParte parte={e} />
          {ROTULO_DE_PARTE[e]}
          <Contador valor={c[e]} className="font-semibold text-[#192031]" />
        </li>
      ))}
    </ul>
  )
}

/** La leyenda de la medida elegida (sin cifras: las filas ya las dicen). */
export function LeyendaDeMedida({ medida }: { medida: 'cumplimiento' | 'reportes' }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#556072]">
      {medida === 'cumplimiento'
        ? TRAMOS.map(t => <li key={t.clave} className="inline-flex items-center gap-1.5"><MarcaTramo tramo={t.clave} />{t.etiqueta}</li>)
        : ESTADOS_DE_REPORTE.map(e => <li key={e} className="inline-flex items-center gap-1.5"><MarcadorDeParte parte={e} />{ROTULO_DE_PARTE[e]}</li>)}
    </ul>
  )
}
