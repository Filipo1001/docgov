/**
 * Corre una tarea por elemento, con un máximo de tareas a la vez, y devuelve los resultados EN EL ORDEN de los elementos.
 *
 * Existe porque un reporte puede llevar muchos archivos (ver `MAX_EVIDENCIAS`): firmar la subida de cada uno y leerlo entero
 * del almacenamiento para calcular su huella, de uno en uno, tardaría de más; todos a la vez abriría decenas de lecturas
 * simultáneas dentro de una sola función del servidor. Con un límite pequeño (`LIMITE_EN_PARALELO`) se gana casi todo el tiempo
 * sin eso.
 *
 * Si una tarea LANZA un error, no se empieza ninguna más y el error se propaga (las que ya iban, terminan solas); las tareas
 * de este módulo devuelven su fallo como valor y no lanzan, así que en la práctica corren todas.
 *
 * Sin `server-only`: es una función pura y se prueba en tests/pdm/con-limite.test.ts.
 */

/** Cuántas tareas a la vez en el servidor: lo bastante para no esperar de más, lo bastante poco para no ahogar la función. */
export const LIMITE_EN_PARALELO = 6

export async function conLimite<T, R>(
  elementos: readonly T[],
  limite: number,
  tarea: (elemento: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(elementos.length)
  let siguiente = 0
  let fallo = false

  async function trabajador() {
    for (;;) {
      if (fallo) return
      const k = siguiente++
      if (k >= elementos.length) return
      try {
        resultados[k] = await tarea(elementos[k], k)
      } catch (e) {
        fallo = true
        throw e
      }
    }
  }

  const n = Math.max(1, Math.min(Math.floor(limite) || 1, elementos.length))
  await Promise.all(Array.from({ length: elementos.length === 0 ? 0 : n }, trabajador))
  return resultados
}
