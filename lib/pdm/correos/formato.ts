/**
 * Lo pequeño que todo correo del módulo necesita: escapar, recortar, poner nombres y fechas en cristiano.
 *
 * Funciones puras y sin `server-only`: se prueban sin base de datos ni red.
 */

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * Todo texto que no escribió este archivo (nombres, comentarios, indicadores) pasa por aquí antes de entrar al HTML.
 * Un comentario de validación o el nombre de un archivo lo escribe una persona: no puede abrir una etiqueta.
 */
export const esc = (s: string): string => s.replace(/[&<>"']/g, c => ENTIDADES[c])

/** Recorta en el último espacio antes del límite y avisa con «…». Sin cortar a media palabra si se puede evitar. */
export function recortar(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const corte = t.lastIndexOf(' ', max - 1)
  return `${t.slice(0, corte > max * 0.6 ? corte : max - 1).trimEnd()}…`
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e'])

const capitalizar = (p: string) => p.charAt(0).toLocaleUpperCase('es') + p.slice(1).toLocaleLowerCase('es')

/** «SARA SÁNCHEZ VÉLEZ» → «Sara Sánchez Vélez». En la base los nombres están en mayúsculas. */
export function nombreLegible(completo: string): string {
  return completo
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, k) => (k > 0 && PARTICULAS.has(p.toLowerCase()) ? p.toLowerCase() : capitalizar(p)))
    .join(' ')
}

/** El primer nombre, para el saludo: «YORLEDY BIBIANA VÁSQUEZ MESA» → «Yorledy». */
export function primerNombre(completo: string): string {
  const p = completo.trim().split(/\s+/)[0] ?? ''
  return p === '' ? '' : capitalizar(p)
}

/** «4 de octubre de 2026, 9:15 a. m.», siempre en hora de Colombia: el servidor corre en UTC. */
export function fechaDeColombia(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** «2,3 MB», «480 KB». */
export function pesoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`
}

/** Con qué palabra se llama a un archivo según su tipo: «PDF», «Foto», «Word», «Excel». */
export function rotuloDeTipo(mime: string, nombre: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return 'Foto'
  if (mime.includes('word') || /\.docx?$/i.test(nombre)) return 'Word'
  if (mime.includes('excel') || mime.includes('spreadsheet') || /\.xlsx?$/i.test(nombre)) return 'Excel'
  return 'Archivo'
}

/** «1 indicador» / «3 indicadores». */
export const cuantos = (n: number, uno: string, varios: string): string => `${n.toLocaleString('es-CO')} ${n === 1 ? uno : varios}`

/** La referencia corta que va en el pie y sirve para hablar de un correo por teléfono: 8 caracteres del identificador. */
export const referenciaDe = (uuid: string): string => uuid.replace(/-/g, '').slice(0, 8).toUpperCase()
