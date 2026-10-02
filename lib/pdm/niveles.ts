/**
 * Los niveles de acceso al módulo Plan de Desarrollo.
 *
 * Solo tipos y utilidades puras, sin `server-only`: las usan tanto el servidor (la
 * puerta de cada pantalla) como el navegador (el marco decide qué pestañas pintar).
 *
 *   admin        el administrador de CD. No necesita fila en `pdm_permisos`: lo es por su rol.
 *   coordinador  la secretaría (el supervisor de una dependencia). Ve y asigna lo de la SUYA y
 *                habilita a su gente como `responsable`. La base lo exige, no solo la pantalla.
 *   consulta     Control Interno: ve todo y comenta, pero no cambia nada.
 *   responsable  quien lleva indicadores: ve lo suyo y lo reporta en cada año, con evidencia.
 *
 * `consulta`, `responsable` y `coordinador` son los tres valores que admite la columna
 * `pdm_permisos.nivel`; `admin` solo existe aquí.
 */

export type NivelHabilitable = 'coordinador' | 'consulta' | 'responsable'
export type NivelPdm = 'admin' | NivelHabilitable

export const NIVELES_HABILITABLES: readonly NivelHabilitable[] = ['responsable', 'coordinador', 'consulta']

export const esNivelHabilitable = (v: unknown): v is NivelHabilitable =>
  v === 'coordinador' || v === 'consulta' || v === 'responsable'

/** Quién reparte indicadores, crea grupos y da acceso. */
export const gestiona = (n: NivelPdm | null | undefined): boolean => n === 'admin' || n === 'coordinador'

/** Quién ve el directorio de personas: quienes gestionan y Control Interno. */
export const veDirectorio = (n: NivelPdm | null | undefined): boolean => gestiona(n) || n === 'consulta'

export const ETIQUETA_NIVEL: Record<NivelPdm, string> = {
  admin: 'Administrador',
  coordinador: 'Secretaría',
  consulta: 'Consulta',
  responsable: 'Responsable',
}

export const AYUDA_NIVEL: Record<NivelHabilitable, string> = {
  responsable: 'Ve los indicadores a su cargo y los reporta por año, con evidencia.',
  coordinador: 'Ve y asigna los indicadores de su secretaría, crea grupos, habilita a su gente y valida lo que reportan.',
  consulta: 'Ve todo el plan y lo comenta, sin cambiar nada (Control Interno).',
}
