import type { Indicador } from './plan'
import {
  ANIOS_PLAN, estadoDelAnio, requiereReporte, resumirAnio,
  type EstadoDelAnio, type ResumenAnio, type SituacionAnio,
} from './seguimiento'
import type { GrupoVista } from './personas'

/**
 * «Mi trabajo»: lo que ve quien responde por indicadores, ordenado por lo que le toca hacer.
 *
 * Puro: no lee nada. Recibe el plan y los grupos ya cargados (con la sesión de quien mira, así que
 * la base ya los recortó a lo suyo) y los ordena. Sin `server-only` ni `'use client'`: lo usan la
 * página, la pantalla y las pruebas.
 *
 * ── Qué es «mío» ─────────────────────────────────────────────────────────
 *
 * Un indicador es mío si tengo una fila de asignación, como principal o como apoyo, directa o por
 * un grupo. Se decide por las asignaciones y no por el Excel. La base, además, solo le muestra a un
 * responsable sus propias filas, así que de los demás asignados no se sabe nada desde aquí: por eso
 * este módulo habla de MI papel en cada indicador y nunca del de otros.
 */

/** Mi fila en un indicador: si soy el principal y de qué grupo vino, si vino de uno. `null`: no es mío. */
export function miPapel(i: Indicador, yoId: string): { principal: boolean; grupoId: string | null } | null {
  const a = i.asignados.find(x => x.usuarioId === yoId)
  return a ? { principal: a.principal, grupoId: a.grupoId } : null
}

export const esMio = (i: Indicador, yoId: string): boolean => miPapel(i, yoId) !== null

export type ClaveSeccion = 'reportar' | 'validar' | 'aprobados' | 'otros' | 'todos'

export interface SeccionTrabajo {
  clave: ClaveSeccion
  titulo: string
  /** Una línea que dice qué hacer, o qué esperar. */
  nota: string
  indicadores: Indicador[]
}

const TITULOS: Record<ClaveSeccion, { titulo: string; nota: string }> = {
  reportar:  { titulo: 'Te toca reportar', nota: 'Cada uno con su evidencia' },
  validar:   { titulo: 'Esperando a la secretaría', nota: 'Ya se reportaron; falta que los valide' },
  aprobados: { titulo: 'Aprobados', nota: 'Ya cuentan en el cumplimiento' },
  otros:     { titulo: 'Sin nada que reportar', nota: 'En este año no se espera nada de ellos' },
  todos:     { titulo: 'Indicadores a tu cargo', nota: '' },
}

/** De la situación en el año, a la sección donde se lista. */
function claveDe(s: SituacionAnio | undefined | null): ClaveSeccion {
  if (requiereReporte(s)) return 'reportar'
  if (s === 'pendiente') return 'validar'
  if (s === 'aprobado') return 'aprobados'
  return 'otros'
}

/**
 * Mis indicadores en el año que se mira (la lista ya viene proyectada a él), en secciones.
 *
 *   · En un año en que se espera algo: lo que me toca reportar primero (lo devuelto antes que lo que falta,
 *     porque alguien ya lo miró y espera mi respuesta), luego lo que espera a la secretaría, luego lo
 *     aprobado. Una sección vacía no se devuelve.
 *   · En un año en que no se espera nada (uno que no ha empezado, o sin metas): una sola lista.
 *
 * Dentro de cada sección, el orden del plan (el del Excel), que es el que ya conocen.
 */
export function ordenarMiTrabajo(indicadores: Indicador[], yoId: string): SeccionTrabajo[] {
  const mios = indicadores.filter(i => esMio(i, yoId)).sort((a, b) => a.id - b.id)
  if (mios.length === 0) return []

  if (!mios.some(i => i.enAnio !== null)) {
    return [{ clave: 'todos', ...TITULOS.todos, indicadores: mios }]
  }

  const orden: ClaveSeccion[] = ['reportar', 'validar', 'aprobados', 'otros']
  const porClave = new Map<ClaveSeccion, Indicador[]>(orden.map(c => [c, []]))
  for (const i of mios) porClave.get(claveDe(i.enAnio?.situacion))!.push(i)

  // Lo devuelto antes que lo que falta: esperan una respuesta mía.
  porClave.get('reportar')!.sort((a, b) =>
    Number(b.enAnio?.situacion === 'devuelto') - Number(a.enAnio?.situacion === 'devuelto') || a.id - b.id)

  return orden
    .map(c => ({ clave: c, ...TITULOS[c], indicadores: porClave.get(c)! }))
    .filter(s => s.indicadores.length > 0)
}

/** Cuántos indicadores míos esperan que yo reporte en el año que se mira (me faltan, o me los devolvieron). */
export const pendientesDeReportar = (indicadores: Indicador[], yoId: string): number =>
  indicadores.filter(i => esMio(i, yoId) && requiereReporte(i.enAnio?.situacion)).length

// ─── Las tarjetas de los años ─────────────────────────────────────────────────

/** Cómo van MIS indicadores en un año: lo que dice la tarjeta de ese año. */
export interface TarjetaAnio {
  anio: number
  estado: EstadoDelAnio
  /** Cuántos de mis indicadores tienen meta en ese año. */
  conMeta: number
  /** Cuántos de ellos ya tienen un avance aprobado en el año. */
  conAvance: number
  /** Dónde va cada uno en el año: lo que falta, lo que espera a la secretaría, lo devuelto, lo aprobado. */
  resumen: ResumenAnio
}

/** Una tarjeta por año del plan, con lo mío. Sirve cualquier proyección de la lista: usa los cuatro años de cada indicador. */
export function tarjetasDeAnios(indicadores: Indicador[], yoId: string, anioActual: number): TarjetaAnio[] {
  const mios = indicadores.filter(i => esMio(i, yoId))
  return ANIOS_PLAN.map(anio => {
    const deAnio = mios.map(i => i.anios.find(a => a.anio === anio))
    return {
      anio,
      estado: estadoDelAnio(anio, anioActual),
      conMeta: deAnio.filter(a => (a?.meta ?? 0) > 0).length,
      conAvance: deAnio.filter(a => (a?.meta ?? 0) > 0 && a?.avance !== null && a?.avance !== undefined).length,
      resumen: resumirAnio(deAnio.map(a => a?.enAnio?.situacion ?? null)),
    }
  })
}

// ─── Mis grupos ───────────────────────────────────────────────────────────────

export interface MiembroDeGrupo {
  id: string
  nombre: string
  fotoUrl: string | null
  esLider: boolean
  soyYo: boolean
  /** `false`: ya no figura entre los usuarios activos. */
  activo: boolean
}

/** Un grupo del que formo parte, con lo que cabe mostrar de él a sus propios miembros. */
export interface GrupoMio {
  id: string
  nombre: string
  secretaria: string
  descripcion: string | null
  /** Cuántos indicadores me llegan por este grupo. */
  indicadores: number
  miembros: MiembroDeGrupo[]
}

/** Lo mínimo que se necesita saber de una persona para nombrarla; el directorio completo no viaja al navegador. */
export interface PersonaBreve {
  id: string
  nombre: string
  fotoUrl: string | null
}

/**
 * Los grupos de los que formo parte, con sus miembros: el líder primero, luego yo, luego los demás por
 * nombre. Solo se devuelven nombre y foto: ni contrato ni cédula ni correo de los compañeros.
 */
export function armarMisGrupos(grupos: GrupoVista[], personas: PersonaBreve[], yoId: string): GrupoMio[] {
  const porId = new Map(personas.map(p => [p.id, p]))
  return grupos
    .filter(g => g.miembros.includes(yoId))
    .map(g => ({
      id: g.id,
      nombre: g.nombre,
      secretaria: g.secretaria,
      descripcion: g.descripcion,
      indicadores: g.indicadores,
      miembros: g.miembros
        .map(id => {
          const p = porId.get(id)
          return {
            id,
            nombre: p?.nombre ?? 'Usuario que ya no está activo',
            fotoUrl: p?.fotoUrl ?? null,
            esLider: id === g.liderId,
            soyYo: id === yoId,
            activo: p !== undefined,
          } satisfies MiembroDeGrupo
        })
        .sort((a, b) =>
          Number(b.esLider) - Number(a.esLider) || Number(b.soyYo) - Number(a.soyYo) || a.nombre.localeCompare(b.nombre, 'es')),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
