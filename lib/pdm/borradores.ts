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

/** Quién guardó el borrador, para el aviso: «tú» si fue la misma persona. */
export const quienGuardo = (b: Pick<BorradorVista, 'editadoPorId' | 'editadoPor'>, yoId: string): string =>
  b.editadoPorId === yoId ? 'ti' : nombrePropio(b.editadoPor)
