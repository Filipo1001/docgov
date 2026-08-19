import 'server-only'

/**
 * lib/pdf-validacion.ts — Verificación real del contenido de un PDF.
 *
 * El MIME que declara el navegador lo controla el cliente por completo: un
 * ejecutable renombrado a .pdf lo declara como application/pdf sin problema.
 * Aquí se comprueba el contenido REAL del archivo ya subido, antes de
 * habilitarlo para descarga o para anexarlo al Informe de Actividades.
 */

/**
 * Límites del anexo del informe. Rigen también los documentos del expediente
 * que tienen un tipo definido (contrato firmado, CDP, RP, RUT, certificación
 * bancaria, póliza): todos son documentos de pocas páginas.
 *
 * El bucket `adjuntos` admite hasta 45 MB para dar cabida a los documentos
 * adicionales (ver ADICIONAL_MAX_BYTES). Ya no coincide con este número, así
 * que el tope de 15 MB de los anexos lo sostiene ÚNICAMENTE esta capa: si se
 * quita la comprobación de la acción, Storage aceptará el archivo.
 */
export const ADJUNTO_MAX_BYTES = 15 * 1024 * 1024        // 15 MB por archivo
export const ADJUNTO_MAX_TOTAL_BYTES = 40 * 1024 * 1024  // 40 MB de anexos por periodo
export const ADJUNTO_MAX_PAGINAS = 60                    // tope de páginas por anexo

/**
 * Límites de los «Documentos adicionales» del expediente (tipo `otro`).
 *
 * El triple que el resto, y por una razón concreta: esa casilla recoge
 * otrosíes, conceptos jurídicos y soportes que no encajan en ninguna categoría
 * —justo los documentos que se alargan—. Un concepto jurídico escaneado supera
 * las 60 páginas con facilidad, y con el tope anterior no había forma de
 * archivarlo.
 *
 * No se sube el límite para todos porque los anexos del informe se incrustan en
 * el PDF del Informe de Actividades: ahí cada página extra la paga quien abra
 * el documento. El expediente, en cambio, se consulta archivo por archivo.
 */
export const ADICIONAL_MAX_BYTES = 45 * 1024 * 1024      // 45 MB
export const ADICIONAL_MAX_PAGINAS = 180                 // 180 páginas

export interface ResultadoValidacion {
  ok: boolean
  /** Motivo legible para mostrar al usuario. Vacío si ok. */
  error?: string
  paginas?: number
}

/** Topes aplicables a una validación concreta. */
export interface LimitesPDF {
  maxBytes: number
  maxPaginas: number
}

/**
 * Un PDF válido empieza por "%PDF-" (0x25 0x50 0x44 0x46 0x2D). Comprobarlo
 * descarta de entrada cualquier archivo con extensión falseada.
 */
function tieneFirmaPDF(buf: Buffer): boolean {
  return buf.length >= 5 &&
    buf[0] === 0x25 && buf[1] === 0x50 &&
    buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d
}

/**
 * Verifica un PDF subido: firma binaria, que se pueda abrir, que no esté
 * cifrado y que no exceda el tope de páginas.
 *
 * El cifrado se detecta explícitamente porque es un caso MUY común en Colombia
 * (certificaciones bancarias y varios documentos oficiales vienen protegidos
 * por defecto). Si no se detecta aquí, el fallo aparecería mucho más tarde, al
 * intentar generar el informe, y sería incomprensible para el usuario.
 */
export async function validarPDF(
  buf: Buffer,
  limites: LimitesPDF = { maxBytes: ADJUNTO_MAX_BYTES, maxPaginas: ADJUNTO_MAX_PAGINAS },
): Promise<ResultadoValidacion> {
  if (!tieneFirmaPDF(buf)) {
    return { ok: false, error: 'El archivo no es un PDF válido. Verifica que no se haya renombrado otro tipo de archivo.' }
  }

  if (buf.length > limites.maxBytes) {
    return { ok: false, error: `El archivo supera el máximo de ${Math.round(limites.maxBytes / 1024 / 1024)} MB.` }
  }

  try {
    const { PDFDocument } = await import('pdf-lib')
    // ignoreEncryption:false → pdf-lib lanza si el documento está cifrado,
    // que es justo lo que queremos detectar aquí y no al generar el informe.
    const doc = await PDFDocument.load(buf, { ignoreEncryption: false, updateMetadata: false })
    const paginas = doc.getPageCount()

    if (paginas === 0) {
      return { ok: false, error: 'El PDF no contiene páginas.' }
    }
    if (paginas > limites.maxPaginas) {
      return { ok: false, error: `El PDF tiene ${paginas} páginas; el máximo permitido es ${limites.maxPaginas}.` }
    }

    return { ok: true, paginas }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message.toLowerCase() : ''
    if (msg.includes('encrypt') || msg.includes('password')) {
      return {
        ok: false,
        error: 'El PDF está protegido con contraseña. Guárdalo sin protección y vuelve a subirlo.',
      }
    }
    return { ok: false, error: 'No se pudo leer el PDF. Puede estar dañado o incompleto.' }
  }
}
