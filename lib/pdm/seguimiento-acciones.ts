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
import type { AnulacionVista } from './anulaciones'

// ─── Reglas ───────────────────────────────────────────────────────────────────

/**
 * Cuántos archivos admite un reporte como máximo. Es una RED DE SEGURIDAD, no una regla que se le explique a nadie: ninguna
 * pantalla ni mensaje dice este número (Felipe, 20-oct-2026: «que no lo especifiques en la aplicación»). Antes eran 5, un valor que
 * puse yo en la Fase B sin que nadie lo decidiera. Está escrito también en la base (`pdm_privado.max_evidencias()` y la restricción
 * `pdm_validaciones_observaciones_check`, migración 075); tests/pdm/seguimiento.test.ts vigila que los tres digan lo mismo.
 */
export const MAX_EVIDENCIAS = 30
/** Lo que se dice cuando un reporte lleva más archivos de los que admite: sin el número, a propósito. */
export const MENSAJE_DEMASIADOS_ARCHIVOS = 'Este reporte tiene más archivos de los que admite.'
/** Lo que puede pesar un archivo que no es video: PDF, foto, Word, Excel o presentación. */
export const MAX_BYTES_EVIDENCIA = 25 * 1024 * 1024
/**
 * Lo que puede pesar un video. Se sube por partes (ver `subir-reanudable.ts`): una conexión que se cae no lo empieza de cero.
 * 100 MB desde la migración 074 (era 200 en la 073): es el límite GLOBAL del almacenamiento de Supabase que decidió Felipe el
 * 20-oct-2026, y un tope de video mayor que el global no sirve: el almacenamiento rechazaría lo que el formulario ofreciera.
 */
export const MAX_BYTES_VIDEO = 100 * 1024 * 1024
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
  /** Lo que puede pesar. La base lo impone igual (`pdm_privado.limite_de_evidencia`, migración 073). */
  maxBytes: number
  /** Cómo se llama en una frase: «un PDF», «un video». */
  nombre: string
}

/**
 * Lo que se acepta como evidencia: la misma lista que el espacio `pdm-evidencias` y la función `pdm_reportar` (migración 073).
 * Un tipo nuevo se añade en estos tres lugares; `tests/pdm/seguimiento.test.ts` vigila que estos dos coincidan con lo que la base
 * documenta, y `supabase/tests/pdm_evidencias_tipos.sql` que la base haga lo que aquí se dice.
 */
export const TIPOS_EVIDENCIA: readonly TipoEvidencia[] = [
  { mime: 'application/pdf', ext: 'pdf', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'un PDF' },
  { mime: 'image/jpeg', ext: 'jpg', alias: ['jpeg'], maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'una foto' },
  { mime: 'image/png', ext: 'png', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'una foto' },
  { mime: 'image/webp', ext: 'webp', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'una foto' },
  { mime: 'image/heic', ext: 'heic', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'una foto' },
  { mime: 'image/heif', ext: 'heif', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'una foto' },
  { mime: 'application/msword', ext: 'doc', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'un Word' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'un Word' },
  { mime: 'application/vnd.ms-excel', ext: 'xls', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'un Excel' },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'un Excel' },
  { mime: 'application/vnd.ms-powerpoint', ext: 'ppt', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'una presentación' },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx', maxBytes: MAX_BYTES_EVIDENCIA, nombre: 'una presentación' },
  { mime: 'video/mp4', ext: 'mp4', maxBytes: MAX_BYTES_VIDEO, nombre: 'un video' },
  { mime: 'video/quicktime', ext: 'mov', maxBytes: MAX_BYTES_VIDEO, nombre: 'un video' },
]

export const TEXTO_TIPOS_EVIDENCIA = 'PDF, foto, Word, Excel, presentación o video (MP4 o MOV)'

/**
 * El nombre de un archivo en el almacenamiento: un identificador y la extensión de ALGUNO de los tipos admitidos. Sale de la misma
 * lista que todo lo demás: así un tipo nuevo no queda rechazado al registrar por una regla escrita aparte (a `mp4` le pasó: una
 * regla que pedía solo letras lo habría rechazado).
 */
export function esNombreDeEvidenciaEnAlmacen(nombre: string): boolean {
  const m = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]+)$/.exec(nombre)
  return !!m && TIPOS_EVIDENCIA.some(t => t.ext === m[1])
}

/** ¿Es un video? Los videos se suben por partes y pueden pesar mucho más que el resto. */
export const esVideo = (mime: string): boolean => mime.startsWith('video/')

/** Lo que puede pesar un archivo de este tipo, o `null` si el tipo no se admite. */
export const limiteDeTipo = (mime: string): number | null => TIPOS_EVIDENCIA.find(t => t.mime === mime)?.maxBytes ?? null

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
 * anterior que pasan a esta (solo al corregir): cuentan para el mínimo de uno y para el máximo.
 */
export function errorEnArchivos(archivos: ArchivoPorSubir[], conservadas = 0): string | null {
  if (archivos.length + conservadas === 0) return 'Adjunta al menos una evidencia.'
  if (archivos.length + conservadas > MAX_EVIDENCIAS) return MENSAJE_DEMASIADOS_ARCHIVOS
  for (const a of archivos) {
    if (!a.nombre.trim() || a.nombre.length > MAX_NOMBRE_ARCHIVO) return 'Un archivo tiene un nombre que no sirve.'
    const tipo = tipoDeArchivo(a.nombre, a.tipo)
    if (!tipo) return `«${a.nombre}»: solo se admite ${TEXTO_TIPOS_EVIDENCIA}.`
    if (!Number.isFinite(a.bytes) || a.bytes < 1) return `«${a.nombre}» está vacío.`
    if (a.bytes > tipo.maxBytes) return `«${a.nombre}» pesa ${describirTamano(a.bytes)}; el máximo para ${tipo.nombre} es ${describirTamano(tipo.maxBytes)}.`
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

/**
 * Cómo se sube un archivo por partes (los videos): el servidor firma una clave para ESA ruta —no sirve para otra— y el
 * navegador habla con el almacenamiento directamente, sin pasar por una función de Vercel. Ver `subir-reanudable.ts`.
 */
export interface SubidaReanudable {
  /** Dirección del almacenamiento que recibe las partes (protocolo TUS). */
  endpoint: string
  /** La clave firmada para esta ruta; vale unas horas. */
  firma: string
  /** La clave pública del proyecto (la misma que ya viaja en cada página). */
  apikey: string
  bucket: string
}

export interface EvidenciaPreparada {
  ruta: string
  /** Dirección firmada y de un solo uso: el navegador sube el archivo con un PUT. */
  urlSubida: string
  /** El tipo con que hay que subirlo (el que se resolvió, no el declarado). */
  tipo: string
  /** Solo en los videos: se suben por partes con esto y no con `urlSubida`. */
  reanudable?: SubidaReanudable
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

/** Anular o restaurar un reporte (solo el administrador). Se pasa la versión MÁS RECIENTE; la base lleva el resto de la cadena. */
export interface EntradaAnulacion {
  reporte: string
  /** Obligatorio, de 10 a 500 caracteres. */
  motivo: string
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
  if (observaciones.length > MAX_EVIDENCIAS) return 'Se marcaron más archivos de los que tiene un reporte.'
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
  /** La huella (SHA-256) del contenido, calculada por el servidor; `null` si no se pudo calcular. */
  sha256: string | null
  /** Cuándo la calculó el servidor (ISO); `null` si no hay huella. */
  huellaCalculadaEn: string | null
  /** Si la secretaría lo devolvió: la nota más reciente. Un archivo devuelto no se conserva en la corrección. */
  observacion: ObservacionVista | null
}

export interface ValidacionVista {
  estado: 'aprobado' | 'devuelto'
  comentario: string | null
  validadorNombre: string
  creado: string
  /** Es una devolución de un reporte que estaba APROBADO: se reabrió. Se dice distinto a una devolución normal. */
  reabre: boolean
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
  /** Cuenta: no fue reemplazado por una corrección ni está anulado. Lo demás es historia. */
  vigente: boolean
  /** Lo que dice su última validación; «pendiente» si nadie la ha tocado. */
  estado: EstadoReporte
  evidencias: EvidenciaVista[]
  /** De la más antigua a la más reciente. */
  validaciones: ValidacionVista[]
  /** Quien pregunta puede aprobarlo o devolverlo (lo decide el servidor; la base lo vuelve a decidir). */
  puedeValidar: boolean
  /**
   * Está anulado (migración 068). Solo llega a quien puede verlo —el administrador y Control Interno—; para el resto de las
   * personas un reporte anulado no existe.
   */
  anulado: boolean
  /** Anulaciones y restauraciones de este reporte, de la más antigua a la más reciente (vacío para quien no las ve). */
  anulaciones: AnulacionVista[]
  /** El administrador puede anularlo: es lo último que se reportó en el año y no está anulado. */
  puedeAnular: boolean
  /** El administrador puede restaurarlo: está anulado, es la versión más reciente de su cadena y nada vigente vino después. */
  puedeRestaurar: boolean
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
  /** Solo el administrador. `versiones`: cuántas versiones del reporte se anularon con él. */
  anularReporte: (e: EntradaAnulacion) => Promise<Resultado<{ versiones: number }>>
  /** Solo el administrador. `versiones`: cuántas versiones se restauraron. */
  restaurarReporte: (e: EntradaAnulacion) => Promise<Resultado<{ versiones: number }>>
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
