/**
 * El BORRADOR de un reporte: lo que alguien dejó a medias para continuar después (migración 076). Las cuentas puras, sin leer nada:
 * de las filas de la base a lo que ve la pantalla, qué de lo guardado sigue valiendo cuando la situación del reporte cambió, y cómo
 * saber si el formulario tiene cambios sin guardar.
 *
 * Un borrador NO es un reporte: no cuenta, no llega a la secretaría y no lo ve nadie fuera de quienes tienen el indicador a su cargo.
 */

import { nombrePropio } from './personas'
import type { BorradorArchivo, BorradorVista } from './seguimiento-acciones'

export interface FilaBorrador {
  id: string
  anio: number
  valor: number | string | null
  texto: string | null
  motivo: string | null
  conservar: string[] | null
  version: number
  editado_por: string
  editado_nombre: string
  editado_en: string
}

export interface FilaBorradorArchivo {
  borrador_id: string
  ruta: string
  nombre: string
  tipo: string
  bytes: number | string
  subido_en: string
}

const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** De las filas de la base a los borradores que ve la pantalla (del año más reciente al más antiguo). */
export function armarBorradores(borradores: FilaBorrador[], archivos: FilaBorradorArchivo[]): BorradorVista[] {
  return [...borradores]
    .sort((a, b) => b.anio - a.anio)
    .map(b => ({
      anio: b.anio,
      version: b.version,
      valor: numero(b.valor),
      texto: b.texto ?? '',
      motivo: b.motivo ?? '',
      conservar: Array.isArray(b.conservar) ? b.conservar : [],
      archivos: archivos
        .filter(a => a.borrador_id === b.id)
        .sort((x, y) => (x.subido_en < y.subido_en ? -1 : x.subido_en > y.subido_en ? 1 : x.ruta < y.ruta ? -1 : 1))
        .map((a): BorradorArchivo => ({ ruta: a.ruta, nombre: a.nombre, tipo: a.tipo, bytes: numero(a.bytes) ?? 0 })),
      editadoPorId: b.editado_por,
      editadoPor: b.editado_nombre,
      editadoEn: b.editado_en,
    }))
}

/**
 * Lo guardado en el borrador que SIGUE valiendo con la situación de hoy. Un borrador guardado cuando se corregía un reporte pendiente
 * puede abrirse cuando ya lo aprobaron (ahora es un avance nuevo: no se corrige ni se conserva nada, y el motivo sobra) o cuando la
 * secretaría marcó archivos al devolverlo (esos no se conservan). Devuelve lo que se mantiene y cuánto se descartó.
 *
 * `anteriores`: los archivos de la versión que se corrige AHORA (vacío si no se corrige nada); `observados`: ids que la secretaría
 * devolvió, que no se conservan.
 */
export function aplicarSituacion(
  borrador: Pick<BorradorVista, 'conservar' | 'motivo'>,
  anteriores: readonly { id: string }[],
  observados: ReadonlySet<string>,
  correccion: boolean,
): { conservar: string[]; motivo: string; quitados: number; motivoDescartado: boolean } {
  if (!correccion) {
    return { conservar: [], motivo: '', quitados: borrador.conservar.length, motivoDescartado: borrador.motivo.trim() !== '' }
  }
  const vigentes = new Set(anteriores.map(a => a.id))
  const sirven = borrador.conservar.filter(id => vigentes.has(id) && !observados.has(id))
  return { conservar: sirven, motivo: borrador.motivo, quitados: borrador.conservar.length - sirven.length, motivoDescartado: false }
}

/**
 * Una firma de lo que hay en el formulario, para saber si cambió desde el último guardado (y avisar «hay cambios sin guardar»). Se
 * compara lo que importa: el valor y los textos tal como se escribieron, lo que se conserva y los archivos (los ya guardados por su
 * ruta, los que están por subir por su clave). El orden de lo conservado no cuenta.
 */
export function firmaDelFormulario(f: {
  valor: string
  texto: string
  motivo: string
  conservar: Iterable<string>
  guardados: readonly string[]
  porSubir: readonly string[]
}): string {
  return JSON.stringify([f.valor.trim(), f.texto, f.motivo, [...f.conservar].sort(), [...f.guardados], [...f.porSubir]])
}

// ─── El guardado automático ──────────────────────────────────────────────────

/** Cuánto se espera tras la última tecla antes de guardar lo escrito (los archivos no esperan: se suben al elegirlos). */
export const ESPERA_TEXTO_MS = 1500
/** Cuánto se espera antes de descartar un borrador cuyo formulario quedó vacío (por si quien lo vació está reescribiendo). */
export const ESPERA_VACIO_MS = 3000
/** Intentos seguidos que fallan antes de dejar de insistir y pedir que la persona reintente. */
export const MAX_FALLOS_AUTOGUARDADO = 4

/** Lo que el formulario hace ahora con su borrador. */
export type DecisionAutoguardado = { accion: 'nada' } | { accion: 'guardar' | 'descartar'; enMs: number }

/**
 * Cuándo guarda solo el formulario. Nadie pulsa «Guardar»: en cuanto hay algo distinto de lo último guardado, se guarda.
 *
 *   · Los archivos se suben y se guardan de inmediato (no hay razón para esperar: es lo que costó tiempo).
 *   · Lo escrito espera a que se deje de teclear (`ESPERA_TEXTO_MS`), para no guardar cada letra.
 *   · Si falla, se reintenta cada vez más tarde y, tras `MAX_FALLOS_AUTOGUARDADO` fallos seguidos, se para: insistir sin fin
 *     volvería a subir un video de 100 MB una y otra vez. Se retoma cuando la persona cambia algo o pulsa «Reintentar».
 *   · Si otra persona guardó el borrador mientras tanto (`detenido`), no se pisa su trabajo: se espera a que la persona decida.
 *   · Un formulario que quedó vacío no se puede guardar (el servidor lo rechaza: no hay nada): se descarta el borrador, si había.
 *   · Mientras se envía, se descarta o ya se está guardando, no se empieza otro guardado: uno a la vez.
 *   · `urgente` (se pidió enviar): sin esperas.
 */
export function decidirAutoguardado(e: {
  firma: string
  /** La firma de lo último que quedó guardado (o, sin borrador, la del formulario recién abierto). */
  firmaGuardada: string
  /** Se está enviando o descartando a mano. */
  ocupado: boolean
  /** Ya hay un guardado en marcha. */
  guardando: boolean
  /** Otra persona guardó antes: no se sigue hasta que la persona decida. */
  detenido: boolean
  /** El valor escrito es un número o está vacío (un valor que no se entiende no se guarda). */
  valorLegible: boolean
  /** Archivos elegidos que aún no están subidos. */
  porSubir: number
  /** No hay valor, texto, motivo, archivos ni nada que conservar. */
  vacio: boolean
  hayBorrador: boolean
  /** Fallos seguidos hasta ahora. */
  fallos: number
  urgente?: boolean
}): DecisionAutoguardado {
  if (e.ocupado || e.guardando || e.detenido) return { accion: 'nada' }
  if (e.firma === e.firmaGuardada) return { accion: 'nada' }
  if (!e.valorLegible) return { accion: 'nada' }
  if (e.fallos >= MAX_FALLOS_AUTOGUARDADO) return { accion: 'nada' }
  // 4 s, 8 s, 16 s… sin pasar de 30 s.
  const reintento = e.fallos > 0 ? Math.min(30_000, 4_000 * 2 ** (e.fallos - 1)) : 0
  if (e.vacio) {
    return e.hayBorrador ? { accion: 'descartar', enMs: e.urgente ? 0 : Math.max(ESPERA_VACIO_MS, reintento) } : { accion: 'nada' }
  }
  const base = e.porSubir > 0 ? 0 : ESPERA_TEXTO_MS
  return { accion: 'guardar', enMs: e.urgente ? 0 : Math.max(base, reintento) }
}

/** ¿El servidor se negó a guardar porque otra persona cambió el borrador antes? (Ver el error 40001 de la migración 076.) */
export const esConflictoDeBorrador = (mensaje: string | null | undefined): boolean => /cambió mientras lo editabas/i.test(mensaje ?? '')

/** Lo que el formulario le dice a quien lo llena sobre su borrador mientras se guarda solo. */
export type EstadoDelGuardado = 'conflicto' | 'detenido' | 'reintentando' | 'valor-ilegible' | 'guardando' | 'reposo'

export function estadoDelGuardado(e: {
  conflicto: boolean
  guardando: boolean
  /** Hay algo distinto de lo último guardado. */
  hayCambios: boolean
  valorLegible: boolean
  fallos: number
}): EstadoDelGuardado {
  if (e.conflicto) return 'conflicto'
  if (e.fallos >= MAX_FALLOS_AUTOGUARDADO) return 'detenido'
  if (e.fallos > 0) return 'reintentando'
  if (e.hayCambios && !e.valorLegible) return 'valor-ilegible'
  if (e.guardando || e.hayCambios) return 'guardando'
  return 'reposo'
}

/** Quién guardó el borrador, para el aviso: «tú» si fue la misma persona. */
export const quienGuardo = (b: Pick<BorradorVista, 'editadoPorId' | 'editadoPor'>, yoId: string): string =>
  b.editadoPorId === yoId ? 'ti' : nombrePropio(b.editadoPor)
