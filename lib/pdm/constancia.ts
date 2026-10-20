/**
 * La CONSTANCIA de una versión de reporte y lo que su QR enseña al público (migración 072).
 *
 * Aquí solo está lo PURO (sin servidor ni base): la forma del código, cómo se lee con desconfianza lo que entrega la base,
 * y las frases que dicen el estado. Quién emite el código y de dónde sale la constancia está en `constancia-servidor.ts`.
 *
 * Qué es «el paquete»: la VERSIÓN de un reporte (el indicador, el año, el valor reportado y sus archivos). Cada versión tiene
 * su propio código. Lo que enseña la página pública es el estado VIVO de esa versión, y si hay una más reciente lo dice.
 *
 * Qué NO enseña (decisión de Felipe, 18-oct): nombres de archivo, el texto del reporte, el comentario de una devolución ni el
 * motivo de una anulación. La base ya no los entrega (`pdm_constancia_publica`); aquí tampoco se leen.
 */

/**
 * La forma de una huella (64 hex en minúscula). Se repite aquí y no se importa de `huella.ts`: ese archivo usa `node:crypto` y este
 * viaja al navegador (la página pública comprueba archivos allí mismo). Una prueba vigila que las dos sean la misma.
 */
const FORMA_DE_HUELLA = /^[0-9a-f]{64}$/

// ─── El código ────────────────────────────────────────────────────────────────

/** Mismo alfabeto que los códigos `CD-` (Crockford sin I, L, O, U): sin caracteres que se confundan al leerlos o dictarlos. */
export const ALFABETO_DE_CODIGO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** `PDM-XXXX-XXXX`. La base lo exige igual. */
export const FORMA_DE_CODIGO_PDM = /^PDM-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/

/** Cómo se escribe un código que alguien tecleó o pegó: sin espacios alrededor y en mayúscula. */
export const normalizarCodigo = (v: string): string => v.trim().toUpperCase()

export const esCodigoPdm = (v: unknown): v is string => typeof v === 'string' && FORMA_DE_CODIGO_PDM.test(v)

/** ¿Es este código de una constancia del Plan de Desarrollo (y no de un documento de contratos, `CD-…`)? Por el prefijo, antes de validarlo. */
export const pareceCodigoPdm = (v: string): boolean => normalizarCodigo(v).startsWith('PDM-')

/**
 * Un código nuevo. `azar(n)` devuelve un entero en [0, n): en el servidor es `crypto.randomInt`, que da códigos
 * impredecibles —son la única llave de acceso a la página pública—; en las pruebas es una función fija.
 */
export function generarCodigoPdm(azar: (n: number) => number): string {
  const trozo = () => Array.from({ length: 4 }, () => ALFABETO_DE_CODIGO[azar(ALFABETO_DE_CODIGO.length)]).join('')
  return `PDM-${trozo()}-${trozo()}`
}

// ─── Lo que la base entrega ───────────────────────────────────────────────────

export type EstadoDeConstancia = 'pendiente' | 'aprobado' | 'devuelto' | 'anulado'

export interface ArchivoDeConstancia {
  /** El tipo declarado (`application/pdf`…). Sin nombre ni ruta: no se publican. */
  tipo: string
  bytes: number
  /** La huella SHA-256 (64 hex), o `null` si no se calculó: nunca una inventada. */
  sha256: string | null
  /** Cuándo la calculó el servidor, o `null`. */
  huellaCalculadaEn: string | null
}

export interface ConstanciaPublica {
  codigo: string
  creadaEn: string
  /** El estado de ESTA versión. */
  estado: EstadoDeConstancia
  /** ¿Es la versión vigente del indicador en el año? (la más reciente que no está anulada). */
  vigente: boolean
  indicador: { codigo: string; nombre: string; sector: string; unidad: string; dependencia: string; anio: number; meta: number | null }
  reporte: { valor: number; valorAnterior: number | null; reportadoEn: string; autor: string; esCorreccion: boolean }
  validacion: { estado: 'aprobado' | 'devuelto'; validador: string; fecha: string } | null
  anulacion: { accion: 'anular' | 'restaurar'; fecha: string } | null
  /** La versión más reciente (si esta ya no es la vigente): su estado y su código, si ya tiene constancia. */
  masReciente: { reportadoEn: string; estado: Exclude<EstadoDeConstancia, 'anulado'>; codigo: string | null } | null
  archivos: ArchivoDeConstancia[]
}

const ESTADOS: readonly string[] = ['pendiente', 'aprobado', 'devuelto', 'anulado']
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const numeroONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const objeto = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/**
 * Lee con desconfianza lo que entrega `pdm_constancia_publica`. Devuelve `null` si no tiene la forma de una constancia
 * (un código que no existe llega como `null`, y cualquier otra cosa es un error de lectura que quien llama decide cómo decir).
 * Una huella que no tiene la forma exacta se descarta: nunca se enseña como verdadera algo que no lo es.
 */
export function leerConstancia(crudo: unknown): ConstanciaPublica | null {
  const c = objeto(crudo)
  if (!c || !esCodigoPdm(c.codigo) || !ESTADOS.includes(texto(c.estado))) return null
  const ind = objeto(c.indicador), rep = objeto(c.reporte)
  if (!ind || !rep) return null
  const valor = numeroONulo(rep.valor)
  const anio = numeroONulo(ind.anio)
  if (valor === null || anio === null) return null

  const val = objeto(c.validacion)
  const anu = objeto(c.anulacion)
  const mas = objeto(c.mas_reciente)
  const estadoDe = (v: unknown): 'pendiente' | 'aprobado' | 'devuelto' => (v === 'aprobado' || v === 'devuelto' ? v : 'pendiente')

  return {
    codigo: c.codigo,
    creadaEn: texto(c.creada_en),
    estado: texto(c.estado) as EstadoDeConstancia,
    vigente: c.vigente === true,
    indicador: {
      codigo: texto(ind.codigo), nombre: texto(ind.nombre), sector: texto(ind.sector), unidad: texto(ind.unidad),
      dependencia: texto(ind.dependencia), anio, meta: numeroONulo(ind.meta),
    },
    reporte: {
      valor, valorAnterior: numeroONulo(rep.valor_anterior), reportadoEn: texto(rep.reportado_en),
      autor: texto(rep.autor), esCorreccion: rep.es_correccion === true,
    },
    validacion: val && (val.estado === 'aprobado' || val.estado === 'devuelto')
      ? { estado: val.estado, validador: texto(val.validador), fecha: texto(val.fecha) } : null,
    anulacion: anu && (anu.accion === 'anular' || anu.accion === 'restaurar') ? { accion: anu.accion, fecha: texto(anu.fecha) } : null,
    masReciente: mas ? { reportadoEn: texto(mas.reportado_en), estado: estadoDe(mas.estado), codigo: esCodigoPdm(mas.codigo) ? mas.codigo : null } : null,
    archivos: Array.isArray(c.archivos)
      ? c.archivos.flatMap((a): ArchivoDeConstancia[] => {
        const o = objeto(a)
        if (!o) return []
        const huella = typeof o.sha256 === 'string' && FORMA_DE_HUELLA.test(o.sha256) ? o.sha256 : null
        return [{ tipo: texto(o.tipo), bytes: numeroONulo(o.bytes) ?? 0, sha256: huella, huellaCalculadaEn: huella ? texto(o.huella_calculada_en) || null : null }]
      })
      : [],
  }
}

// ─── Lo que se dice ───────────────────────────────────────────────────────────

/** El estado, en una palabra o dos, para el sello. */
export const ROTULO_DE_ESTADO: Record<EstadoDeConstancia, string> = {
  aprobado: 'Aprobado',
  pendiente: 'Pendiente de validación',
  devuelto: 'Devuelto para corrección',
  anulado: 'Anulado',
}

/**
 * La frase que acompaña al estado. Lo importante: un reporte que NO está aprobado lo dice con todas las letras, para que
 * quien escanea el QR de una constancia no la tome por un reporte validado.
 */
export function fraseDeEstado(c: Pick<ConstanciaPublica, 'estado' | 'validacion' | 'vigente'>): string {
  switch (c.estado) {
    case 'aprobado':
      return c.vigente
        ? 'La secretaría validó este reporte: su valor cuenta en el avance del indicador.'
        : 'La secretaría validó esta versión. Hay una versión más reciente de este reporte: revisa su estado.'
    case 'pendiente':
      return 'Este reporte TODAVÍA NO está aprobado: espera la validación de la secretaría. Su valor aún no cuenta en el avance del indicador.'
    case 'devuelto':
      return 'La secretaría devolvió este reporte para corrección. NO está aprobado y su valor no cuenta en el avance del indicador.'
    case 'anulado':
      return 'Este reporte fue anulado: ya no cuenta. La constancia es auténtica, pero lo que reporta no es válido.'
  }
}

/**
 * ¿Es una versión ANTERIOR? Ya no es la vigente del indicador en el año (hay una más reciente que cuenta). Se dice en el sello,
 * en tono neutro: una versión aprobada y luego reemplazada no puede verse como un «Aprobado» verde, porque quien escanea su QR
 * creería que ese es el estado de hoy del reporte.
 */
export const esVersionAnterior = (c: Pick<ConstanciaPublica, 'estado' | 'vigente'>): boolean => c.estado !== 'anulado' && !c.vigente

/** El sello de la constancia: el estado, o «Versión anterior · estado» si ya no es la vigente. */
export const rotuloDeConstancia = (c: Pick<ConstanciaPublica, 'estado' | 'vigente'>): string =>
  esVersionAnterior(c) ? `Versión anterior · ${ROTULO_DE_ESTADO[c.estado]}` : ROTULO_DE_ESTADO[c.estado]

/** ¿El estado merece una advertencia llamativa? Todo menos «aprobado». */
export const requiereAdvertencia = (e: EstadoDeConstancia): boolean => e !== 'aprobado'

/** El tipo de un archivo en una palabra, por lo que declara («PDF», «Imagen», «Word»…). Sin nombres de archivo: nunca se publican. */
export function etiquetaDeTipo(mime: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return 'Imagen'
  if (mime.startsWith('video/')) return 'Video'
  if (mime.startsWith('audio/')) return 'Audio'
  if (/word|msword/.test(mime)) return 'Word'
  if (/excel|spreadsheet/.test(mime)) return 'Excel'
  if (/powerpoint|presentation/.test(mime)) return 'Presentación'
  return 'Archivo'
}

/** La dirección pública de una constancia: la del dominio propio de la aplicación (la que se graba en el QR). */
export const rutaDeVerificacion = (codigo: string): string => `/verificar/${codigo}`

/** El nombre del archivo PDF de una constancia. */
export const nombreDeArchivoDeConstancia = (codigo: string): string => `constancia-${codigo}.pdf`

/**
 * Comprueba un archivo contra las huellas de la constancia: ¿es idéntico a alguno? Devuelve el archivo registrado que
 * coincide (por huella; el tamaño es solo una segunda comprobación que no puede contradecirla), o `null`.
 */
export function archivoQueCoincide(archivos: ArchivoDeConstancia[], huella: string, bytes: number): ArchivoDeConstancia | null {
  const h = huella.trim().toLowerCase()
  return archivos.find(a => a.sha256 !== null && a.sha256 === h && a.bytes === bytes) ?? null
}
