/**
 * Comprobación LIGERA de que un archivo subido es un PDF: solo sus primeros bytes y su tamaño.
 *
 * `validarPDF` (lib/pdf-validacion.ts) descarga el archivo entero y lo abre con pdf-lib para contar páginas y detectar
 * el cifrado. Eso tiene sentido para lo que se incrusta en el Informe de Actividades, pero para un documento que solo
 * viaja tal cual dentro de un ZIP (el soporte del pago) costaba entre uno y tres segundos de servidor por archivo
 * mientras el usuario miraba «Subiendo…». Aquí basta lo que protege de verdad: que lo subido SEA un PDF (no un
 * ejecutable renombrado) y que no pase el tope.
 *
 * Se pide a Storage solo el primer kilobyte (`Range`), y el tamaño total sale de la cabecera `Content-Range`.
 * Funciones puras, sin acceso a red, para poder probarlas.
 */

/** Un PDF válido empieza por «%PDF-». Descarta de entrada cualquier archivo con la extensión falseada. */
export function esCabeceraPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46 &&
    bytes[4] === 0x2d
}

/**
 * El tamaño total del archivo según `Content-Range` («bytes 0-1023/2345678»). Devuelve null si no viene o no se
 * entiende (un servidor que ignora `Range` responde 200 sin esa cabecera: quien llama decide qué hacer).
 */
export function tamanoTotalDeContentRange(contentRange: string | null | undefined): number | null {
  if (!contentRange) return null
  const m = /^bytes\s+\d+-\d+\/(\d+)$/i.exec(contentRange.trim())
  if (!m) return null
  const n = Number(m[1])
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}
