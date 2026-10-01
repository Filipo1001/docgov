/**
 * El seguimiento por cortes: los tipos y las cuentas puras (Fase B).
 *
 * Sin `server-only` ni `'use client'`: lo usan el servidor (al armar los datos), el navegador
 * (al pintarlos) y las pruebas. Aquí no se lee nada de ninguna parte.
 *
 * ── Las reglas, tal como las decidió la Alcaldía ─────────────────────────
 *
 *   · Un CORTE es el momento en que se reporta. Hay a lo sumo uno ABIERTO; se crean, abren y
 *     cierran a mano (no hay frecuencia fija en el sistema: está por definir con Control Interno).
 *   · Quien tiene un indicador a su cargo REPORTA su avance en el corte abierto, siempre con
 *     evidencia. Un reporte nunca se reescribe: corregirlo es hacer otro, diciendo por qué.
 *   · El supervisor (la secretaría de la dependencia) VALIDA: aprueba o devuelve. Nadie valida lo
 *     suyo. SOLO LO APROBADO CUENTA en el cumplimiento; mientras tanto se ve como «reportado, sin
 *     validar».
 *   · Control Interno comenta y no cambia nada.
 *   · Qué significa el valor que se reporta (avance del año o acumulado) es un dato del plan que
 *     se define a mano (`avance_modo`); mientras no se defina, el cumplimiento es provisional.
 */

export type AvanceModo = 'acumulado' | 'anual'

/** Cómo va un reporte: esperando al supervisor, aprobado o devuelto con un comentario. */
export type EstadoReporte = 'pendiente' | 'aprobado' | 'devuelto'

export interface Corte {
  id: string
  nombre: string
  /** `YYYY-MM-DD`: la fecha de corte, sin hora ni zona (es una fecha, no un instante). */
  fecha: string
  abierto: boolean
}

export interface AjustesPlan {
  /** `null`: por definir. */
  avanceModo: AvanceModo | null
  /** Texto libre, solo informativo. */
  periodicidad: string | null
}

export interface Seguimiento {
  ajustes: AjustesPlan
  /** Del más reciente al más antiguo (por fecha de corte). */
  cortes: Corte[]
  /** El corte donde hoy se reporta, si hay uno. */
  abierto: Corte | null
}

export const SIN_SEGUIMIENTO: Seguimiento = {
  ajustes: { avanceModo: null, periodicidad: null },
  cortes: [],
  abierto: null,
}

/** El reporte VIGENTE de un indicador en un corte: la última versión de su cadena de correcciones. */
export interface ReporteCorte {
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

/** Dónde está un indicador respecto al corte: a quién le falta qué. */
export type SituacionCorte = 'falta' | EstadoReporte

export interface EstadoEnCorte {
  situacion: SituacionCorte
  reporte: ReporteCorte | null
}

export const SITUACIONES: Record<SituacionCorte, { rotulo: string; punto: string }> = {
  // «Falta reportar» no es un estado sino un pendiente: se dibuja con un marcador hueco (ver `ui.tsx`).
  falta:     { rotulo: 'Falta reportar',          punto: 'bg-[#192031]' },
  pendiente: { rotulo: 'Reportado · sin validar', punto: 'bg-[#B7791F]' },
  devuelto:  { rotulo: 'Devuelto',                punto: 'bg-[#B42318]' },
  aprobado:  { rotulo: 'Aprobado',                punto: 'bg-[#2E7D5B]' },
}

/**
 * Lo que le toca hacer a cada quien con un indicador en el corte abierto:
 * reportar (le falta, o se lo devolvieron) o esperar la validación.
 */
export const requiereReporte = (s: SituacionCorte | undefined) => s === 'falta' || s === 'devuelto'

// ─── El criterio de avance ────────────────────────────────────────────────────

export interface DescripcionModo {
  /** Para el selector de Ajustes. */
  titulo: string
  /** Contra qué meta se mide, dicho en una frase corta. */
  meta: string
  /** Qué hay que entender. */
  nota: string
}

export const MODOS: Record<AvanceModo | 'por_definir', DescripcionModo> = {
  por_definir: {
    titulo: 'Por definir',
    meta: 'meta 2026',
    nota: 'El cumplimiento se muestra como provisional y se mide contra la meta de 2026, sin decidir si lo reportado es del año o acumulado.',
  },
  anual: {
    titulo: 'Avance del año',
    meta: 'meta 2026',
    nota: 'Cada reporte dice cuánto se ha avanzado en 2026 y se mide contra la meta de este año.',
  },
  acumulado: {
    titulo: 'Avance acumulado',
    meta: 'meta acumulada a 2026',
    nota: 'Cada reporte dice cuánto se lleva desde 2024 y se mide contra la suma de las metas de 2024 a 2026.',
  },
}

export const claveModo = (m: AvanceModo | null): AvanceModo | 'por_definir' => m ?? 'por_definir'

// ─── Fechas de corte ──────────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Una fecha `YYYY-MM-DD` es válida si existe en el calendario (no 31 de febrero). */
export function esFechaValida(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = FECHA.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/** «31 de octubre de 2026». Se arma con los números, sin pasar por `Date` local: una fecha no tiene huso. */
export function fechaLarga(iso: string): string {
  const m = FECHA.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`
}

/** «31 oct 2026». */
export function fechaCorta(iso: string): string {
  const m = FECHA.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1].slice(0, 3)} ${m[1]}`
}

/** El nombre que se propone para un corte si quien lo crea no escribe uno. */
export const sugerirNombreCorte = (fechaIso: string) => `Corte a ${fechaLarga(fechaIso)}`

// ─── Cuentas por corte ────────────────────────────────────────────────────────

/** Qué situación tiene un indicador en un corte, o `null` si nadie puede reportarlo (sin responsable). */
export function situacionEn(sinResponsable: boolean, vigente: { estado: EstadoReporte } | undefined | null): SituacionCorte | null {
  if (vigente) return vigente.estado
  return sinResponsable ? null : 'falta'
}

export interface ResumenCorte {
  /** Indicadores que alguien tiene a su cargo (los únicos que pueden reportar). */
  conResponsable: number
  sinResponsable: number
  faltan: number
  porValidar: number
  aprobados: number
  devueltos: number
}

export const RESUMEN_CORTE_VACIO: ResumenCorte = {
  conResponsable: 0, sinResponsable: 0, faltan: 0, porValidar: 0, aprobados: 0, devueltos: 0,
}

/**
 * La cuenta de un corte. `situaciones` trae una entrada por indicador: `null` si nadie lo tiene
 * a su cargo (y entonces nadie puede reportarlo), y si no, dónde va. Que alguien con un indicador
 * sin responsable lo haya reportado antes de que lo quitaran sí cuenta: la situación sale del reporte.
 */
export function resumirCorte(situaciones: (SituacionCorte | null)[]): ResumenCorte {
  const r = { ...RESUMEN_CORTE_VACIO }
  for (const s of situaciones) {
    if (s === null) { r.sinResponsable++; continue }
    r.conResponsable++
    if (s === 'falta') r.faltan++
    else if (s === 'pendiente') r.porValidar++
    else if (s === 'aprobado') r.aprobados++
    else r.devueltos++
  }
  return r
}
