/**
 * Lo que lleva el INFORME en PDF del tablero del secretario: las mismas cuentas del tablero (`lib/pdm/tablero.ts`), reunidas en una
 * sola estructura plana que el documento solo pinta. Aquí no hay nada de PDF: es lo que se prueba.
 *
 * Reglas de lo que NO lleva:
 *   · De las otras secretarías, solo números (igual que el tablero).
 *   · Nombres de personas, solo si quien lo pide marca «incluir mi equipo». Por defecto el informe se puede compartir con quien sea:
 *     no trae a nadie por su nombre. Y aun con el equipo, no lleva el identificador de la persona, solo lo que se imprime.
 *   · Nada de ranking: las secretarías van por tamaño y el equipo por nombre, igual que en pantalla.
 */

import type { PersonaDirectorio } from './personas'
import type { Indicador } from './plan'
import {
  atencionDe, comparacionDelAnio, equipoDe, lecturaDelTablero, propiaPorAnio, sectoresDe, sumarCifras,
  type CifrasDeAnio, type DatosDelTablero, type FilaDeComparacion, type ItemDeAtencion, type MedidaDelTablero, type SectorDeCifras, type Trozo,
} from './tablero'

/** Una persona tal como se imprime: lo que se ve, sin identificadores. */
export interface PersonaDelInforme {
  nombre: string
  indicadores: number
  porReportar: number
  porValidar: number
  devueltos: number
  aprobados: number
  sinAcceso: boolean
}

/** Cuántos sectores caben en la hoja (los de más indicadores; el tablero en pantalla trae todos). */
export const SECTORES_EN_INFORME = 6

export interface DatosDelInforme {
  secretaria: string
  anio: number
  anioActual: number
  corte: string
  medida: MedidaDelTablero
  lectura: { titular: Trozo[]; detalle: string }
  cifras: CifrasDeAnio
  /** Todas las secretarías en el año (la propia marcada), o `null` si la base no las entregó. */
  comparacion: FilaDeComparacion[] | null
  /** La suma del plan, o `null` si no hay comparación de donde sacarla. */
  plan: CifrasDeAnio | null
  atencion: ItemDeAtencion[]
  /** Los sectores con más indicadores (hasta `SECTORES_EN_INFORME`), por tamaño, y cuántos tiene la secretaría en total. */
  sectores: SectorDeCifras[]
  sectoresTotal: number
  /** Las personas con nombre, solo si se pidió; si no, `null` (el informe no tiene esa hoja). */
  equipo: PersonaDelInforme[] | null
}

export function armarInforme(a: {
  datos: DatosDelTablero
  indicadores: Indicador[]
  /** Las personas con indicadores en esta secretaría. */
  personas: PersonaDirectorio[]
  /** Falso si el directorio no se pudo leer: entonces ni la hoja del equipo ni «sin acceso» dicen nada falso. */
  personasLeidas: boolean
  anio: number
  medida: MedidaDelTablero
  conEquipo: boolean
}): DatosDelInforme {
  const { datos } = a
  const propia = propiaPorAnio(datos.secretaria, a.indicadores, datos.anioActual)
  const cifras = propia.porAnio[a.anio]
  const comparacion = datos.otras ? comparacionDelAnio(datos.otras, propia, a.anio) : null
  const equipo = equipoDe(a.indicadores, a.personas, a.anio, datos.anioActual)
  const antiguedad = datos.antiguedadPorAnio[a.anio] ?? null
  const sectores = sectoresDe(a.indicadores, a.anio, datos.anioActual)
  return {
    secretaria: datos.secretaria,
    anio: a.anio,
    anioActual: datos.anioActual,
    corte: datos.corte,
    medida: a.medida,
    lectura: lecturaDelTablero(cifras, datos.anioActual, antiguedad),
    cifras,
    comparacion,
    plan: comparacion ? sumarCifras(a.anio, comparacion.map(f => f.cifras)) : null,
    atencion: atencionDe(cifras, antiguedad, a.personasLeidas ? equipo.filter(p => p.sinAcceso).length : null),
    sectores: sectores.slice(0, SECTORES_EN_INFORME),
    sectoresTotal: sectores.length,
    equipo: a.conEquipo && a.personasLeidas
      ? equipo.map(({ nombre, indicadores, porReportar, porValidar, devueltos, aprobados, sinAcceso }) => ({ nombre, indicadores, porReportar, porValidar, devueltos, aprobados, sinAcceso }))
      : null,
  }
}

/** Lo que el informe dice del plan de la Alcaldía, en una frase (o por qué todavía no hay cifra). */
export function lecturaDelPlan(plan: CifrasDeAnio): string {
  if (plan.conMeta === 0) return `En ${plan.anio} ningún indicador del plan tiene meta.`
  if (plan.conAvance === 0) return `Todavía no hay avances validados en el plan: ${plan.conMeta} indicadores con meta en ${plan.anio}.`
  return `${plan.alcanzaron} de ${plan.conMeta} indicadores con meta del plan ya ${plan.alcanzaron === 1 ? 'la alcanzó' : 'la alcanzaron'}.`
}

/** El nombre del archivo: `tablero-secretaria-general-de-gobierno-2026.pdf`. Sin tildes ni signos: lo abre cualquier sistema. */
export function nombreDeArchivoDelInforme(secretaria: string, anio: number): string {
  const limpio = secretaria.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `tablero-${limpio || 'secretaria'}-${anio}.pdf`
}

/** Las iniciales de una persona para su círculo (dos letras como mucho). */
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return '?'
  const a = palabras[0][0]
  const b = palabras.length > 1 ? palabras[palabras.length - 1][0] : ''
  return (a + b).toLocaleUpperCase('es-CO')
}
