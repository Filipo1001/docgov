import { ETIQUETA_NIVEL, esNivelHabilitable } from './niveles'
import { nombrePropio } from './personas'

/**
 * Las OPERACIONES del administrador sobre repartos, grupos y accesos, dichas como a una persona, y lo que hace falta
 * para deshacerlas (migración 067).
 *
 * Una operación es lo que la base llama «lote»: todo lo que cambió una misma acción (asignar a una persona a veinte
 * indicadores es una operación, aunque toque veinte filas). `pdm_operaciones` las devuelve con su estado:
 *
 *   se_puede   nada de lo que tocó ha vuelto a cambiar: se puede deshacer.
 *   bloqueada  lo que tocó volvió a cambiar después (o hay otra razón): no se puede, y `razon` dice por qué.
 *   deshecha   ya se deshizo: la reversión sigue en pie.
 *
 * Pura: no lee nada, así que se prueba con filas reales. Sin `server-only` ni `'use server'`: la usan la página (servidor)
 * y la pantalla (navegador).
 */

export type EstadoOperacion = 'se_puede' | 'bloqueada' | 'deshecha'

export interface OperacionPdm {
  lote: string
  /** Qué se hizo: `asignar_principal`, `grupo_eliminar`, `habilitar`, `deshacer`… */
  operacion: string
  quien: string
  /** ISO. */
  cuando: string
  motivo: string | null
  /** Filas de la bitácora que cambió (no es lo mismo que indicadores). */
  filas: number
  indicadores: number
  /** Las personas que aparecen en los cambios (nombres tal como están en el sistema). */
  personas: string[]
  grupo: string | null
  nivel: string | null
  /** Si esta operación es una reversión: el lote que deshizo. */
  deshace: string | null
  /** …y de qué tipo era. */
  operacionOriginal: string | null
  estado: EstadoOperacion
  razon: string | null
}

export const MIN_MOTIVO_DESHACER = 10
export const MAX_MOTIVO_DESHACER = 500

/** `null` si el motivo sirve; si no, qué falta. Lo mismo que exige la base (que es quien decide). */
export function errorEnMotivoDeshacer(motivo: unknown): string | null {
  if (typeof motivo !== 'string' || motivo.trim().length === 0) return 'Explica por qué deshaces esta operación.'
  const n = motivo.trim().length
  if (n < MIN_MOTIVO_DESHACER) return `Cuéntalo con un poco más de detalle (al menos ${MIN_MOTIVO_DESHACER} caracteres).`
  if (n > MAX_MOTIVO_DESHACER) return `El motivo no puede pasar de ${MAX_MOTIVO_DESHACER} caracteres.`
  return null
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const ESTADOS: readonly EstadoOperacion[] = ['se_puede', 'bloqueada', 'deshecha']

/** Convierte una fila de `pdm_operaciones` en una operación. `null` si no es una fila con sentido. */
export function operacionDeFila(fila: unknown): OperacionPdm | null {
  const f = (fila ?? {}) as Record<string, unknown>
  const lote = texto(f.lote)
  const operacion = texto(f.operacion)
  const estado = ESTADOS.find(e => e === f.estado)
  if (!lote || !operacion || !estado) return null
  const r = (f.resumen && typeof f.resumen === 'object' ? f.resumen : {}) as Record<string, unknown>
  return {
    lote,
    operacion,
    quien: texto(f.actor_nombre) ?? 'Alguien',
    cuando: texto(f.creado) ?? '',
    motivo: texto(f.motivo),
    filas: numero(f.filas),
    indicadores: numero(r.indicadores),
    personas: Array.isArray(r.personas) ? r.personas.filter((p): p is string => typeof p === 'string' && p.trim() !== '') : [],
    grupo: texto(r.grupo),
    nivel: texto(r.nivel),
    deshace: texto(f.deshace),
    operacionOriginal: texto(r.operacion_original),
    estado,
    razon: texto(f.razon),
  }
}

/** «Ana Pérez», «Ana Pérez y Luis Gómez», «Ana Pérez, Luis Gómez y 2 más». */
export function listaDePersonas(nombres: string[]): string {
  const n = nombres.map(nombrePropio)
  if (n.length === 0) return 'Alguien'
  if (n.length === 1) return n[0]
  if (n.length === 2) return `${n[0]} y ${n[1]}`
  return `${n[0]}, ${n[1]} y ${n.length - 2} más`
}

const indicadoresTexto = (n: number) => `${n} ${n === 1 ? 'indicador' : 'indicadores'}`

/** La familia de la operación, para el rótulo de la fila. */
export function familiaDeOperacion(operacion: string): 'Reparto' | 'Grupo' | 'Acceso' | 'Reversión' | 'Cambio' {
  if (['asignar_principal', 'asignar_apoyo', 'quitar_apoyo', 'quitar', 'asignar_grupo'].includes(operacion)) return 'Reparto'
  if (['grupo_crear', 'grupo_editar', 'grupo_eliminar'].includes(operacion)) return 'Grupo'
  if (operacion === 'habilitar' || operacion === 'deshabilitar') return 'Acceso'
  if (operacion === 'deshacer') return 'Reversión'
  return 'Cambio'
}

/**
 * Qué pasó, en una frase. `original` es la operación que una reversión deshizo, si está a la vista (la lista trae las
 * recientes: una reversión de algo muy antiguo no la tendrá y se dice en general).
 */
export function describirOperacion(op: OperacionPdm, original?: OperacionPdm | null): string {
  const quien = listaDePersonas(op.personas)
  const grupo = op.grupo ? `«${op.grupo}»` : 'sin nombre'
  switch (op.operacion) {
    case 'asignar_principal':
      return `${quien} quedó como responsable principal en ${indicadoresTexto(op.indicadores)}`
    case 'asignar_apoyo':
      return `${quien} entró como apoyo en ${indicadoresTexto(op.indicadores)}`
    case 'quitar_apoyo':
    case 'quitar':
      return `Se quitó a ${quien} de ${indicadoresTexto(op.indicadores)}`
    case 'asignar_grupo':
      return `El grupo ${grupo} se asignó a ${indicadoresTexto(op.indicadores)}`
    case 'grupo_crear':
      return `Se creó el grupo ${grupo}`
    case 'grupo_editar':
      return `Se editó el grupo ${grupo}`
    case 'grupo_eliminar':
      return `Se eliminó el grupo ${grupo}`
    case 'habilitar': {
      const nivel = op.nivel && esNivelHabilitable(op.nivel) ? ETIQUETA_NIVEL[op.nivel].toLowerCase() : null
      return nivel ? `Se dio acceso a ${quien} como ${nivel}` : `Se cambió el acceso de ${quien}`
    }
    case 'deshabilitar':
      return `Se quitó el acceso a ${quien}`
    case 'deshacer':
      return original
        ? `Se deshizo: ${describirOperacion(original)}`
        : `Se deshizo una operación anterior${op.operacionOriginal ? ` (${familiaDeOperacion(op.operacionOriginal).toLowerCase()})` : ''}`
    default:
      return 'Un cambio del plan'
  }
}
