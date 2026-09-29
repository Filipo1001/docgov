/**
 * Plan de Desarrollo: los datos y las cuentas que se hacen con ellos.
 *
 * ── Qué es esto hoy ──────────────────────────────────────────────────────
 *
 * VISTA PREVIA. Los indicadores salen de `datos-preview.json`, sembrado desde
 * el archivo «Seguimiento PDM Septiembre de 2026.xlsx» de la Alcaldía. No hay
 * base de datos detrás: nada de lo que se haga en pantalla se guarda, y por eso
 * el módulo no puede afectar a Contratista Digital.
 *
 * Cuando el esquema real exista, lo único que cambia es de dónde sale
 * `INDICADORES`. Las funciones de este archivo reciben la lista y devuelven
 * cuentas; no saben de dónde vino.
 *
 * ── Qué se corrigió al sembrar ───────────────────────────────────────────
 *
 * El Excel tiene tres columnas rotuladas «2026» y una «2027». Son 2024, 2025,
 * 2026 y 2027: en 190 de 254 filas las cuatro suman exactamente la meta del
 * cuatrienio. La meta de este año es, por tanto, la tercera. Con el rótulo
 * equivocado cualquiera habría tomado la primera.
 *
 * ── El criterio de «cumplido» es PROVISIONAL ─────────────────────────────
 *
 * El archivo no lo define en ninguna parte: probados los cinco criterios que
 * admite, ninguno reproduce las cifras de su hoja de gráficos. Aquí se usa el
 * más simple —avance ≥ meta 2026— y se rotula como provisional en pantalla.
 * Definirlo es una decisión de la Alcaldía, no del software, y el sistema la
 * hace visible en lugar de esconderla.
 */

import datos from './datos-preview.json'

export interface Indicador {
  id: number
  codigo: string
  linea: string
  sector: string
  programa: string
  producto: string
  indicador: string
  unidad: string
  dependencia: string
  responsable: string
  lineaBase: number | null
  metaCuatrienio: number | null
  meta2026: number | null
  avance: number | null
}

export const INDICADORES = datos as Indicador[]

// ─── Reportes ─────────────────────────────────────────────────────────────────

/**
 * Un reporte de avance, tal como lo guardaría el sistema.
 *
 * Lleva `anterior` y `nuevo` a propósito: el valor previo no se sobrescribe, se
 * conserva al lado del nuevo. Es la respuesta a «¿qué cambió respecto al
 * reporte anterior?», que en el archivo de Excel no existe porque cada corte
 * escribe encima del otro.
 *
 * En la vista previa solo viven en memoria, mientras la pestaña está abierta.
 */
export interface Reporte {
  fecha: number
  autor: string
  anterior: number | null
  nuevo: number
  texto: string
  evidencia: string
}

// ─── Responsable ──────────────────────────────────────────────────────────────

/**
 * Qué hay escrito en la casilla «Funcionario Responsable».
 *
 * En el archivo es texto libre. De 257 indicadores, 182 tienen una persona;
 * los otros 75 tienen un equipo, una oficina, varias personas o nada. Ninguno
 * de esos 75 tiene a quién exigirle el reporte, ni a quién preguntarle cuando
 * falta.
 */
export type TipoResponsable = 'persona' | 'varios' | 'equipo' | 'oficina' | 'ninguno'

export function tipoResponsable(crudo: string): TipoResponsable {
  const t = crudo.trim().toLowerCase()
  if (['', '-', '…….', '.'].includes(t)) return 'ninguno'
  if (t.startsWith('equipo')) return 'equipo'
  if (t === 'comisaría' || t === 'inspección') return 'oficina'
  if (t.includes(' y ') || t.includes(',') || t.includes(' - ') || /\w-\w/.test(t)) return 'varios'
  return 'persona'
}

/** Sin una persona única a quien pedirle cuentas. */
export const sinResponsableUnico = (i: Indicador) => tipoResponsable(i.responsable) !== 'persona'

export const ROTULO_RESPONSABLE: Record<TipoResponsable, string> = {
  persona: 'Persona',
  varios: 'Varias personas, sin un responsable principal',
  equipo: 'Equipo, sin persona que responda',
  oficina: 'Oficina, sin persona que responda',
  ninguno: 'Sin responsable',
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** ¿Es este usuario de la plataforma la persona que figura en el Excel? */
export function coincideNombre(nombreUsuario: string, nombreExcel: string): boolean {
  const usuario = new Set(sinTildes(nombreUsuario).split(/\s+/).filter(Boolean))
  const excel = sinTildes(nombreExcel).split(/\s+/).filter(Boolean).slice(0, 2)
  return excel.length === 2 && excel.every(t => usuario.has(t))
}

// ─── Estado de un indicador ───────────────────────────────────────────────────

export type Estado = 'cumplido' | 'en_ruta' | 'atrasado' | 'critico' | 'sin_reporte' | 'sin_meta'

export const ESTADOS: Record<Estado, { rotulo: string; punto: string; chip: string; barra: string }> = {
  cumplido:    { rotulo: 'Cumplido',      punto: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', barra: 'bg-emerald-500' },
  en_ruta:     { rotulo: 'En ruta',       punto: 'bg-amber-400',   chip: 'bg-amber-50 text-amber-800 border-amber-200',       barra: 'bg-amber-400' },
  atrasado:    { rotulo: 'Atrasado',      punto: 'bg-orange-500',  chip: 'bg-orange-50 text-orange-800 border-orange-200',    barra: 'bg-orange-500' },
  critico:     { rotulo: 'Crítico',       punto: 'bg-red-500',     chip: 'bg-red-50 text-red-800 border-red-200',             barra: 'bg-red-500' },
  sin_reporte: { rotulo: 'Sin reporte',   punto: 'bg-gray-400',    chip: 'bg-gray-100 text-gray-700 border-gray-200',         barra: 'bg-gray-300' },
  sin_meta:    { rotulo: 'Sin meta 2026', punto: 'bg-gray-300',    chip: 'bg-white text-gray-500 border-gray-200',            barra: 'bg-gray-200' },
}

/** Umbrales del semáforo. Provisionales, como el criterio de cumplido. */
const UMBRALES = { cumplido: 1, en_ruta: 0.7, atrasado: 0.4 }

export function avanceDe(i: Indicador, reportado?: number | null): number | null {
  return reportado ?? i.avance
}

export function razon(i: Indicador, reportado?: number | null): number | null {
  const a = avanceDe(i, reportado)
  if (a === null || !i.meta2026) return null
  return a / i.meta2026
}

export function estadoDe(i: Indicador, reportado?: number | null): Estado {
  if (!i.meta2026) return 'sin_meta'
  const r = razon(i, reportado)
  if (r === null) return 'sin_reporte'
  if (r >= UMBRALES.cumplido) return 'cumplido'
  if (r >= UMBRALES.en_ruta) return 'en_ruta'
  if (r >= UMBRALES.atrasado) return 'atrasado'
  return 'critico'
}

// ─── Consolidación ────────────────────────────────────────────────────────────

export interface Resumen {
  total: number
  /** Con meta para este año: sobre ellos se mide el cumplimiento. */
  medibles: number
  cumplidos: number
  enRuta: number
  atrasados: number
  criticos: number
  sinReporte: number
  sinMeta: number
  sinResponsable: number
  /** 0–100, o null si no hay nada medible. */
  cumplimiento: number | null
}

/** `reportado` trae el último valor reportado en esta sesión, por id. */
export function resumir(lista: Indicador[], reportado: Record<number, number> = {}): Resumen {
  const r: Resumen = {
    total: lista.length, medibles: 0, cumplidos: 0, enRuta: 0, atrasados: 0,
    criticos: 0, sinReporte: 0, sinMeta: 0, sinResponsable: 0, cumplimiento: null,
  }
  for (const i of lista) {
    if (sinResponsableUnico(i)) r.sinResponsable++
    switch (estadoDe(i, reportado[i.id])) {
      case 'sin_meta':    r.sinMeta++; break
      case 'sin_reporte': r.medibles++; r.sinReporte++; break
      case 'cumplido':    r.medibles++; r.cumplidos++; break
      case 'en_ruta':     r.medibles++; r.enRuta++; break
      case 'atrasado':    r.medibles++; r.atrasados++; break
      case 'critico':     r.medibles++; r.criticos++; break
    }
  }
  r.cumplimiento = r.medibles ? (100 * r.cumplidos) / r.medibles : null
  return r
}

export function agrupar(lista: Indicador[], clave: (i: Indicador) => string): [string, Indicador[]][] {
  const m = new Map<string, Indicador[]>()
  for (const i of lista) m.set(clave(i), [...(m.get(clave(i)) ?? []), i])
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
}

// ─── Catálogos ────────────────────────────────────────────────────────────────

export const DEPENDENCIAS = agrupar(INDICADORES, i => i.dependencia).map(([n]) => n)

/** Personas con nombre propio en el Excel, de más a menos indicadores. */
export const REPORTANTES = agrupar(
  INDICADORES.filter(i => tipoResponsable(i.responsable) === 'persona'),
  i => i.responsable,
).map(([nombre, l]) => ({ nombre, indicadores: l.length }))

// ─── Formato ──────────────────────────────────────────────────────────────────

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

export function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)} %`
}

/**
 * La razón avance/meta, lista para mostrar.
 *
 * Se topa en «≥ 100 %» a propósito. En 62 de los 257 indicadores el avance del
 * archivo es EXACTAMENTE el doble de la meta de 2026, y en otros 18 el
 * cuádruple: múltiplos enteros perfectos que un avance real no produce. Lo más
 * probable es que la columna sea acumulada, o que arrastre metas copiadas, y
 * no el avance del año. Mostrar «200 %» daría por bueno un dato cuyo sentido no
 * está definido; «cumplida» dice solo lo que se puede sostener.
 */
export function fmtRazon(r: number | null): string {
  if (r === null) return ''
  return r >= 1 ? '≥ 100 %' : `${Math.round(r * 100)} %`
}
