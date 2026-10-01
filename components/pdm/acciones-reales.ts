import {
  asignarGrupo, asignarPersona, deshabilitarPersona, eliminarGrupo, guardarGrupo, habilitarPersona,
  historialIndicador, quitarAsignacion,
} from '@/app/actions/pdm'
import type { AccionesPdm } from '@/lib/pdm/acciones'

/**
 * Las acciones de verdad: las del servidor. Las pantallas las reciben por una
 * propiedad con esto como valor por defecto, para poder probarlas con un doble
 * sin tocar la base.
 */
export const ACCIONES_REALES: AccionesPdm = {
  asignarPersona, asignarGrupo, quitarAsignacion, guardarGrupo, eliminarGrupo,
  habilitar: habilitarPersona, deshabilitar: deshabilitarPersona, historialIndicador,
}
