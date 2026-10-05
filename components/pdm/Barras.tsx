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
import { PARTES, descripcionDeReportes, type CuentaDeAnio, type ParteDeReportes } from '@/lib/pdm/graficos'
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

/**
 * Avance de un indicador contra su meta. Se topa en 100 %: pasarse no ensancha la barra.
 *
 * Se estira con `scaleX` (solo `transform`, que compone la GPU) y no con `width`: al cambiar de año o llegar un
 * avance validado la barra CRECE o ENCOGE hasta su sitio en vez de saltar, sin mover nada a su alrededor.
 */
export function BarraAvance({ razon, estado, alto = 'h-1.5' }: { razon: number | null; estado: keyof typeof ESTADOS; alto?: string }) {
  const ancho = razon === null ? 0 : Math.min(100, Math.max(0, razon * 100))
  return (
    <div className={`${alto} w-full overflow-hidden rounded-[3px] bg-[#E6E9EF]`} aria-hidden="true">
      <div
        className={`h-full w-full origin-left transition-[transform,background-color] duration-500 ease-out motion-reduce:transition-none ${ESTADOS[estado].barra}`}
        style={{ transform: `scaleX(${ancho / 100})` }}
      />
    </div>
  )
}

// ─── Los gráficos del Resumen (ver `lib/pdm/graficos.ts`) ─────────────────────

/** El avance promedio, en la tinta: es una cantidad, no un estado, y el color queda para los estados. */
export function BarraProgreso({ valor, alto = 'h-1.5' }: { valor: number | null; alto?: string }) {
  const ancho = valor === null ? 0 : Math.min(100, Math.max(0, valor))
  // Un avance real pero diminuto (0,3 %) no puede desaparecer: con 1,5 % de la pista ya se ve que no es cero.
  const visible = valor !== null && valor > 0 ? Math.max(ancho, 1.5) : ancho
  return (
    <span className={`block ${alto} w-full overflow-hidden rounded-[3px] bg-[#E6E9EF]`} aria-hidden="true">
      <span
        className="block h-full w-full origin-left bg-[#192031] transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${visible / 100})` }}
      />
    </span>
  )
}

/**
 * Cómo se dibuja cada punto del reporte. «Falta reportar» no se pinta: es lo que queda de la pista, lo que todavía no
 * se ha hecho. «Sin responsable» va rayado: no es un estado del reporte sino la ausencia de quien lo haga.
 */
const HACHURA_BARRA = 'bg-[repeating-linear-gradient(135deg,#AEB6C4_0_2px,#EEF0F4_2px_4px)]'
const HACHURA_MARCA = 'border border-[#98A2B3] bg-[repeating-linear-gradient(135deg,#98A2B3_0_1.5px,#FFFFFF_1.5px_3px)]'

const RELLENO: Record<ParteDeReportes, string> = {
  aprobados: 'bg-[#2E7D5B]',
  porValidar: 'bg-[#B7791F]',
  devueltos: 'bg-[#B42318]',
  faltan: '',
  sinResponsable: HACHURA_BARRA,
}

/** El cuadradito de cada punto, para la leyenda y para las frases: nunca va sin su palabra. */
export function MarcadorDeParte({ parte }: { parte: ParteDeReportes }) {
  if (parte === 'faltan') return <Marcador clase="" hueco />
  if (parte === 'sinResponsable') return <Marcador clase={HACHURA_MARCA} />
  return <Marcador clase={RELLENO[parte]} />
}

/**
 * Los indicadores con meta de un año, repartidos en los cinco puntos del reporte, a lo ancho de la pista: cada
 * segmento mide lo que su cifra dice, y la suma es SIEMPRE el total con meta (ver `cuentaDeAnio`).
 *
 * `flex-grow` y no `width`: al cambiar de año los segmentos se acomodan en vez de saltar. Todos se pintan siempre
 * (los vacíos miden cero) para que cada uno tenga a quién animar. Un segmento con algo mide al menos 2 px: un
 * indicador entre doscientos no puede desaparecer de la barra, y la leyenda dice la cifra exacta.
 *
 * `oculta`: donde una leyenda al lado ya dice todas las cifras, la barra no las repite al lector de pantalla.
 */
export function BarraReportes({ c, alto = 'h-1.5', oculta = false }: { c: CuentaDeAnio; alto?: string; oculta?: boolean }) {
  return (
    <span
      {...(oculta ? { 'aria-hidden': true } : { role: 'img', 'aria-label': descripcionDeReportes(c) })}
      className={`flex w-full gap-px overflow-hidden rounded-[3px] bg-[#E6E9EF] ${alto}`}
    >
      {PARTES.map(p => (
        <span
          key={p}
          className={`block h-full transition-[flex-grow] duration-500 ease-out motion-reduce:transition-none ${RELLENO[p]}`}
          style={{ flexGrow: c[p], flexBasis: 0, minWidth: c[p] > 0 ? 2 : 0 }}
        />
      ))}
    </span>
  )
}
