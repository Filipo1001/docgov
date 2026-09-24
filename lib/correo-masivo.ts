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

import { MARCA } from '@/lib/marca'

export const CANDADO_DESTINO: string | null = null

/** Los correos que no existen: el marcador que se pone cuando no se conoce. */
export const DOMINIO_MARCADOR = '@pendiente.local'

export const FILTROS = [
  { id: 'todos',        label: 'Todos',         detalle: 'Contratistas y equipo de la alcaldía' },
  { id: 'contratistas', label: 'Contratistas',  detalle: 'Solo quienes reportan informes' },
  { id: 'pendientes',   label: 'No han enviado', detalle: 'Contratistas con el informe del mes en borrador' },
  { id: 'equipo',       label: 'Equipo',        detalle: 'Secretarios, asesores, contratación y alcaldía' },
] as const

export type FiltroMasivo = (typeof FILTROS)[number]['id']

export const ROLES_EQUIPO = ['supervisor', 'asesor', 'contratacion', 'alcalde', 'admin'] as const

/**
 * Borrador cargado por defecto: la invitación al acompañamiento virtual.
 *
 * Va aquí y no en el estado del componente para que se pueda leer, corregir
 * y versionar como cualquier otro texto del sistema. Se edita en la pantalla
 * antes de enviar; esto es el punto de partida, no una plantilla cerrada.
 *
 * La fecha y el enlace van en un solo párrafo a propósito: así caen dentro
 * del MISMO recuadro resaltado, y el aviso tiene un solo bloque que mirar en
 * vez de dos seguidos.
 *
 * Y dice la fecha, no «mañana»: un correo masivo no siempre sale el día que
 * se escribe, y un aviso que se contradice a sí mismo —«mañana» un martes,
 * para un jueves— le cuesta a cien personas averiguar cuál de las dos cosas
 * era la buena.
 */
export const ASUNTO_PREDEFINIDO = '🚀 Espacio de acompañamiento – Contratista Digital'

export const MENSAJE_PREDEFINIDO = `Hola {{nombre}}.

¿Tienes alguna duda sobre cómo funciona Contratista Digital?

¿No pudiste asistir a las capacitaciones presenciales?

El jueves 24 de septiembre tendremos un espacio para resolver tus dudas, repasar el funcionamiento de la plataforma y ayudarte con lo que necesites.

Y lo mejor: no tienes que ir a ningún lado. Será completamente virtual. 💻

📅 Jueves, 24 de septiembre – 3:00 p. m.
🔗 Ingresa a la reunión:
https://meet.google.com/scz-zpcz-ink

¡Te esperamos! 🚀

Equipo Contratista Digital`

/**
 * Recordatorio de informe. Deliberadamente NO dice que el plazo vence
 * mañana: el corte del 25 es una costumbre de la alcaldía, no algo
 * estipulado en el contrato, y un correo institucional no puede afirmar un
 * plazo que no existe por escrito. Dice lo que sí es cierto —que el mes se
 * está acabando y que su informe no ha llegado— y eso basta.
 *
 * Sigue la línea del recordatorio automático del día 22 para que quien
 * reciba los dos no sienta que le escriben dos sistemas distintos.
 *
 * Y no menciona la sesión de acompañamiento: son dos avisos con dos
 * propósitos y dos destinatarios distintos —este va solo a quien no ha
 * enviado—, y mezclarlos le quita filo a los dos.
 *
 * «Subir tu firma» va primero en la lista de pasos a propósito: 27 de los
 * 120 contratistas no la tienen registrada, y ninguno de esos 27 ha logrado
 * enviar un informe nunca. Es el primer muro, no el último detalle.
 */
export const ASUNTO_RECORDATORIO = 'Recuerda enviar tu informe de septiembre'

export const MENSAJE_RECORDATORIO = `Hola {{nombre}}.

Todavía no hemos recibido tu informe de actividades de septiembre.

Ya estamos en la última semana del mes, así que este es un buen momento para subir tu firma, registrar tus actividades, adjuntar tu planilla de seguridad social y enviarlo a revisión.

Equipo Contratista Digital`

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
 * ── DOS REGLAS, Y NINGUNA MÁS ────────────────────────────────────────────
 *
 * No hay editor enriquecido a propósito: quien escribe esto está redactando,
 * no maquetando, y un editor solo sirve para que alguien pegue texto de Word
 * con sus estilos dentro. Pero texto plano corrido tampoco basta para un
 * aviso con fecha, hora y enlace de reunión. De ahí dos reglas que se
 * aprenden de una vez y se anuncian en la pantalla:
 *
 *   1. Un párrafo que EMPIEZA POR UN EMOJI se resalta en un recuadro. Es
 *      donde acaban la fecha y el enlace, que es lo que la gente busca con
 *      la mirada antes de leer nada.
 *
 *   2. Una línea que sea SOLO UN ENLACE se convierte en botón. Nadie copia
 *      y pega una URL desde el correo del teléfono.
 *
 * El resto es tipografía: párrafos con aire, enlaces sueltos subrayados, y
 * el sobre de la marca alrededor —logo, barra con la tinta institucional y
 * pie— que pone `baseHtml`.
 */

const RE_URL_SUELTA = /^https?:\/\/\S+$/
const RE_URL = /(https?:\/\/[^\s<]+)/g
/** ¿La línea arranca con un emoji? 📅, 🔗, 💻… */
const RE_EMOJI_INICIAL = /^\p{Extended_Pictographic}/u

export function cuerpoAHtml(texto: string, primerNombre: string): string {
  // Insensible a mayúsculas y tolerante con los espacios: quien escribe
  // «{{Nombre}}» está pidiendo exactamente lo mismo que quien escribe
  // «{{ nombre }}», y que el saludo salga con las llaves a la vista es el
  // peor final posible para un correo a cien personas.
  const conNombre = texto.replace(/\{\{\s*nombre\s*\}\}/gi, primerNombre)

  return conNombre
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(parrafo => renderParrafo(parrafo))
    .join('')
}

function renderParrafo(parrafo: string): string {
  const lineas = parrafo.split('\n').map(l => l.trim()).filter(Boolean)
  const destacado = RE_EMOJI_INICIAL.test(lineas[0] ?? '')

  // Las líneas normales se agrupan en un párrafo con saltos; las que son
  // solo un enlace salen del flujo y se convierten en botón.
  const piezas: string[] = []
  let acumulado: string[] = []

  const volcar = () => {
    if (!acumulado.length) return
    piezas.push(
      `<p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 12px;">${
        acumulado.join('<br />')
      }</p>`,
    )
    acumulado = []
  }

  for (const linea of lineas) {
    if (RE_URL_SUELTA.test(linea)) {
      volcar()
      piezas.push(boton(linea))
    } else {
      acumulado.push(enlazar(escaparHtml(linea)))
    }
  }
  volcar()

  const cuerpo = piezas.join('')
  if (!destacado) return cuerpo

  return `<div style="background:#f6f7f9;border-left:3px solid ${MARCA};border-radius:10px;padding:16px 18px 6px;margin:0 0 16px;">${cuerpo}</div>`
}

/**
 * El rótulo del botón sale de a DÓNDE lleva, no de un texto fijo.
 *
 * Estaba escrito «Entrar a la reunión» a secas, que es correcto para un
 * enlace de Meet y absurdo para cualquier otro. Tres casos cubren todo lo
 * que esta alcaldía va a pegar en un correo.
 */
function rotuloDe(url: string): string {
  const u = url.toLowerCase()
  if (/meet\.google|zoom\.us|teams\.microsoft|whereby|meet\.jit/.test(u)) return 'Entrar a la reunión'
  if (u.includes('contratistadigital.com')) return 'Abrir Contratista Digital'
  return 'Abrir el enlace'
}

function boton(url: string): string {
  const limpia = escaparHtml(url)
  return `<div style="margin:4px 0 14px;">
    <a href="${limpia}" style="display:inline-block;background:${MARCA};color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;">
      ${rotuloDe(url)}
    </a>
  </div>`
}

/** Enlaces dentro del texto. Se aplica DESPUÉS de escapar, nunca antes. */
function enlazar(html: string): string {
  return html.replace(RE_URL, `<a href="$1" style="color:${MARCA};text-decoration:underline;">$1</a>`)
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
