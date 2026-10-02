/**
 * Lo que el navegador y el servidor se dicen cuando el administrador reparte
 * indicadores: las entradas, las respuestas y cómo se cuentan los errores.
 *
 * Solo tipos y funciones puras, sin `'use server'` ni `server-only`: las usan los
 * componentes de cliente (para tipar lo que piden) y las acciones del servidor
 * (para validar lo que reciben). Un archivo `'use server'` solo puede exportar
 * funciones asíncronas, por eso esto vive aparte.
 */

import type { NivelHabilitable } from './niveles'
import type { EntradaHistorial } from './historial'

export type Resultado<T = void> = { ok: true; datos: T } | { ok: false; error: string }

/** Lo que dice la base tras una asignación: cuánto cambió y cuánto ya estaba así. */
export interface ResumenCambio {
  cambiados: number
  sinCambio: number
  pasadosAApoyo: number
  quitados: number
}

/** Qué hacer con quien era el principal: dejarlo de apoyo (lo normal) o quitarlo. */
export type Anterior = 'apoyo' | 'quitar'

export interface EntradaAsignarPersona {
  /** `uuid` de los indicadores (no el número de fila del Excel). */
  indicadores: string[]
  usuario: string
  /** `true`: responsable principal; `false`: apoyo. */
  principal: boolean
  anterior: Anterior
  motivo?: string
}

export interface EntradaAsignarGrupo {
  indicadores: string[]
  grupo: string
  anterior: Anterior
  motivo?: string
}

/** Quita a una persona de uno o varios indicadores (apoyo, o principal si es la única asignación). */
export interface EntradaQuitarAsignacion {
  indicadores: string[]
  usuario: string
  motivo?: string
}

export interface EntradaHabilitar {
  usuario: string
  nivel: NivelHabilitable
  motivo?: string
}

export interface EntradaDeshabilitar {
  usuario: string
  motivo?: string
}

export type CambioAcceso = 'habilitado' | 'cambiado' | 'quitado' | 'ninguno'

export interface EntradaGuardarGrupo {
  /** Sin él, se crea; con él, se edita. */
  grupo?: string
  nombre: string
  secretaria: string
  /** Opcional. Sin líder, el grupo entra a los indicadores como apoyo y el principal no cambia. */
  lider?: string | null
  /** Ids de usuario; el líder, si hay, se cuenta aunque no venga. */
  miembros: string[]
  descripcion?: string
  motivo?: string
}

export interface EntradaEliminarGrupo {
  grupo: string
  motivo?: string
}

/** Lo que quien gestiona puede hacer. En producción lo respalda el servidor; en pruebas, un doble. */
export interface AccionesPdm {
  asignarPersona: (e: EntradaAsignarPersona) => Promise<Resultado<ResumenCambio>>
  asignarGrupo: (e: EntradaAsignarGrupo) => Promise<Resultado<ResumenCambio>>
  quitarAsignacion: (e: EntradaQuitarAsignacion) => Promise<Resultado<ResumenCambio>>
  guardarGrupo: (e: EntradaGuardarGrupo) => Promise<Resultado<{ grupo: string }>>
  eliminarGrupo: (e: EntradaEliminarGrupo) => Promise<Resultado>
  habilitar: (e: EntradaHabilitar) => Promise<Resultado<{ cambio: CambioAcceso }>>
  deshabilitar: (e: EntradaDeshabilitar) => Promise<Resultado<{ cambio: CambioAcceso }>>
  /** Los cambios de responsable de un indicador, del más reciente al más antiguo. Solo el administrador los lee. */
  historialIndicador: (indicador: string) => Promise<Resultado<EntradaHistorial[]>>
}

// ─── Validación (la hace el servidor antes de preguntarle nada a la base) ──────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export const MAX_INDICADORES = 300
export const MAX_MIEMBROS = 100
export const MAX_MOTIVO = 500
export const MAX_NOMBRE_GRUPO = 120
export const MAX_DESCRIPCION = 500

/** `null` si la lista es válida; si no, qué falla. */
export function errorEnLista(lista: unknown, tope: number, que: string): string | null {
  if (!Array.isArray(lista) || lista.length === 0) return `Falta elegir ${que}.`
  if (lista.length > tope) return `Son demasiados (máximo ${tope}).`
  if (!lista.every(esUuid)) return 'Algo de lo elegido no es válido. Recarga la página e intenta de nuevo.'
  return null
}

export function errorEnMotivo(motivo: unknown): string | null {
  if (motivo === undefined || motivo === null) return null
  if (typeof motivo !== 'string') return 'El motivo no es válido.'
  if (motivo.trim().length > MAX_MOTIVO) return `El motivo no puede pasar de ${MAX_MOTIVO} caracteres.`
  return null
}

// ─── Errores de la base, dichos como a una persona ──────────────────────────────

const GENERICO = 'No se pudo guardar el cambio. Intenta de nuevo; si sigue igual, avísale a quien administra la plataforma.'

/**
 * Los mensajes que escriben las funciones de las migraciones 052 a 057 empiezan por «PDM: »
 * y están pensados para leerse: se muestran tal cual. Todo lo demás (un error de
 * permisos de Postgres, una restricción) se traduce o se oculta: el texto crudo
 * de la base no es para el usuario.
 */
export function traducirErrorPdm(code?: string | null, mensaje?: string | null): string {
  const m = (mensaje ?? '').trim()
  if (m.startsWith('PDM: ')) return capitalizar(m.slice(5))
  if (code === '23505' && /pdm_grupos_nombre_uq/.test(m)) return 'Ya existe un grupo con ese nombre.'
  if (code === '23505' && /pdm_reportes_una_correccion/.test(m)) {
    return 'Ese reporte ya fue corregido por otra persona. Recarga la página para ver lo último.'
  }
  if (code === '23505' && /pdm_evidencias_ruta_key|pdm_evidencias_ruta_original|pdm_evidencias_reporte_ruta_key/.test(m)) return 'Uno de esos archivos ya está en otro reporte. Súbelo de nuevo.'
  if (code === '42501') return 'No tienes permiso para hacer este cambio.'
  return GENERICO
}

const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Cómo se cuenta lo que pasó, para el aviso que ve quien asignó. */
export function describirResumen(r: ResumenCambio, etiqueta: string): string {
  if (r.cambiados === 0) return `Sin cambios: ${r.sinCambio === 1 ? 'ese indicador ya estaba' : 'esos indicadores ya estaban'} a cargo de ${etiqueta}.`
  const n = r.cambiados
  const base = `${n} ${n === 1 ? 'indicador asignado' : 'indicadores asignados'} a ${etiqueta}`
  const partes: string[] = []
  if (r.pasadosAApoyo > 0) partes.push(`${r.pasadosAApoyo} ${r.pasadosAApoyo === 1 ? 'responsable anterior pasó' : 'responsables anteriores pasaron'} a apoyo`)
  if (r.quitados > 0) partes.push(`${r.quitados} ${r.quitados === 1 ? 'responsable anterior quitado' : 'responsables anteriores quitados'}`)
  if (r.sinCambio > 0) partes.push(`${r.sinCambio} ya ${r.sinCambio === 1 ? 'estaba' : 'estaban'} así`)
  return partes.length ? `${base}. ${partes.join('; ')}.` : `${base}.`
}
