/**
 * Correo masivo del administrador: a quién se le escribe y con qué cuerpo.
 *
 * Vive fuera de las server actions porque un archivo 'use server' solo puede
 * exportar funciones async, y estas constantes las necesitan por igual la
 * pantalla, la previsualización y la ruta que envía.
 *
 * ── EL CANDADO ───────────────────────────────────────────────────────────
 *
 * Mientras `CANDADO_DESTINO` tenga un valor, el envío se reduce a esa única
 * dirección: la lista se calcula entera y se enseña entera, pero solo sale un
 * correo. No es un modo de prueba que haya que acordarse de encender — es lo
 * contrario, un seguro que hay que acordarse de QUITAR, y hasta entonces no
 * existe forma de escribirle a 118 personas por accidente.
 *
 * Para soltarlo: poner `null` aquí. Un solo sitio, y la pantalla lo anuncia
 * en grande mientras esté puesto.
 */

export const CANDADO_DESTINO: string | null = 'restrepoceballosfelipe@gmail.com'

/** Los correos que no existen: el marcador que se pone cuando no se conoce. */
export const DOMINIO_MARCADOR = '@pendiente.local'

export const FILTROS = [
  { id: 'todos',        label: 'Todos',         detalle: 'Contratistas y equipo de la alcaldía' },
  { id: 'contratistas', label: 'Contratistas',  detalle: 'Solo quienes reportan informes' },
  { id: 'equipo',       label: 'Equipo',        detalle: 'Secretarios, asesores, contratación y alcaldía' },
] as const

export type FiltroMasivo = (typeof FILTROS)[number]['id']

export const ROLES_EQUIPO = ['supervisor', 'asesor', 'contratacion', 'alcalde', 'admin'] as const

export interface Destinatario {
  nombre_completo: string
  email: string
  rol: string
}

export interface Previsualizacion {
  destinatarios: Destinatario[]
  /** Usuarios activos que quedan fuera por no tener un correo real. */
  excluidos: number
  candado: string | null
}

/**
 * El cuerpo que escribe el administrador, convertido a HTML.
 *
 * Deliberadamente pobre: saltos de línea y nada más. Quien escribe esto no
 * está maquetando, está redactando, y un editor enriquecido en un correo
 * institucional solo sirve para que alguien pegue texto de Word con sus
 * estilos dentro. El sobre —logo, barra con la tinta de la marca, botón y
 * pie— lo pone `baseHtml`, igual que en todos los demás correos.
 */
export function cuerpoAHtml(texto: string, primerNombre: string): string {
  const conNombre = texto.replace(/\{\{nombre\}\}/g, primerNombre)
  return conNombre
    .split(/\n{2,}/)
    .map(parrafo =>
      `<p style="color:#333;font-size:14px;line-height:1.7;margin:0 0 14px;">${
        escaparHtml(parrafo).replace(/\n/g, '<br />')
      }</p>`,
    )
    .join('')
}

/** El texto del administrador no es HTML: si escribe «<», debe verse «<». */
function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** «FELIPE RESTREPO CEBALLOS» → «Felipe». Los nombres están en mayúsculas. */
export function primerNombreDe(nombreCompleto: string): string {
  const primero = (nombreCompleto ?? '').trim().split(/\s+/)[0] ?? ''
  if (!primero) return ''
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase()
}
