/**
 * La cola de archivos que se están adjuntando a un reporte: qué se acepta, qué se rechaza y con qué palabras, y cómo va
 * cada uno.
 *
 * Funciones puras y sin `'use client'`: las usa el formulario, las prueban los tests y no saben nada del navegador (un
 * «archivo» es cualquier cosa con nombre, tamaño, tipo y fecha, que es lo que tiene un `File`).
 *
 * ── Qué se cuida ─────────────────────────────────────────────────────────
 *
 *   · Un archivo malo NO tumba a los buenos. Se adjuntan los que sirven y de cada rechazado se dice, con su nombre,
 *     POR QUÉ y qué hacer. Antes se mostraba un solo mensaje, que el siguiente archivo malo pisaba.
 *   · Las reglas son las mismas que impone el servidor y la base (`errorEnArchivos`): aquí se avisa a tiempo y en
 *     palabras de persona; no se sustituye a nadie.
 *   · El motivo no repite el nombre del archivo: la pantalla ya lo pone al lado.
 */

import { MAX_BYTES_EVIDENCIA, MAX_EVIDENCIAS, MAX_NOMBRE_ARCHIVO, describirTamano, tipoDeArchivo } from './seguimiento-acciones'

/** Lo que se necesita saber de un archivo (un `File` lo cumple). */
export interface ArchivoLike {
  name: string
  size: number
  type: string
  lastModified: number
}

export type EstadoArchivo = 'listo' | 'subiendo' | 'subido' | 'error'

export interface ArchivoEnCola<F extends ArchivoLike = ArchivoLike> {
  /** Identifica al archivo mientras está en la cola: nombre, tamaño y fecha de modificación. */
  clave: string
  archivo: F
  estado: EstadoArchivo
  /** De 0 a 1. */
  progreso: number
  /** Dónde quedó en el almacenamiento, cuando ya se subió. */
  ruta?: string
  /** El tipo con que se subió (el que resolvió el servidor, no el declarado). */
  tipo?: string
  error?: string
  /** Dirección temporal con la vista previa de una foto (la crea y la libera quien tiene la cola). */
  vista?: string
}

export const claveDe = (f: ArchivoLike): string => `${f.name}:${f.size}:${f.lastModified}`

export function entradaNueva<F extends ArchivoLike>(archivo: F): ArchivoEnCola<F> {
  return { clave: claveDe(archivo), archivo, estado: 'listo', progreso: 0 }
}

// ─── Por qué se rechaza un archivo ───────────────────────────────────────────

const CONSEJOS: { extensiones: string[]; consejo: string }[] = [
  { extensiones: ['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'key'], consejo: 'Las presentaciones no se admiten todavía: expórtala a PDF.' },
  { extensiones: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'webm', 'm4v', '3gp'], consejo: 'Los videos no se admiten: adjunta una foto o un acta en PDF.' },
  { extensiones: ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'opus'], consejo: 'El audio no se admite: adjunta el acta o la lista de asistencia.' },
  { extensiones: ['zip', 'rar', '7z', 'tar', 'gz'], consejo: 'Los comprimidos no se admiten: adjunta los archivos por separado.' },
  { extensiones: ['csv'], consejo: 'Ábrelo en Excel y guárdalo como libro de Excel (.xlsx).' },
  { extensiones: ['txt', 'rtf', 'odt', 'md'], consejo: 'Guárdalo como PDF o como Word (.docx).' },
  { extensiones: ['gif', 'bmp', 'tif', 'tiff', 'svg', 'avif', 'ico'], consejo: 'Guarda la imagen como JPG o PNG.' },
  { extensiones: ['xlsm', 'xlsb', 'docm', 'ods'], consejo: 'Guárdalo como Word (.docx) o Excel (.xlsx) normal.' },
]

export const FORMATOS_ADMITIDOS = 'Solo se admiten PDF, fotos (JPG, PNG, WebP o HEIC), Word y Excel.'

const extensionDe = (nombre: string): string => (nombre.includes('.') ? nombre.split('.').pop()!.toLowerCase() : '')

/** Qué hacer con un formato que no se admite, si se sabe; si no, la lista de los que sí. */
export function consejoDeFormato(nombre: string): string {
  const ext = extensionDe(nombre)
  return CONSEJOS.find(c => c.extensiones.includes(ext))?.consejo ?? FORMATOS_ADMITIDOS
}

/** `null` si el archivo sirve como evidencia; si no, la razón, sin repetir su nombre. */
export function motivoDeRechazo(f: ArchivoLike): string | null {
  if (!f.name.trim() || f.name.length > MAX_NOMBRE_ARCHIVO) return `Su nombre no sirve (hasta ${MAX_NOMBRE_ARCHIVO} caracteres).`
  if (!Number.isFinite(f.size) || f.size < 1) return 'Está vacío.'
  if (!tipoDeArchivo(f.name, f.type)) return `Formato no admitido. ${consejoDeFormato(f.name)}`
  if (f.size > MAX_BYTES_EVIDENCIA) {
    return `Pesa ${describirTamano(f.size)} y el máximo es ${describirTamano(MAX_BYTES_EVIDENCIA)}. Comprímelo o divídelo.`
  }
  return null
}

export interface Rechazo {
  nombre: string
  motivo: string
}

export interface Seleccion<F extends ArchivoLike> {
  aceptados: F[]
  rechazados: Rechazo[]
  /** Cuántos ya estaban adjuntos (o venían repetidos en la misma selección): se ignoran sin ruido. */
  repetidos: number
}

/**
 * Separa lo que se eligió en lo que se adjunta y lo que no.
 *
 * `existentes` son los de la cola; `conservadas`, los de la versión anterior que pasan a esta (cuentan para el tope de
 * cinco). Se respeta el orden en que se eligieron: si no caben todos, se adjuntan los primeros.
 */
export function clasificarSeleccion<F extends ArchivoLike>(existentes: readonly ArchivoLike[], conservadas: number, nuevos: readonly F[]): Seleccion<F> {
  const vistos = new Set(existentes.map(claveDe))
  const aceptados: F[] = []
  const rechazados: Rechazo[] = []
  let repetidos = 0
  for (const f of nuevos) {
    const clave = claveDe(f)
    if (vistos.has(clave)) { repetidos++; continue }
    const motivo = motivoDeRechazo(f)
    if (motivo) { rechazados.push({ nombre: f.name, motivo }); continue }
    if (existentes.length + aceptados.length + conservadas >= MAX_EVIDENCIAS) {
      rechazados.push({ nombre: f.name, motivo: `No cabe: una evidencia admite hasta ${MAX_EVIDENCIAS} archivos.` })
      continue
    }
    vistos.add(clave)
    aceptados.push(f)
  }
  return { aceptados, rechazados, repetidos }
}

// ─── Cómo va la subida ───────────────────────────────────────────────────────

export interface ResumenDeSubida {
  /** Cuántos ya están en el almacenamiento. */
  subidos: number
  total: number
  /** 0–100, ponderado por tamaño (un PDF de 8 MB pesa más que un acta de 40 KB). */
  porcentaje: number
  fallidos: number
}

export function resumenDeSubida(cola: readonly ArchivoEnCola[]): ResumenDeSubida {
  let bytes = 0
  let hechos = 0
  let subidos = 0
  let fallidos = 0
  for (const e of cola) {
    const peso = Math.max(1, e.archivo.size)
    bytes += peso
    hechos += peso * (e.estado === 'subido' ? 1 : e.estado === 'subiendo' ? Math.min(1, Math.max(0, e.progreso)) : 0)
    if (e.estado === 'subido') subidos++
    if (e.estado === 'error') fallidos++
  }
  return { subidos, total: cola.length, porcentaje: bytes === 0 ? 0 : Math.min(100, Math.floor((hechos / bytes) * 100)), fallidos }
}

/** Lo que se le dice a quien envió cuando uno o varios archivos no subieron. Aquí se pone, una sola vez, qué hacer. */
export function mensajeDeFallos(fallidos: readonly ArchivoEnCola[]): string {
  if (fallidos.length === 1) {
    const f = fallidos[0]
    return `«${f.archivo.name}»: ${f.error ?? 'No se pudo subir.'} Pulsa «Reintentar» para subirlo de nuevo.`
  }
  return `No se pudieron subir ${fallidos.length} archivos. Revisa tu conexión y pulsa «Reintentar»: los que ya subieron no se repiten.`
}

/** ¿Es una imagen que el navegador sabe dibujar? (HEIC solo lo dibuja Safari: ahí se usa la insignia.) */
export function esImagenDibujable(f: ArchivoLike): boolean {
  return f.type.startsWith('image/') && !/hei[cf]/i.test(f.type) && !/\.hei[cf]$/i.test(f.name)
}
