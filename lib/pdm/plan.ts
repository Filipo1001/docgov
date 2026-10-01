/**
 * Plan de Desarrollo: los tipos y las cuentas que se hacen con ellos.
 *
 * ── De dónde salen los datos ─────────────────────────────────────────────
 *
 * De la base de datos (tablas `pdm_*`), leídas en el servidor por `datos.ts`.
 * Este archivo no sabe de dónde vienen: recibe listas y devuelve cuentas.
 *
 * Antes leía un JSON con el archivo de Excel sembrado en el código. Ese JSON
 * traía el AVANCE del seguimiento de junio, y se retiró: el plan se cargó en la
 * base sin ningún avance, a propósito. Un avance sin autor, sin fecha y sin
 * evidencia no es un dato del plan sino un dato sin dueño, y mezclado con lo
 * demás lo contamina. Por eso `avance` es `null` hasta que alguien reporte con su
 * nombre y su evidencia Y la secretaría lo valide: solo lo aprobado cuenta.
 *
 * ── Qué se corrigió al sembrar ───────────────────────────────────────────
 *
 * El Excel tiene tres columnas rotuladas «2026» y una «2027». Son 2024, 2025,
 * 2026 y 2027: en 190 de 257 filas las cuatro suman exactamente la meta del
 * cuatrienio. La meta de este año es, por tanto, la tercera. Con el rótulo
 * equivocado cualquiera habría tomado la primera.
 *
 * ── Qué cuenta, y contra qué se mide ─────────────────────────────────────
 *
 * El avance de un indicador es el último reporte APROBADO por la secretaría; lo reportado y aún
 * sin validar se ve, pero no cuenta. Contra qué meta se mide depende de un dato del plan que la
 * Alcaldía define a mano (`Seguimiento.ajustes.avanceModo`):
 *
 *   · anual        el valor es el avance de este año → meta de 2026.
 *   · acumulado    el valor es lo que se lleva desde 2024 → suma de las metas de 2024 a 2026.
 *   · por definir  se usa la meta de 2026 y el cumplimiento se rotula PROVISIONAL en pantalla.
 *
 * Los umbrales del semáforo («en ruta», «atrasado», «crítico») siguen siendo provisionales: el
 * archivo de origen no los define y, probados los cinco criterios que admite, ninguno reproduce
 * las cifras de su hoja de gráficos. Definirlos es una decisión de la Alcaldía, no del software.
 */

import type { AvanceModo, EstadoEnCorte } from './seguimiento'

/** Quién tiene un indicador asignado en la plataforma. */
export interface Asignacion {
  usuarioId: string
  principal: boolean
  /** Grupo del que vino esta asignación; `null` si es individual. */
  grupoId: string | null
}

export interface Indicador {
  /**
   * Fila del Excel de origen (clave estable, única en el plan). Es lo que
   * identifica al indicador en pantalla; para escribir en la base se usa `uuid`.
   */
  id: number
  uuid: string
  codigo: string
  linea: string
  sector: string
  programa: string
  producto: string
  indicador: string
  unidad: string
  dependencia: string
  /**
   * Lo que decía el Excel en «Funcionario Responsable», tal cual: una persona, un
   * equipo, una oficina, varias personas o nada. NO es la asignación real (esa
   * está en `asignados`); sirve para saber qué se quiso decir cuando no hay una
   * persona única a quien asignar.
   */
  responsable: string
  /** Asignados en la plataforma. Vacío si nadie lo tiene todavía. */
  asignados: Asignacion[]
  lineaBase: number | null
  metaCuatrienio: number | null
  meta2026: number | null
  /** La suma de las metas de 2024 a 2026. */
  metaAcumulada: number | null
  /** Qué significa el avance reportado en este plan; `null` mientras no se defina (cumplimiento provisional). */
  criterio: AvanceModo | null
  /** La meta contra la que se mide el avance, según el criterio. */
  metaMedida: number | null
  /** El último avance APROBADO. `null` mientras ningún reporte se haya validado. */
  avance: number | null
  /** En qué corte se aprobó ese avance. */
  avanceCorte: string | null
  /** Dónde va en el corte abierto; `null` si no hay corte abierto o si nadie puede reportarlo todavía. */
  enCorte: EstadoEnCorte | null
}

// ─── Responsable ──────────────────────────────────────────────────────────────

/**
 * Qué hay escrito en la casilla «Funcionario Responsable» del Excel.
 *
 * En el archivo es texto libre. De 257 indicadores, 182 nombran a una persona;
 * los otros 75 nombran un equipo, una oficina, varias personas o nada. Eso dice
 * qué quiso decir el archivo; NO dice quién responde hoy. Eso lo dicen las
 * asignaciones de la base (`Indicador.asignados`), y de ahí sale `sinAsignar`.
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

/**
 * Nadie lo tiene asignado en la plataforma: no hay a quién exigirle el reporte.
 *
 * Se decide por las asignaciones reales, no por lo que decía el Excel: un
 * indicador que el archivo ponía a nombre de un equipo y que el administrador ya
 * asignó (al secretario, por ejemplo) SÍ tiene quien responda.
 */
export const sinAsignar = (i: Indicador) => i.asignados.length === 0

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** ¿Es este usuario de la plataforma la persona que figura en el Excel? */
export function coincideNombre(nombreUsuario: string, nombreExcel: string): boolean {
  const usuario = new Set(sinTildes(nombreUsuario).split(/\s+/).filter(Boolean))
  const excel = sinTildes(nombreExcel).split(/\s+/).filter(Boolean).slice(0, 2)
  return excel.length === 2 && excel.every(t => usuario.has(t))
}

// ─── Estado de un indicador ───────────────────────────────────────────────────

export type Estado = 'cumplido' | 'en_ruta' | 'atrasado' | 'critico' | 'sin_reporte' | 'sin_meta'

/**
 * Un color por estado, y siempre con su palabra al lado (el color solo no basta: hay quien no
 * distingue el naranja del rojo). `punto` pinta el marcador y `barra` el relleno de la barra de
 * avance; son el mismo tono, separados por claridad de lectura.
 */
export const ESTADOS: Record<Estado, { rotulo: string; punto: string; barra: string }> = {
  cumplido:    { rotulo: 'Cumplido',            punto: 'bg-[#2E7D5B]', barra: 'bg-[#2E7D5B]' },
  en_ruta:     { rotulo: 'En ruta',             punto: 'bg-[#B7791F]', barra: 'bg-[#B7791F]' },
  atrasado:    { rotulo: 'Atrasado',            punto: 'bg-[#C2570C]', barra: 'bg-[#C2570C]' },
  critico:     { rotulo: 'Crítico',             punto: 'bg-[#B42318]', barra: 'bg-[#B42318]' },
  sin_reporte: { rotulo: 'Sin avance validado', punto: 'bg-[#98A2B3]', barra: 'bg-[#98A2B3]' },
  sin_meta:    { rotulo: 'Sin meta',            punto: 'bg-[#CBD2DC]', barra: 'bg-[#CBD2DC]' },
}

/** Umbrales del semáforo. Provisionales, como el criterio de cumplido. */
const UMBRALES = { cumplido: 1, en_ruta: 0.7, atrasado: 0.4 }

export function razon(i: Indicador): number | null {
  if (i.avance === null || !i.metaMedida) return null
  return i.avance / i.metaMedida
}

/** Cómo se llama la meta contra la que se mide, para ponerla junto a las cifras. */
export const rotuloMeta = (i: Indicador): string => (i.criterio === 'acumulado' ? 'meta acumulada a 2026' : 'meta 2026')

export function estadoDe(i: Indicador): Estado {
  if (!i.metaMedida) return 'sin_meta'
  const r = razon(i)
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

export function resumir(lista: Indicador[]): Resumen {
  const r: Resumen = {
    total: lista.length, medibles: 0, cumplidos: 0, enRuta: 0, atrasados: 0,
    criticos: 0, sinReporte: 0, sinMeta: 0, sinResponsable: 0, cumplimiento: null,
  }
  for (const i of lista) {
    if (sinAsignar(i)) r.sinResponsable++
    switch (estadoDe(i)) {
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

// ─── ¿Hay seguimiento? ────────────────────────────────────────────────────────

/**
 * ¿Hay algún avance VALIDADO, en algún indicador?
 *
 * Con el plan recién cargado la respuesta es NO, y las pantallas tienen que
 * decirlo. Sin esto, «0 cumplidos de 221» se pinta como «0 %», que suena a un
 * plan que no cumple cuando en realidad es un plan que no ha empezado a medirse.
 */
export function haySeguimiento(lista: Indicador[]): boolean {
  return lista.some(i => i.avance !== null)
}

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
 * Se topa en «≥ 100 %» a propósito. El archivo del que se partió traía, en 62 de
 * los 257 indicadores, un avance EXACTAMENTE igual al doble de la meta de 2026, y
 * en otros 18 al cuádruple: múltiplos enteros perfectos que un avance real no
 * produce, señal de una columna acumulada o de metas copiadas. Ese avance se
 * descartó, pero la pregunta de fondo sigue abierta —¿el avance se reporta
 * acumulado o del año?—, y mientras no se responda, mostrar «200 %» daría por
 * bueno un dato cuyo sentido no está definido; «cumplida» dice solo lo que se
 * puede sostener. Cuando la Alcaldía define el criterio (`criterioDefinido`), el
 * porcentaje se muestra tal cual.
 */
export function fmtRazon(r: number | null, criterioDefinido = false): string {
  if (r === null) return ''
  if (criterioDefinido) return `${Math.round(r * 100)} %`
  return r >= 1 ? '≥ 100 %' : `${Math.round(r * 100)} %`
}
