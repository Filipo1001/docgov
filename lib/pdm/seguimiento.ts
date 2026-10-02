/**
 * El seguimiento por AÑOS: los tipos y las cuentas puras (Fase B, rehecha en la migración 057).
 *
 * Sin `server-only` ni `'use client'`: lo usan el servidor (al armar los datos), el navegador
 * (al pintarlos) y las pruebas. Aquí no se lee nada de ninguna parte.
 *
 * ── Las reglas, tal como las decidió la Alcaldía ─────────────────────────
 *
 *   · La unidad es el AÑO del plan (2024 a 2027). Cada indicador tiene una meta por año y cada año se
 *     mide contra la suya: lo que se reporta es el avance de ESE año. No hay cortes que alguien tenga
 *     que abrir: quien tiene un indicador a su cargo reporta cuando haya algo que reportar.
 *   · Se puede reportar varias veces en el año (cada reporte lleva su fecha); lo vigente del año es el
 *     último. 2024 y 2025 quedan abiertos para cargar el histórico; un año que no ha empezado (2027 hasta
 *     el 1 de enero) todavía no se reporta. La base impone esto, no solo la pantalla.
 *   · Siempre con evidencia. Un reporte nunca se reescribe: si el último está sin cerrar (pendiente o
 *     devuelto), el siguiente es su corrección y dice por qué; si el último está aprobado, el siguiente es
 *     un avance nuevo.
 *   · El supervisor (la secretaría de la dependencia) VALIDA: aprueba o devuelve. Nadie valida lo suyo.
 *     SOLO LO APROBADO CUENTA en el cumplimiento; mientras tanto se ve como «reportado, sin validar».
 *   · Control Interno comenta y no cambia nada.
 */

/** Cómo va un reporte: esperando al supervisor, aprobado o devuelto con un comentario. */
export type EstadoReporte = 'pendiente' | 'aprobado' | 'devuelto'

/** Los años del plan «Por Amor a Fredonia»: cada uno es una tarjeta en «Mi trabajo». */
export const ANIOS_PLAN = [2024, 2025, 2026, 2027] as const
export type AnioPlan = (typeof ANIOS_PLAN)[number]

export const esAnioPlan = (v: unknown): v is AnioPlan => ANIOS_PLAN.includes(v as AnioPlan)

/** El año de una fecha `YYYY-MM-DD`. */
export const anioDeFecha = (iso: string): number => Number(iso.slice(0, 4))

/** El año que se muestra al entrar: el de hoy, o el del plan más cercano si hoy queda fuera de él. */
export function anioPorDefecto(anioActual: number): AnioPlan {
  const primero = ANIOS_PLAN[0]
  const ultimo = ANIOS_PLAN[ANIOS_PLAN.length - 1]
  return (Math.min(Math.max(anioActual, primero), ultimo)) as AnioPlan
}

/** El año de un parámetro de la dirección, si es del plan; si no, el de por defecto. Nada de lo que venga se cree. */
export function anioDeParametro(valor: string | undefined, anioActual: number): AnioPlan {
  const n = valor !== undefined && /^\d{4}$/.test(valor) ? Number(valor) : NaN
  return esAnioPlan(n) ? n : anioPorDefecto(anioActual)
}

/** ¿Ya empezó este año? Antes de que empiece no se puede reportar (la base lo exige igual). */
export const anioIniciado = (anio: number, anioActual: number): boolean => anio <= anioActual

export type EstadoDelAnio = 'terminado' | 'en_curso' | 'proximo'

export function estadoDelAnio(anio: number, anioActual: number): EstadoDelAnio {
  return anio < anioActual ? 'terminado' : anio === anioActual ? 'en_curso' : 'proximo'
}

export const ROTULO_ESTADO_ANIO: Record<EstadoDelAnio, string> = {
  terminado: 'Terminó',
  en_curso: 'En curso',
  proximo: 'Próximo',
}

/** Lo que las pantallas necesitan saber del tiempo: en qué año calendario estamos (hora de Colombia). */
export interface Seguimiento {
  anioActual: number
}

/** El reporte VIGENTE de un indicador en un año: el último que se hizo en él. */
export interface ReporteAnio {
  reporteId: string
  valor: number
  estado: EstadoReporte
  autorId: string | null
  autorNombre: string
  /** Instante ISO de cuando se hizo. */
  creado: string
  nEvidencias: number
  /** Es la corrección de uno anterior. */
  esCorreccion: boolean
  /** Lo que escribió quien devolvió (o aprobó con comentario). */
  validacionComentario: string | null
  validadorNombre: string | null
}

/** Dónde está un indicador respecto al año: a quién le falta qué. */
export type SituacionAnio = 'falta' | EstadoReporte

export interface EstadoEnAnio {
  situacion: SituacionAnio
  reporte: ReporteAnio | null
}

export const SITUACIONES: Record<SituacionAnio, { rotulo: string; punto: string }> = {
  // «Falta reportar» no es un estado sino un pendiente: se dibuja con un marcador hueco (ver `ui.tsx`).
  falta:     { rotulo: 'Falta reportar',          punto: 'bg-[#192031]' },
  pendiente: { rotulo: 'Reportado · sin validar', punto: 'bg-[#B7791F]' },
  devuelto:  { rotulo: 'Devuelto',                punto: 'bg-[#B42318]' },
  aprobado:  { rotulo: 'Aprobado',                punto: 'bg-[#2E7D5B]' },
}

/**
 * Lo que le toca hacer a cada quien con un indicador en un año:
 * reportar (le falta, o se lo devolvieron) o esperar la validación.
 */
export const requiereReporte = (s: SituacionAnio | undefined | null) => s === 'falta' || s === 'devuelto'

/**
 * Qué situación tiene un indicador en un año, o `null` si en ese año no se espera nada de él.
 *
 * Si ya hay un reporte, la situación sale del reporte, siempre. Si no lo hay, solo «falta» cuando se espera
 * uno: el año ya empezó, alguien tiene el indicador a su cargo y el indicador tiene meta ese año (con
 * meta 0 o sin meta no hay nada que cumplir ni que reportar).
 */
export function situacionEn(
  esperaReporte: boolean,
  ultimo: { estado: EstadoReporte } | undefined | null,
): SituacionAnio | null {
  if (ultimo) return ultimo.estado
  return esperaReporte ? 'falta' : null
}

export interface ResumenAnio {
  /** Indicadores de los que se espera algo en el año: los que tienen situación. */
  esperados: number
  /** Los que no tienen situación: nadie los lleva, el año no empieza o no tienen meta. */
  sinObligacion: number
  faltan: number
  porValidar: number
  aprobados: number
  devueltos: number
}

export const RESUMEN_ANIO_VACIO: ResumenAnio = {
  esperados: 0, sinObligacion: 0, faltan: 0, porValidar: 0, aprobados: 0, devueltos: 0,
}

/**
 * La cuenta de un año. `situaciones` trae una entrada por indicador: `null` si en ese año no se espera nada
 * de él, y si no, dónde va.
 */
export function resumirAnio(situaciones: (SituacionAnio | null)[]): ResumenAnio {
  const r = { ...RESUMEN_ANIO_VACIO }
  for (const s of situaciones) {
    if (s === null) { r.sinObligacion++; continue }
    r.esperados++
    if (s === 'falta') r.faltan++
    else if (s === 'pendiente') r.porValidar++
    else if (s === 'aprobado') r.aprobados++
    else r.devueltos++
  }
  return r
}
