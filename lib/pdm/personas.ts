/**
 * Las personas del módulo, tal como viajan al navegador.
 *
 * Solo tipos y utilidades puras, sin `server-only` ni datos: las usan tanto el
 * servidor (que arma el directorio) como los componentes de cliente (que lo
 * pintan). Importa tipos de `plan.ts` con `import type`, que se borra al
 * compilar: no arrastra el JSON de los indicadores.
 */

import type { ContratoResumen } from './contrato'
import type { MotivoSinUsuario } from './vinculos'
import type { Resumen } from './plan'

export interface PersonaDirectorio {
  id: string
  /** Ya en forma de nombre propio («Juliana Palacio Mazo»), no en MAYÚSCULAS como en la base. */
  nombre: string
  rol: string
  fotoUrl: string | null
  secretaria: string | null
  contrato: ContratoResumen
  /** Cómo figura en el Excel de seguimiento, si figura. */
  excel: string | null
  indicadores: number
  /** Cómo van los indicadores a su nombre; `null` si no tiene ninguno. */
  resumen: Resumen | null
}

export type MotivoSinVincular = MotivoSinUsuario | 'no_encontrado'

/** Alguien que figura en el Excel pero no se puede mostrar como un usuario. */
export interface SinUsuario {
  nombre: string
  motivo: MotivoSinVincular
  indicadores: number
  resumen: Resumen
}

/** Lo que la ficha de un indicador necesita saber de su responsable. */
export type PersonaFicha =
  | { nombre: string; fotoUrl: string | null; secretaria: string | null; contrato: ContratoResumen }
  | { sinUsuario: MotivoSinVincular }

export interface Directorio {
  /** `false` si no se pudo leer la base: las pantallas siguen funcionando con el texto del Excel. */
  ok: boolean
  personas: PersonaDirectorio[]
  sinUsuario: SinUsuario[]
  /** Por indicador (su `id`). Sin entrada: el Excel no nombraba a una persona a quien asignarlo. */
  fichas: Record<number, PersonaFicha>
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e'])

/**
 * «JULIANA PALACIO MAZO» → «Juliana Palacio Mazo».
 *
 * La base guarda los nombres en mayúsculas. Las tildes que no se escribieron no
 * se pueden inventar: «RAMIREZ» sigue siendo «Ramirez».
 */
export function nombrePropio(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase()
}
