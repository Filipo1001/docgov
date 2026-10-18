/**
 * Anular un reporte equivocado y restaurarlo (migración 068), dicho para las pantallas y el servidor.
 *
 * Un reporte no se reescribe ni se borra. Si no tiene arreglo —se hizo sobre el indicador equivocado, lo duplicó otra
 * persona, la evidencia no es de este indicador—, el administrador lo ANULA: deja de contar y de verse, y queda escrito
 * quién lo anuló, cuándo y por qué. Se puede RESTAURAR, y todo queda en el historial.
 *
 * Las reglas las impone la base; aquí se repiten para avisar antes y en palabras de persona:
 *
 *   · Solo el administrador, y el motivo es obligatorio (10 a 500 caracteres).
 *   · Se anula lo más reciente del año. Un reporte y sus versiones (las correcciones) se anulan y se restauran juntos.
 *   · Lo anulado solo lo ven el administrador y Control Interno: por eso estas filas solo se piden para ellos.
 *
 * Pura: sin `server-only` ni `'use server'`, la usan el servidor, la pantalla y las pruebas.
 */

export type AccionAnulacion = 'anular' | 'restaurar'

export const MIN_MOTIVO_ANULACION = 10
export const MAX_MOTIVO_ANULACION = 500

/** Una fila de `pdm_anulaciones`, tal como la devuelve la base. */
export interface FilaAnulacion {
  reporte_id: string
  accion: string
  motivo: string
  actor_nombre: string
  created_at: string
}

/** Una anulación o una restauración de un reporte, para mostrarla en su trazabilidad. */
export interface AnulacionVista {
  accion: AccionAnulacion
  motivo: string
  /** Quién (nombre tal como está en el sistema). */
  por: string
  /** Cuándo (ISO). */
  cuando: string
}

/**
 * `null` si el motivo sirve; si no, qué falta. Lo mismo que exige la base (que es quien decide). La frase nombra la acción:
 * «anulas» o «restauras».
 */
export function errorEnAnulacion(motivo: unknown, accion: AccionAnulacion): string | null {
  const verbo = accion === 'anular' ? 'anulas' : 'restauras'
  if (typeof motivo !== 'string' || motivo.trim().length === 0) return `Explica por qué ${verbo} el reporte.`
  const n = motivo.trim().length
  if (n < MIN_MOTIVO_ANULACION) return `Cuéntalo con un poco más de detalle (al menos ${MIN_MOTIVO_ANULACION} caracteres).`
  if (n > MAX_MOTIVO_ANULACION) return `El motivo no puede pasar de ${MAX_MOTIVO_ANULACION} caracteres.`
  return null
}

const esAccion = (v: unknown): v is AccionAnulacion => v === 'anular' || v === 'restaurar'

/** Las filas de UN reporte, de la más antigua a la más reciente. Descarta lo que no es una fila con sentido. */
function enOrden(filas: readonly FilaAnulacion[]): FilaAnulacion[] {
  return filas
    .filter(f => typeof f?.reporte_id === 'string' && esAccion(f.accion) && typeof f.created_at === 'string')
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.created_at < b.f.created_at ? -1 : a.f.created_at > b.f.created_at ? 1 : a.i - b.i))
    .map(x => x.f)
}

/** Los reportes anulados AHORA: aquellos cuya última fila dice «anular» (una restauración posterior los devuelve). */
export function idsAnulados(filas: readonly FilaAnulacion[]): Set<string> {
  const ultimo = new Map<string, AccionAnulacion>()
  for (const f of enOrden(filas)) ultimo.set(f.reporte_id, f.accion as AccionAnulacion)
  const anulados = new Set<string>()
  for (const [id, accion] of ultimo) if (accion === 'anular') anulados.add(id)
  return anulados
}

/** La historia de anulaciones y restauraciones de cada reporte, de la más antigua a la más reciente. */
export function anulacionesPorReporte(filas: readonly FilaAnulacion[]): Map<string, AnulacionVista[]> {
  const mapa = new Map<string, AnulacionVista[]>()
  for (const f of enOrden(filas)) {
    const lista = mapa.get(f.reporte_id) ?? []
    lista.push({
      accion: f.accion as AccionAnulacion,
      motivo: typeof f.motivo === 'string' ? f.motivo : '',
      por: typeof f.actor_nombre === 'string' && f.actor_nombre.trim() ? f.actor_nombre : 'El administrador',
      cuando: f.created_at,
    })
    mapa.set(f.reporte_id, lista)
  }
  return mapa
}
