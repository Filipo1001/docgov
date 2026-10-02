/**
 * Lo que el navegador y el servidor se dicen en el seguimiento por años (Fase B): las
 * entradas, las respuestas, el detalle de un indicador y las reglas que se comprueban antes de
 * preguntarle nada a la base.
 *
 * Solo tipos y funciones puras, sin `'use server'` ni `server-only`: lo usan los componentes de
 * cliente (para avisar antes de enviar) y las acciones del servidor (para validar lo que llega).
 * Las MISMAS reglas las impone la base de datos (migraciones 056 y 057): aquí se repiten para que el
 * mensaje llegue antes y en palabras de persona, no para sustituirla.
 */

import type { EstadoReporte } from './seguimiento'
import type { NivelPdm } from './niveles'
import type { Resultado } from './acciones'

// ─── Reglas ───────────────────────────────────────────────────────────────────

export const MAX_EVIDENCIAS = 5
export const MAX_BYTES_EVIDENCIA = 10 * 1024 * 1024
export const MIN_TEXTO = 10
export const MAX_TEXTO_REPORTE = 1000
export const MAX_MOTIVO_CORRECCION = 500
export const MAX_COMENTARIO = 2000
export const MAX_COMENTARIO_VALIDACION = 1000
export const MAX_OBSERVACION = 300
export const MAX_NOMBRE_ARCHIVO = 200

export interface TipoEvidencia {
  mime: string
  /** Extensión con la que se guarda en el almacenamiento. */
  ext: string
  /** Otras extensiones con que llega el mismo tipo. */
  alias?: string[]
}

/** Lo que se acepta como evidencia: la misma lista que el espacio `pdm-evidencias` y la función `pdm_reportar`. */
export const TIPOS_EVIDENCIA: readonly TipoEvidencia[] = [
  { mime: 'application/pdf', ext: 'pdf' },
  { mime: 'image/jpeg', ext: 'jpg', alias: ['jpeg'] },
  { mime: 'image/png', ext: 'png' },
  { mime: 'image/webp', ext: 'webp' },
  { mime: 'image/heic', ext: 'heic' },
  { mime: 'image/heif', ext: 'heif' },
  { mime: 'application/msword', ext: 'doc' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  { mime: 'application/vnd.ms-excel', ext: 'xls' },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
]

export const TEXTO_TIPOS_EVIDENCIA = 'PDF, foto, Word o Excel'

/**
 * Qué tipo de archivo es, o `null` si no se admite. Se cree primero lo que declara el navegador
 * y, si no declara nada útil (algunos teléfonos no mandan el tipo), se mira la extensión. La base
 * y el almacenamiento vuelven a comprobarlo: esto es solo para avisar a tiempo.
 */
export function tipoDeArchivo(nombre: string, declarado: string): TipoEvidencia | null {
  const d = declarado === 'image/jpg' ? 'image/jpeg' : declarado
  const porMime = TIPOS_EVIDENCIA.find(t => t.mime === d)
  if (porMime) return porMime
  if (d !== '' && d !== 'application/octet-stream') return null
  const ext = nombre.includes('.') ? nombre.split('.').pop()!.toLowerCase() : ''
  return TIPOS_EVIDENCIA.find(t => t.ext === ext || t.alias?.includes(ext)) ?? null
}

export function describirTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`
}

export interface ArchivoPorSubir {
  nombre: string
  /** Lo que declara el navegador (`File.type`). */
  tipo: string
  bytes: number
}

/**
 * `null` si los archivos sirven como evidencia; si no, qué falla. `conservadas` son los archivos de la versión
 * anterior que pasan a esta (solo al corregir): cuentan para el mínimo de uno y el máximo de cinco.
 */
export function errorEnArchivos(archivos: ArchivoPorSubir[], conservadas = 0): string | null {
  if (archivos.length + conservadas === 0) return 'Adjunta al menos una evidencia.'
  if (archivos.length + conservadas > MAX_EVIDENCIAS) return `Una evidencia admite hasta ${MAX_EVIDENCIAS} archivos.`
  for (const a of archivos) {
    if (!a.nombre.trim() || a.nombre.length > MAX_NOMBRE_ARCHIVO) return 'Un archivo tiene un nombre que no sirve.'
    if (!tipoDeArchivo(a.nombre, a.tipo)) return `«${a.nombre}»: solo se admite ${TEXTO_TIPOS_EVIDENCIA}.`
    if (!Number.isFinite(a.bytes) || a.bytes < 1) return `«${a.nombre}» está vacío.`
    if (a.bytes > MAX_BYTES_EVIDENCIA) return `«${a.nombre}» pesa ${describirTamano(a.bytes)}; el máximo es ${describirTamano(MAX_BYTES_EVIDENCIA)}.`
  }
  return null
}

/** Lo que se pide al servidor para poder subir los archivos directamente al almacenamiento. */
export interface EntradaPrepararEvidencias {
  /** `uuid` del indicador. */
  indicador: string
  /** El año del plan al que pertenece el reporte. */
  anio: number
  archivos: ArchivoPorSubir[]
}

export interface EvidenciaPreparada {
  ruta: string
  /** Dirección firmada y de un solo uso: el navegador sube el archivo con un PUT. */
  urlSubida: string
  /** El tipo con que hay que subirlo (el que se resolvió, no el declarado). */
  tipo: string
}

/** Una evidencia ya subida, tal como se registra. */
export interface EvidenciaSubida {
  ruta: string
  nombre: string
  tipo: string
  bytes: number
}

export interface EntradaReportar {
  indicador: string
  /** El año del plan del que se reporta el avance (se mide contra la meta de ESE año). */
  anio: number
  valor: number
  texto: string
  /** Los archivos NUEVOS, ya subidos. Pueden ser ninguno si se conserva al menos uno de la versión anterior. */
  evidencias: EvidenciaSubida[]
  /**
   * Ids de evidencias de la versión que se corrige, que pasan tal cual a la nueva (solo al corregir). Un archivo que
   * la secretaría devolvió no se conserva: se reemplaza o se quita.
   */
  conservar?: string[]
  /** Solo si el último reporte del año está sin cerrar (pendiente o devuelto): entonces esto es una corrección y el motivo es obligatorio. */
  motivo?: string
}

/** Un archivo que la secretaría devuelve, con lo que le pasa. */
export interface ObservacionArchivo {
  /** El id de la evidencia. */
  evidencia: string
  motivo: string
}

export interface EntradaValidar {
  reporte: string
  estado: 'aprobado' | 'devuelto'
  /** Obligatorio al devolver: sin decir qué falta, devolver no sirve. */
  comentario?: string
  /**
   * Los archivos con problema (solo al devolver). El reporte se devuelve COMPLETO —no se aprueba a medias—; quien
   * responde conserva los archivos que no se marcaron y reemplaza o quita los marcados.
   */
  observaciones?: ObservacionArchivo[]
}

export interface EntradaComentar {
  indicador: string
  texto: string
  /** Si el comentario es sobre un reporte concreto. */
  reporte?: string
}

/** `null` si lo escrito en el reporte sirve; si no, qué falla. `correccion`: el último reporte del año está sin cerrar. */
export function errorEnReporte(e: { valor: unknown; texto: unknown; motivo?: unknown }, correccion: boolean): string | null {
  const valor = e.valor
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return 'El valor debe ser un número igual o mayor que cero.'
  if (valor > 1e12) return 'Ese valor es demasiado grande.'
  const texto = typeof e.texto === 'string' ? e.texto.trim() : ''
  if (texto.length < MIN_TEXTO) return `Cuenta qué se hizo (al menos ${MIN_TEXTO} caracteres).`
  if (texto.length > MAX_TEXTO_REPORTE) return `La descripción no puede pasar de ${MAX_TEXTO_REPORTE} caracteres.`
  if (correccion) {
    const motivo = typeof e.motivo === 'string' ? e.motivo.trim() : ''
    if (motivo.length < MIN_TEXTO) return `Di qué corriges (al menos ${MIN_TEXTO} caracteres).`
    if (motivo.length > MAX_MOTIVO_CORRECCION) return `El motivo no puede pasar de ${MAX_MOTIVO_CORRECCION} caracteres.`
  }
  return null
}

/** Devolver exige decir qué falta; aprobar no pide nada. Los archivos observados solo se marcan al devolver, cada uno con su nota. */
export function errorEnValidacion(estado: unknown, comentario: unknown, observaciones?: unknown): string | null {
  if (estado !== 'aprobado' && estado !== 'devuelto') return 'Algo de lo elegido no es válido.'
  const c = typeof comentario === 'string' ? comentario.trim() : ''
  if (estado === 'devuelto' && c.length < MIN_TEXTO) return `Explica qué falta (al menos ${MIN_TEXTO} caracteres).`
  if (c.length > MAX_COMENTARIO_VALIDACION) return `El comentario no puede pasar de ${MAX_COMENTARIO_VALIDACION} caracteres.`
  if (observaciones === undefined || observaciones === null) return null
  if (!Array.isArray(observaciones)) return 'Algo de lo elegido no es válido.'
  if (observaciones.length === 0) return null
  if (estado !== 'devuelto') return 'Solo se marcan archivos al devolver un reporte.'
  if (observaciones.length > MAX_EVIDENCIAS) return `Un reporte tiene como máximo ${MAX_EVIDENCIAS} archivos.`
  const vistos = new Set<string>()
  for (const o of observaciones) {
    const id = typeof o?.evidencia === 'string' ? o.evidencia : ''
    const motivo = typeof o?.motivo === 'string' ? o.motivo.trim() : ''
    if (id === '') return 'Algo de lo elegido no es válido.'
    if (vistos.has(id)) return 'Un archivo está marcado dos veces.'
    vistos.add(id)
    if (motivo === '') return 'Escribe qué le pasa a cada archivo que devuelves.'
    if (motivo.length > MAX_OBSERVACION) return `La nota de un archivo no puede pasar de ${MAX_OBSERVACION} caracteres.`
  }
  return null
}

export function errorEnComentario(texto: unknown): string | null {
  const t = typeof texto === 'string' ? texto.trim() : ''
  if (t === '') return 'Escribe el comentario.'
  if (t.length > MAX_COMENTARIO) return `El comentario no puede pasar de ${MAX_COMENTARIO} caracteres.`
  return null
}

// ─── El detalle de un indicador ───────────────────────────────────────────────

/** La nota con que la secretaría devolvió un archivo. */
export interface ObservacionVista {
  motivo: string
  /** Quién lo devolvió y cuándo (ISO). */
  por: string
  cuando: string
}

export interface EvidenciaVista {
  id: string
  nombre: string
  tipo: string
  bytes: number
  /** Pasó tal cual de la versión anterior de este reporte (no se subió con esta versión). */
  conservada: boolean
  /** Si la secretaría lo devolvió: la nota más reciente. Un archivo devuelto no se conserva en la corrección. */
  observacion: ObservacionVista | null
}

export interface ValidacionVista {
  estado: 'aprobado' | 'devuelto'
  comentario: string | null
  validadorNombre: string
  creado: string
}

/** Una versión de un reporte, con todo lo que se sabe de ella. */
export interface ReporteDetalle {
  id: string
  anio: number
  valor: number
  valorAnterior: number | null
  texto: string
  autorId: string | null
  autorNombre: string
  creado: string
  corrigeA: string | null
  motivoCorreccion: string | null
  /** No ha sido reemplazado por una corrección: las versiones corregidas son historia. */
  vigente: boolean
  /** Lo que dice su última validación; «pendiente» si nadie la ha tocado. */
  estado: EstadoReporte
  evidencias: EvidenciaVista[]
  /** De la más antigua a la más reciente. */
  validaciones: ValidacionVista[]
  /** Quien pregunta puede aprobarlo o devolverlo (lo decide el servidor; la base lo vuelve a decidir). */
  puedeValidar: boolean
}

export interface ComentarioVista {
  id: string
  /** El reporte sobre el que se comentó, si fue sobre uno. */
  reporteId: string | null
  texto: string
  autorNombre: string
  autorNivel: NivelPdm
  creado: string
}

export interface DetalleIndicador {
  /** De todos los años, del más reciente al más antiguo. */
  reportes: ReporteDetalle[]
  /** Del más reciente al más antiguo. */
  comentarios: ComentarioVista[]
}

/** Lo que el seguimiento puede hacer. En producción lo respalda el servidor; en pruebas, un doble. */
export interface AccionesSeguimiento {
  prepararEvidencias: (e: EntradaPrepararEvidencias) => Promise<Resultado<EvidenciaPreparada[]>>
  reportar: (e: EntradaReportar) => Promise<Resultado<{ reporte: string; correccion: boolean }>>
  validarReporte: (e: EntradaValidar) => Promise<Resultado<{ cambio: 'aprobado' | 'devuelto' | 'ninguno' }>>
  comentar: (e: EntradaComentar) => Promise<Resultado>
  detalleIndicador: (indicador: string) => Promise<Resultado<DetalleIndicador>>
  /** Una dirección temporal para ver una evidencia. */
  urlEvidencia: (evidencia: string) => Promise<Resultado<{ url: string }>>
}

// ─── Leer lo que se escribe ───────────────────────────────────────────────────

/**
 * El número que alguien escribió, o `null` si no se entiende. Se escribe «a la colombiana»:
 * punto de miles y coma decimal («1.234,5»), pero también se acepta el punto decimal («12.5»).
 *
 *   · Con coma y punto, el ÚLTIMO es el decimal («1.234,5» y «1,234.5» valen igual).
 *   · Solo con coma, la coma es decimal («12,5»).
 *   · Solo con punto: si hay varios, son de miles («1.234.567»); si hay uno con exactamente tres
 *     dígitos detrás y de uno a tres dígitos (no cero) delante («1.234»), es de miles; si no, decimal («12.5»).
 *   · Los separadores de miles tienen que estar bien puestos (grupos de tres): «1.2.3» no es un número.
 *
 * Como esto puede interpretarse de dos maneras, la pantalla muestra el número que entendió antes de enviar.
 */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s+/g, '')
  if (t === '' || !/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null

  /** La parte entera, con separadores de miles bien puestos o sin ninguno. `''` si no hay (p. ej. «,5»). */
  const entera = (parte: string, miles: string): string | null => {
    if (parte === '') return '0'
    if (!parte.includes(miles)) return /^\d+$/.test(parte) ? parte : null
    const grupos = parte.split(miles)
    if (!/^\d{1,3}$/.test(grupos[0]) || !grupos.slice(1).every(g => /^\d{3}$/.test(g))) return null
    return grupos.join('')
  }
  const decimales = (parte: string) => (/^\d*$/.test(parte) ? parte : null)

  const ultimaComa = t.lastIndexOf(',')
  const ultimoPunto = t.lastIndexOf('.')
  let ent: string | null
  let dec: string | null = ''

  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    const decimal = ultimaComa > ultimoPunto ? ',' : '.'
    const miles = decimal === ',' ? '.' : ','
    const partes = t.split(decimal)
    if (partes.length !== 2) return null
    ent = entera(partes[0], miles)
    dec = decimales(partes[1])
  } else if (ultimaComa !== -1) {
    const partes = t.split(',')
    if (partes.length !== 2) return null
    ent = entera(partes[0], '.')
    dec = decimales(partes[1])
  } else if (ultimoPunto !== -1) {
    const partes = t.split('.')
    if (partes.length > 2) {
      ent = entera(t, '.')
    } else if (/^\d{1,3}$/.test(partes[0]) && Number(partes[0]) !== 0 && partes[1].length === 3) {
      ent = entera(t, '.')
    } else {
      ent = entera(partes[0], '.')
      dec = decimales(partes[1])
    }
  } else {
    ent = entera(t, '.')
  }

  if (ent === null || dec === null) return null
  const n = Number(dec === '' ? ent : `${ent}.${dec}`)
  return Number.isFinite(n) && n >= 0 ? n : null
}
