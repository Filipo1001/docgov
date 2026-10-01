import {
  cambiarEstadoCorte, comentar, configurarPlan, detalleIndicador, eliminarCorte, guardarCorte,
  prepararEvidencias, reportar, urlEvidencia, validarReporte,
} from '@/app/actions/pdm-seguimiento'
import type { AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'

/**
 * Las acciones del seguimiento de verdad: las del servidor. Las pantallas las reciben por una
 * propiedad con esto como valor por defecto, para poder probarlas con un doble sin tocar la base.
 */
export const ACCIONES_SEGUIMIENTO_REALES: AccionesSeguimiento = {
  configurarPlan, guardarCorte, cambiarEstadoCorte, eliminarCorte, prepararEvidencias, reportar,
  validarReporte, comentar, detalleIndicador, urlEvidencia,
}
