import { asignarGrupo, asignarPersona, eliminarGrupo, guardarGrupo, quitarApoyo } from '@/app/actions/pdm'
import type { AccionesPdm } from '@/lib/pdm/acciones'

/**
 * Las acciones de verdad: las del servidor. Las pantallas las reciben por una
 * propiedad con esto como valor por defecto, para poder probarlas con un doble
 * sin tocar la base.
 */
export const ACCIONES_REALES: AccionesPdm = { asignarPersona, asignarGrupo, quitarApoyo, guardarGrupo, eliminarGrupo }
