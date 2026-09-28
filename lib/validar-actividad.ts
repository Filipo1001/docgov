/**
 * La regla de una actividad, en un solo sitio.
 *
 * El formulario la usa para atenuar —desactivar «Guardar», contar lo que falta—
 * y las acciones del servidor para decidir. Es deliberado que sea la misma
 * función: lo que el navegador insinúa y lo que el servidor exige tienen que
 * coincidir, o el contratista termina viendo un botón habilitado que devuelve
 * un error, que es la peor versión de las dos.
 *
 * ── Qué cambió y por qué ─────────────────────────────────────────────────
 *
 * Antes la cantidad tenía que ser 1 o más, así que no había manera de decir
 * «esta obligación no se requirió este mes». Sin esa manera, la única salida
 * era no registrar nada — y entonces el informe imprime «Permanente» en esa
 * obligación, porque el PDF trata «sin actividades» y «permanente» como el
 * mismo caso. Son cosas distintas: de las 1.302 obligaciones en producción,
 * ninguna está marcada como permanente.
 *
 * Ahora el cero se puede declarar, y como es una afirmación que la supervisión
 * va a leer en el documento, exige sustento. Veinte caracteres es un listón
 * bajo a propósito: ataja el «no» despachado de un golpe sin obligar a
 * redactar un párrafo.
 */

/** Longitud mínima del motivo cuando la obligación se declara sin ejecutar. */
export const MOTIVO_MINIMO = 20

/** Cuántos caracteres faltan para poder guardar. Cero si no falta ninguno. */
export function faltanParaMotivo(cantidad: number, texto: string): number {
  if (cantidad !== 0) return 0
  return Math.max(0, MOTIVO_MINIMO - texto.trim().length)
}

/**
 * Valida cantidad y descripción juntas. Devuelve el mensaje de error, o null.
 *
 * Van juntas porque la regla de la descripción depende de la cantidad: con
 * cero, el texto deja de describir una actividad y pasa a sustentar su
 * ausencia, y eso se exige distinto.
 */
export function validarActividad(cantidad: number, descripcion: string): string | null {
  if (!Number.isInteger(cantidad) || cantidad < 0) {
    return 'La cantidad debe ser un número entero de 0 o más'
  }
  if (cantidad > 999) {
    return 'La cantidad no puede superar 999'
  }
  if (cantidad === 0 && descripcion.trim().length < MOTIVO_MINIMO) {
    return 'Para dejar la obligación en cero tienes que explicar por qué no se requirió este mes'
  }
  return null
}
