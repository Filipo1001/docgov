/**
 * Un cambio hecho en esta misma pantalla, y qué lecturas pueden deshacerlo.
 *
 * La pantalla del periodo se actualiza de dos formas tras subir o quitar un documento: AL INSTANTE, con lo que la acción
 * del servidor acaba de devolver, y un momento después con una lectura de la base que confirma. Antes solo existía la
 * segunda, así que entre el aviso «subido» y esa lectura (más la espera de la red) el botón seguía diciendo «Subir» y el
 * informe no se dejaba enviar.
 *
 * El riesgo de actualizar al instante es que llegue una lectura ANTERIOR (la del sondeo periódico, por ejemplo, lanzada
 * antes de subir y que vuelve después) y devuelva la pantalla al estado de antes. Esa lectura se descarta: es la que
 * empezó antes del último cambio local. La lectura que se lanza a continuación del cambio empieza después, y sí vale.
 */
export function lecturaVigente(inicioDeLaLectura: number, ultimoCambioLocal: number): boolean {
  return inicioDeLaLectura >= ultimoCambioLocal
}
