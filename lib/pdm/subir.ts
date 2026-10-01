/**
 * Subir un archivo directo al almacenamiento con una dirección firmada (el patrón de subida de
 * todo Contratista Digital: el servidor firma y el navegador sube, para no pasar varios MB por una
 * acción del servidor, que agota el tiempo de la función).
 *
 * Se reintenta solo ante fallos de red o de tiempo, con una pausa creciente. Un error HTTP
 * (rechazo del almacenamiento: tipo o tamaño) NO se reintenta: reintentar no lo arregla.
 */

export class ErrorDeSubida extends Error {
  constructor(mensaje: string, readonly http: boolean) {
    super(mensaje)
  }
}

function unIntento(url: string, archivo: File, tipo: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.timeout = 90_000
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new ErrorDeSubida(`El almacenamiento rechazó «${archivo.name}» (${xhr.status}).`, true)))
    xhr.onerror = () => reject(new ErrorDeSubida(`No se pudo subir «${archivo.name}». Revisa tu conexión.`, false))
    xhr.ontimeout = () => reject(new ErrorDeSubida(`«${archivo.name}» tardó demasiado en subirse. Revisa tu conexión.`, false))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', tipo)
    xhr.send(archivo)
  })
}

export async function subirArchivo(url: string, archivo: File, tipo: string, reintentos = 2): Promise<void> {
  for (let n = 0; ; n++) {
    if (n > 0) await new Promise(r => setTimeout(r, n * 1000))
    try {
      return await unIntento(url, archivo, tipo)
    } catch (e) {
      if (e instanceof ErrorDeSubida && !e.http && n < reintentos) continue
      throw e
    }
  }
}
