/**
 * El PAQUETE (ZIP) de una versión de reporte: los archivos originales, su constancia en PDF y el listado de huellas.
 *
 * Es para quien necesita llevarse TODO lo que respalda un reporte —rendición de cuentas, Control Interno, el Concejo, un ente de
 * control— y poder demostrar después que no cambió: junto a cada original va su huella SHA-256 en el formato que entienden
 * `shasum` y `sha256sum` (`huellas-sha256.txt`), y la constancia lleva el QR a la página pública.
 *
 * Qué lleva el ZIP:
 *
 *   constancia-PDM-XXXX-XXXX.pdf     la constancia (la misma que baja el botón de «Constancia (PDF)»)
 *   archivos/01-<nombre original>    cada archivo, byte por byte como se subió (el número da el orden y evita choques de nombre)
 *   huellas-sha256.txt               «huella  archivos/nombre», una línea por archivo: se comprueba con `shasum -a 256 -c`
 *   LEEME.txt                        qué es esto, cómo se comprueba, y si cada archivo coincide con lo que se registró al subirlo
 *
 * SI LOS ARCHIVOS NO CABEN (un video de 150 MB), el paquete sale igual con los que sí caben —primero los más pequeños— y dice,
 * arriba del LEEME y en la respuesta, cuáles dejó fuera, con la huella que se registró al subirlos. Un paquete que parece completo
 * y no lo es sería peor que ninguno; uno que lo declara sigue sirviendo de prueba de lo que contiene.
 *
 * LAS HUELLAS DEL LISTADO SE CALCULAN AL EMPAQUETAR, sobre los bytes que de verdad van dentro del ZIP, y se COMPARAN con la que
 * el servidor anotó cuando el archivo se subió: así el paquete dice, archivo por archivo, «coincide» o «NO COINCIDE» con lo
 * registrado (o «sin huella registrada»). Un archivo que no coincide no se esconde ni se corrige: va en el paquete, marcado.
 *
 * Aquí no hay servidor ni base: la lectura de los archivos entra como una función, y por eso se prueba entera.
 */

import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { etiquetaDeTipo } from './constancia'

/**
 * Lo más que pesa un paquete (suma de sus archivos). Se arma EN MEMORIA, en una función de Vercel: con los archivos, el ZIP y la copia
 * que se envía caben unos 3 × este tamaño. Cinco archivos que no son video (25 MB cada uno) entran enteros; un video grande, no.
 * Lo que no cabe NO tumba el paquete: se deja fuera y se declara (ver `ArchivoOmitido`).
 */
export const MAX_BYTES_DE_PAQUETE = 150 * 1024 * 1024

export type EstadoDeHuella = 'coincide' | 'no_coincide' | 'sin_registro'

/** Una evidencia tal como la ve el servidor: su nombre original solo se usa DENTRO del ZIP, para quien tiene acceso. */
export interface EvidenciaParaPaquete {
  ruta: string
  nombre: string
  tipo: string
  bytes: number
  /** La huella que se anotó al subirla, o `null` si no se calculó. */
  sha256: string | null
}

export interface ArchivoEmpaquetado {
  /** Cómo se llama dentro del ZIP, sin la carpeta: «01-informe.pdf» (solo ASCII). */
  nombreEnPaquete: string
  /** Cómo se llamaba al subirlo: va en el LEEME, que es texto UTF-8. */
  nombreOriginal: string
  tipo: string
  bytes: number
  /** La huella de los bytes que van en el ZIP. */
  sha256: string
  registrada: string | null
  estado: EstadoDeHuella
}

/** Un archivo que no cupo en el paquete: se sabe qué es y qué huella se registró, pero sus bytes no van. */
export interface ArchivoOmitido {
  /** Su número en el reporte (desde 1): el mismo que habría llevado en el ZIP. */
  numero: number
  nombreOriginal: string
  tipo: string
  bytes: number
  /** La huella que se anotó al subirlo, o `null`. Es la REGISTRADA: aquí no se leyó el archivo. */
  registrada: string | null
}

// ─── Nombres dentro del ZIP ───────────────────────────────────────────────────

const EXTENSION_POR_TIPO: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
}

const RESERVADOS_DE_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_BASE = 100

/**
 * Un nombre de archivo que se pueda escribir en cualquier sistema y que nunca salga de su carpeta: sin separadores de ruta, sin
 * caracteres de control ni los que Windows prohíbe, sin puntos al principio o al final, sin nombres reservados (CON, NUL…) y de
 * un largo razonable conservando la extensión. Si no queda nada, `archivo`.
 *
 * SOLO ASCII: sin tildes ni eñes («Informe de gestión» → «Informe de gestion»). Medido con el `unzip` que trae macOS: un nombre
 * con tilde dentro de un ZIP se descomprime como «gesti+?n» y la extracción falla, y con ella `shasum -c`. El nombre ORIGINAL
 * no se pierde: va en el LEEME.
 */
export function nombreSeguroDeArchivo(nombre: string, tipo = ''): string {
  let n = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
  let ext = ''
  const punto = n.lastIndexOf('.')
  if (punto > 0 && n.length - punto <= 8) { ext = n.slice(punto); n = n.slice(0, punto) }
  n = n.trim().replace(/[.\s]+$/g, '')
  if (n === '') n = 'archivo'
  if (RESERVADOS_DE_WINDOWS.test(n)) n = `_${n}`
  if (n.length > MAX_BASE) n = n.slice(0, MAX_BASE).trim()
  if (ext === '' && EXTENSION_POR_TIPO[tipo]) ext = `.${EXTENSION_POR_TIPO[tipo]}`
  return `${n}${ext}`
}

/** «01-informe.pdf»: el número (desde 1) da el orden en que se subieron y hace único el nombre aunque dos archivos se llamen igual. */
export const nombreEnPaquete = (indice: number, nombre: string, tipo = ''): string =>
  `${String(indice + 1).padStart(2, '0')}-${nombreSeguroDeArchivo(nombre, tipo)}`

export function estadoDeHuella(registrada: string | null, calculada: string): EstadoDeHuella {
  if (registrada === null) return 'sin_registro'
  return registrada === calculada ? 'coincide' : 'no_coincide'
}

// ─── Los textos ───────────────────────────────────────────────────────────────

/**
 * El listado en el formato de `sha256sum`/`shasum`: «huella», dos espacios y la ruta. Solo líneas de huella (sin comentarios): así
 * `shasum -a 256 -c huellas-sha256.txt` lo lee tal cual. Va con saltos de línea \n y termina en uno.
 */
export function listadoDeHuellas(archivos: Pick<ArchivoEmpaquetado, 'sha256' | 'nombreEnPaquete'>[]): string {
  return archivos.map(a => `${a.sha256}  archivos/${a.nombreEnPaquete}`).join('\n') + (archivos.length > 0 ? '\n' : '')
}

const FRASE_DE_ESTADO: Record<EstadoDeHuella, string> = {
  coincide: 'COINCIDE con la huella registrada al subirlo',
  no_coincide: '*** NO COINCIDE con la huella registrada al subirlo ***',
  sin_registro: 'sin huella registrada al subirlo (la de arriba se calculó al empaquetar)',
}

function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`
}

export function textoLeeme(a: { codigo: string; url: string; generadoEn: string; archivos: ArchivoEmpaquetado[]; omitidos?: ArchivoOmitido[] }): string {
  const omitidos = a.omitidos ?? []
  const discrepancias = a.archivos.filter(x => x.estado === 'no_coincide').length
  const sinRegistro = a.archivos.filter(x => x.estado === 'sin_registro').length
  const lineas: string[] = [
    `PAQUETE DE UNA VERSIÓN DE REPORTE — ${a.codigo}`,
    'Contratista Digital · Plan de Desarrollo',
    '',
    `Generado el ${a.generadoEn} (hora de Colombia).`,
    '',
    'QUÉ HAY AQUÍ',
    ...[
      [`constancia-${a.codigo}.pdf`, 'La constancia de esta versión del reporte, con su código y su QR.'],
      ['archivos/', 'Los archivos que respaldan el reporte, tal como se subieron.'],
      ['huellas-sha256.txt', 'La huella SHA-256 de cada archivo, en el formato de «shasum» y «sha256sum».'],
    ].map(([nombre, que]) => `  ${nombre.padEnd(`constancia-${a.codigo}.pdf`.length)}   ${que}`),
    '',
    'ESTADO VIVO DEL REPORTE',
    `  Esta carpeta es una FOTO del momento en que se generó. El estado de hoy (aprobado, devuelto, anulado, o si hay una versión`,
    `  más reciente) se consulta escaneando el QR de la constancia o entrando a:`,
    `  ${a.url}`,
    '',
  ]
  if (discrepancias > 0) {
    lineas.push(
      '*** ATENCIÓN ***',
      `  ${discrepancias === 1 ? 'Un archivo NO coincide' : `${discrepancias} archivos NO coinciden`} con la huella que el sistema registró cuando se subió.`,
      '  Eso significa que el archivo guardado hoy no es idéntico al de entonces. No use este paquete como prueba sin avisar al',
      '  administrador del sistema.',
      '',
    )
  }
  if (omitidos.length > 0) {
    lineas.push(
      '*** ESTE PAQUETE NO INCLUYE TODOS LOS ARCHIVOS ***',
      `  ${omitidos.length === 1 ? 'Un archivo no cupo' : `${omitidos.length} archivos no cupieron`} (un paquete admite hasta ${tamano(MAX_BYTES_DE_PAQUETE)}) y NO ${omitidos.length === 1 ? 'está' : 'están'} en esta carpeta.`,
      '  Más abajo, en «ARCHIVOS QUE NO ESTÁN EN ESTE PAQUETE», se dice cuáles son y cuál es la huella que se registró al subirlos.',
      '',
    )
  }
  lineas.push('ARCHIVOS')
  if (a.archivos.length === 0) lineas.push(omitidos.length > 0 ? '  Ningún archivo cupo en este paquete.' : '  Esta versión del reporte no tiene archivos.')
  for (const f of a.archivos) {
    lineas.push(
      `  archivos/${f.nombreEnPaquete}`,
      `    Nombre original: ${f.nombreOriginal}`,
      `    ${etiquetaDeTipo(f.tipo)} · ${tamano(f.bytes)}`,
      `    SHA-256  ${f.sha256}`,
      `    ${FRASE_DE_ESTADO[f.estado]}`,
      '',
    )
  }
  if (sinRegistro > 0) {
    lineas.push('  Un archivo «sin huella registrada» es uno al que el sistema no le calculó la huella cuando se subió: su huella aquí', '  se calculó al empaquetar y dice qué contiene HOY, no qué contenía al subirse.', '')
  }
  if (omitidos.length > 0) {
    lineas.push('ARCHIVOS QUE NO ESTÁN EN ESTE PAQUETE')
    for (const f of omitidos) {
      lineas.push(
        `  ${String(f.numero).padStart(2, '0')} · ${f.nombreOriginal}`,
        `    ${etiquetaDeTipo(f.tipo)} · ${tamano(f.bytes)}`,
        f.registrada ? `    SHA-256 registrada al subirlo  ${f.registrada}` : '    Sin huella registrada al subirlo.',
        '',
      )
    }
    lineas.push(
      '  Descárguelos desde el reporte, en la aplicación (Plan de Desarrollo → el indicador → ese reporte). Al recibirlos, compruebe que',
      '  su huella sea la registrada con los pasos de abajo: la de cada archivo no se calculó aquí porque no se leyó.',
      '',
    )
  }
  lineas.push(
    'CÓMO COMPROBAR QUE UN ARCHIVO NO CAMBIÓ',
    '  Mac o Linux (en una terminal, dentro de esta carpeta):',
    '      shasum -a 256 -c huellas-sha256.txt',
    '  Windows (PowerShell, dentro de esta carpeta), un archivo a la vez:',
    '      Get-FileHash -Algorithm SHA256 "archivos\\01-nombre.pdf"',
    '  La huella tiene que ser idéntica a la del listado. Cambiar un solo byte del archivo cambia por completo la huella.',
    '',
    'CÓMO COMPROBAR UN ARCHIVO QUE LE LLEGÓ POR OTRO CAMINO',
    `  Entre a ${a.url} y suelte el archivo en «Comprobar un archivo»: su navegador calcula la huella en su dispositivo (el archivo`,
    '  no se sube) y le dice si es idéntico a alguno de los registrados en esta versión del reporte.',
    '',
  )
  return lineas.join('\n')
}

// ─── Armar el ZIP ─────────────────────────────────────────────────────────────

export interface EntradaDePaquete {
  codigo: string
  /** Dirección pública de verificación de la constancia. */
  url: string
  constanciaPdf: Uint8Array
  evidencias: EvidenciaParaPaquete[]
  /** Lee un archivo del almacenamiento. Si no puede, lanza: un paquete incompleto por una falla no se entrega. */
  leer: (ruta: string) => Promise<Uint8Array>
  /** Cuándo se genera, ya dicho («19 oct 2026 · 10:42»). */
  generadoEn: string
}

export type ResultadoDePaquete =
  | { ok: true; zip: Uint8Array; archivos: ArchivoEmpaquetado[]; omitidos: ArchivoOmitido[]; discrepancias: number; bytes: number }
  | { ok: false; motivo: 'ilegible'; error: string }

/**
 * Qué archivos entran. Los más pequeños primero: así se llevan cuantos más se pueda y lo que se queda fuera es lo grande (un
 * video), que de todos modos se descarga aparte. A igual tamaño, el orden del reporte. Devuelve los índices (desde 0) que entran.
 */
export function indicesQueCaben(pesos: number[], tope: number): Set<number> {
  const entran = new Set<number>()
  let suma = 0
  const orden = pesos.map((p, i) => ({ p: Math.max(0, p), i })).sort((a, b) => a.p - b.p || a.i - b.i)
  for (const { p, i } of orden) {
    if (suma + p > tope) continue
    suma += p
    entran.add(i)
  }
  return entran
}

export async function armarPaquete(e: EntradaDePaquete): Promise<ResultadoDePaquete> {
  // Lo declarado ya dice qué cabe: lo que no cabe ni se lee.
  const caben = indicesQueCaben(e.evidencias.map(x => x.bytes), MAX_BYTES_DE_PAQUETE)
  const omitidos: ArchivoOmitido[] = []
  const omitir = (ev: EvidenciaParaPaquete, indice: number, bytes = ev.bytes) =>
    omitidos.push({ numero: indice + 1, nombreOriginal: ev.nombre, tipo: ev.tipo, bytes, registrada: ev.sha256 })

  const leidos: { ev: EvidenciaParaPaquete; indice: number; datos: Uint8Array }[] = []
  let total = 0
  for (const [indice, ev] of e.evidencias.entries()) {
    if (!caben.has(indice)) { omitir(ev, indice); continue }
    let datos: Uint8Array
    try {
      datos = await e.leer(ev.ruta)
    } catch {
      return { ok: false, motivo: 'ilegible', error: 'No se pudo leer uno de los archivos del reporte. Inténtalo de nuevo en unos minutos.' }
    }
    // Lo que se lee puede pesar más que lo declarado: se vigila lo real, y lo que ya no cabe se deja fuera igual que lo demás.
    if (total + datos.byteLength > MAX_BYTES_DE_PAQUETE) { omitir(ev, indice, datos.byteLength); continue }
    total += datos.byteLength
    leidos.push({ ev, indice, datos })
  }

  const archivos: ArchivoEmpaquetado[] = leidos.map(({ ev, indice, datos }) => {
    const sha256 = createHash('sha256').update(datos).digest('hex')
    return {
      nombreEnPaquete: nombreEnPaquete(indice, ev.nombre, ev.tipo),
      nombreOriginal: ev.nombre,
      tipo: ev.tipo,
      bytes: datos.byteLength,
      sha256,
      registrada: ev.sha256,
      estado: estadoDeHuella(ev.sha256, sha256),
    }
  })
  omitidos.sort((a, b) => a.numero - b.numero)

  const zip = new JSZip()
  zip.file(`constancia-${e.codigo}.pdf`, e.constanciaPdf)
  const carpeta = zip.folder('archivos')!
  leidos.forEach(({ datos }, i) => carpeta.file(archivos[i].nombreEnPaquete, datos))
  zip.file('huellas-sha256.txt', listadoDeHuellas(archivos))
  zip.file('LEEME.txt', textoLeeme({ codigo: e.codigo, url: e.url, generadoEn: e.generadoEn, archivos, omitidos }))

  // STORE: los PDF y las imágenes ya vienen comprimidos; DEFLATE gastaría CPU sin ganancia.
  const salida = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
  return { ok: true, zip: salida, archivos, omitidos, discrepancias: archivos.filter(a => a.estado === 'no_coincide').length, bytes: total }
}

/** El nombre del archivo ZIP de un paquete. */
export const nombreDeArchivoDePaquete = (codigo: string): string => `paquete-${codigo}.zip`
