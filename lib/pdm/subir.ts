/**
 * Subir un archivo directo al almacenamiento con una dirección firmada (el patrón de subida de
 * todo Contratista Digital: el servidor firma y el navegador sube, para no pasar varios MB por una
 * acción del servidor, que agota el tiempo de la función).
 *
 * ── Cómo se comporta ─────────────────────────────────────────────────────
 *
 *   · Avisa del avance (`alProgreso`, de 0 a 1) para que cada archivo muestre su barra.
 *   · No corta por «tardó demasiado en total»: corta si pasan 30 s SIN que avance ni un byte. Un PDF de 9 MB por una
 *     conexión lenta puede tardar varios minutos y estar subiendo bien; antes se le daban 90 s y se rendía a los 90.
 *   · Se reintenta solo ante fallos de red o de estancamiento, con una pausa creciente. Un rechazo del almacenamiento
 *     (tipo, tamaño, dirección vencida) NO se reintenta aquí: reintentar la misma dirección no lo arregla. Quien llama
 *     decide: la pantalla pide una dirección nueva al pulsar «Reintentar».
 *   · Los mensajes dicen qué pasó en palabras de persona (el número del error, solo cuando no hay otra cosa que decir).
 */

export class ErrorDeSubida extends Error {
  constructor(mensaje: string, readonly http: boolean) {
    super(mensaje)
  }
}

/** Cuánto se espera sin que avance un solo byte antes de darlo por estancado. */
export const MS_SIN_AVANCE = 30_000

/**
 * Qué le pasó al archivo, SIN su nombre ni la instrucción de qué hacer: la fila ya lo muestra debajo del nombre, y quien
 * arma el aviso general (`mensajeDeFallos`) añade el «Pulsa Reintentar» una sola vez.
 */
function rechazo(estado: number): string {
  if (estado === 413) return 'Pesa más de lo permitido.'
  if (estado === 400 || estado === 415) return 'El almacenamiento no lo aceptó: revisa que sea PDF, foto, Word o Excel.'
  if (estado === 401 || estado === 403) return 'La subida venció.'
  if (estado === 409) return 'Ya estaba subido.'
  return `No se pudo subir (error ${estado}).`
}

function unIntento(url: string, archivo: File, tipo: string, alProgreso?: (fraccion: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let guardia: ReturnType<typeof setTimeout> | undefined
    const terminar = () => clearTimeout(guardia)
    const armar = () => {
      clearTimeout(guardia)
      guardia = setTimeout(() => {
        xhr.abort()
        reject(new ErrorDeSubida('Dejó de avanzar. Revisa tu conexión.', false))
      }, MS_SIN_AVANCE)
    }
    xhr.upload.onprogress = e => {
      armar()
      // Nunca 100 % hasta que el almacenamiento confirma (`onload`): enviar todos los bytes no es haber terminado.
      if (e.lengthComputable && e.total > 0) alProgreso?.(Math.min(0.99, e.loaded / e.total))
    }
    xhr.onload = () => {
      terminar()
      if (xhr.status >= 200 && xhr.status < 300) { alProgreso?.(1); resolve() }
      else reject(new ErrorDeSubida(rechazo(xhr.status), true))
    }
    xhr.onerror = () => { terminar(); reject(new ErrorDeSubida('No se pudo subir. Revisa tu conexión.', false)) }
    xhr.onabort = () => terminar()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', tipo)
    armar()
    xhr.send(archivo)
  })
}

export async function subirArchivo(
  url: string, archivo: File, tipo: string,
  { reintentos = 2, alProgreso }: { reintentos?: number; alProgreso?: (fraccion: number) => void } = {},
): Promise<void> {
  for (let n = 0; ; n++) {
    if (n > 0) { alProgreso?.(0); await new Promise(r => setTimeout(r, n * 1000)) }
    try {
      return await unIntento(url, archivo, tipo, alProgreso)
    } catch (e) {
      if (e instanceof ErrorDeSubida && !e.http && n < reintentos) continue
      throw e
    }
  }
}
