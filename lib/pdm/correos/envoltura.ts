/**
 * El sobre y los bloques de los correos del módulo Plan de Desarrollo.
 *
 * ── Por qué no reutiliza `baseHtml` ──────────────────────────────────────
 *
 * `lib/emails/templates.ts` arma los correos de los periodos de CD (en producción, con barra de color y botón fijo
 * a la aplicación). Aquí hace falta otra cosa —un estado, un botón que lleva al indicador exacto, un pie con
 * referencia y fecha— y tocar ese archivo arriesgaría los correos que ya salen. Este sobre es del módulo y
 * comparte con CD solo el logotipo y la tinta.
 *
 * ── Un contenido, dos formatos ───────────────────────────────────────────
 *
 * Cada correo se describe como una lista de BLOQUES (párrafo, datos, cita, lista, pasos, sello) y de ahí salen el HTML
 * y la versión en texto plano. Una sola fuente: no hay manera de que el texto diga una cosa y el HTML otra. La versión
 * en texto no es un adorno: los filtros de correo desconfían de los mensajes que solo traen HTML, y quien lee en un
 * reloj o en un cliente sin imágenes la usa.
 *
 * ── Qué se cuida en el HTML ──────────────────────────────────────────────
 *
 *   · Tablas y estilos en línea: es lo único que respetan Gmail, Outlook y los clientes del teléfono.
 *   · Nada de imágenes salvo el logotipo (el de producción, que existe en cualquier entorno): una insignia en PNG
 *     tendría que alojarse en una dirección pública, y la vista previa de Vercel no lo es.
 *   · El sello de la insignia se dibuja con CSS (círculos y texto), sin imagen ni emoji.
 *   · Todo texto de una persona pasa por `esc`.
 *   · Texto de apoyo con contraste suficiente (≥ 4,5:1) sobre blanco; sin información que dependa solo del color.
 */

import { ORIGEN_APP } from '@/lib/dominio'
import { MARCA } from '@/lib/marca'
import { esc } from './formato'
import type { Insignia } from './insignias'

// ─── Tokens ──────────────────────────────────────────────────────────────────

const T = {
  tinta: MARCA,
  texto: '#2D3648',
  suave: '#4A5468',
  tenue: '#667085',
  linea: '#E6E9EF',
  fondo: '#F3F4F7',
  superficie: '#F8F9FB',
  fuente: `-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`,
} as const

/** Los mismos colores y palabras que el semáforo del módulo (ver `lib/pdm/semaforo.ts`): lo que el correo dice, la pantalla lo dice igual. */
export const ESTADOS_CORREO = {
  sin_validar: { palabra: 'Sin validar', color: '#B7791F', tinte: '#FBF3E3' },
  devuelto:    { palabra: 'Devuelto',    color: '#B42318', tinte: '#FCEDEB' },
  aprobado:    { palabra: 'Aprobado',    color: '#2E7D5B', tinte: '#EAF4EF' },
  asignacion:  { palabra: 'Asignación',  color: MARCA,     tinte: '#EEF0F4' },
} as const

export type EstadoCorreo = keyof typeof ESTADOS_CORREO

// ─── Bloques ─────────────────────────────────────────────────────────────────

export type Bloque =
  | { t: 'parrafo'; texto: string }
  | { t: 'datos'; filas: { rotulo: string; valor: string; nota?: string }[] }
  | { t: 'cita'; rotulo: string; texto: string }
  | { t: 'lista'; rotulo: string; items: { titulo: string; detalle?: string }[]; mas?: number }
  | { t: 'pasos'; rotulo: string; items: string[] }
  | { t: 'sello'; insignia: Insignia; anio: number }

export interface DatosDelSobre {
  asunto: string
  /** El texto que el cliente de correo muestra junto al asunto en la lista. Una frase, ≤ 110 caracteres. */
  resumen: string
  estado: EstadoCorreo
  titulo: string
  bloques: Bloque[]
  boton: { href: string; texto: string }
  pie: {
    /** `Ref. 1A2B3C4D · 4 de octubre de 2026, 9:15 a. m.` */
    referencia: string
    /** Por qué le llega: «porque reportaste el indicador…». */
    motivo: string
  }
  /** En producción desaparece: la leyenda solo avisa que el módulo está en pruebas. */
  vistaPrevia: boolean
}

export interface CorreoListo {
  asunto: string
  html: string
  texto: string
}

// ─── HTML ────────────────────────────────────────────────────────────────────

const LOGO = `${ORIGEN_APP}/marca/icono-96.png`
const ROTULO = `font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:${T.tenue};`

function htmlDeBloque(b: Bloque, color: string): string {
  switch (b.t) {
    case 'parrafo':
      return `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${T.texto};">${esc(b.texto)}</p>`

    case 'datos':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;border-top:1px solid ${T.linea};">${
        b.filas.map(f => `<tr>
  <td style="padding:11px 16px 11px 0;width:34%;vertical-align:top;border-bottom:1px solid ${T.linea};${ROTULO}">${esc(f.rotulo)}</td>
  <td style="padding:11px 0;vertical-align:top;border-bottom:1px solid ${T.linea};font-size:14px;line-height:1.5;color:${T.tinta};font-weight:600;">${esc(f.valor)}${
    f.nota ? `<div style="margin-top:2px;font-size:12px;font-weight:400;color:${T.tenue};">${esc(f.nota)}</div>` : ''}</td>
</tr>`).join('')}</table>`

    case 'cita':
      return `<div style="margin:0 0 22px;padding:14px 16px;background:${T.superficie};border-radius:10px;">
  <div style="${ROTULO}margin-bottom:6px;">${esc(b.rotulo)}</div>
  <div style="font-size:14px;line-height:1.6;color:${T.texto};white-space:pre-line;">${esc(b.texto)}</div>
</div>`

    case 'lista':
      return `<div style="margin:0 0 22px;">
  <div style="${ROTULO}margin-bottom:8px;">${esc(b.rotulo)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${
    b.items.map(i => `<tr><td style="padding:9px 0;border-bottom:1px solid ${T.linea};font-size:14px;line-height:1.5;color:${T.tinta};">
    <span style="font-weight:600;">${esc(i.titulo)}</span>${i.detalle ? `<div style="font-size:13px;color:${T.suave};margin-top:2px;">${esc(i.detalle)}</div>` : ''}</td></tr>`).join('')}${
    b.mas ? `<tr><td style="padding:9px 0;font-size:13px;color:${T.tenue};">y ${b.mas.toLocaleString('es-CO')} más</td></tr>` : ''}</table>
</div>`

    case 'pasos':
      return `<div style="margin:0 0 22px;">
  <div style="${ROTULO}margin-bottom:8px;">${esc(b.rotulo)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0">${
    b.items.map((p, k) => `<tr>
    <td style="vertical-align:top;padding:0 12px 10px 0;"><div style="width:22px;height:22px;line-height:22px;border-radius:50%;background:${T.fondo};color:${T.tinta};font-size:12px;font-weight:700;text-align:center;">${k + 1}</div></td>
    <td style="vertical-align:top;padding:1px 0 10px;font-size:14px;line-height:1.55;color:${T.texto};">${esc(p)}</td></tr>`).join('')}</table>
</div>`

    case 'sello': {
      const anillo = b.insignia.destacada ? T.tinta : color
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;background:${T.superficie};border-radius:12px;">
  <tr>
    <td style="padding:18px 0 18px 18px;width:84px;vertical-align:middle;">
      <div style="width:70px;height:70px;border-radius:50%;border:2px solid ${anillo};">
        <div style="width:56px;height:56px;margin:5px;border-radius:50%;background:${anillo};color:#FFFFFF;text-align:center;line-height:56px;font-size:15px;font-weight:700;letter-spacing:.3px;">${b.anio}</div>
      </div>
    </td>
    <td style="padding:18px 20px 18px 16px;vertical-align:middle;">
      <div style="${ROTULO}">Tu insignia</div>
      <div style="margin-top:3px;font-size:18px;font-weight:700;color:${T.tinta};">${esc(b.insignia.nombre)}</div>
      <div style="margin-top:3px;font-size:13px;line-height:1.5;color:${T.suave};">${esc(b.insignia.frase)}</div>
    </td>
  </tr>
</table>`
    }
  }
}

export function htmlDelCorreo(d: DatosDelSobre): string {
  const e = ESTADOS_CORREO[d.estado]
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${esc(d.asunto)}</title>
</head>
<body style="margin:0;padding:0;background:${T.fondo};font-family:${T.fuente};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(d.resumen)}&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.fondo};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:22px 32px;border-bottom:1px solid ${T.linea};">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:12px;"><img src="${LOGO}" width="40" height="40" alt="" style="display:block;border-radius:10px;"></td>
        <td style="vertical-align:middle;">
          <div style="font-size:14px;font-weight:700;color:${T.tinta};">Contratista Digital</div>
          <div style="font-size:12px;color:${T.tenue};margin-top:1px;">Plan de Desarrollo · Por Amor a Fredonia</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:3px;line-height:3px;font-size:0;background:${e.color};">&nbsp;</td></tr>
    <tr><td style="padding:30px 32px 8px;">
      <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${e.tinte};color:${e.color};font-size:12px;font-weight:700;letter-spacing:.2px;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${e.color};margin-right:7px;vertical-align:1px;"></span>${esc(e.palabra)}</span>
      <h1 style="margin:16px 0 18px;font-size:23px;line-height:1.3;font-weight:700;color:${T.tinta};">${esc(d.titulo)}</h1>
      ${d.bloques.map(b => htmlDeBloque(b, e.color)).join('\n      ')}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 30px;"><tr>
        <td style="border-radius:10px;background:${T.tinta};"><a href="${esc(d.boton.href)}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(d.boton.texto)}</a></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:20px 32px 26px;background:${T.superficie};border-top:1px solid ${T.linea};">
      <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:${T.tenue};">${esc(d.pie.referencia)}</p>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:${T.tenue};">Recibes este aviso ${esc(d.pie.motivo)}</p>
      <p style="margin:0;font-size:12px;line-height:1.55;color:${T.tenue};">Notificación automática: no respondas a este mensaje, esta dirección no recibe correo.${
        d.vistaPrevia ? ' El módulo Plan de Desarrollo está en vista previa.' : ''}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

// ─── Texto plano ─────────────────────────────────────────────────────────────

function textoDeBloque(b: Bloque): string {
  switch (b.t) {
    case 'parrafo': return b.texto
    case 'datos': return b.filas.map(f => `${f.rotulo}: ${f.valor}${f.nota ? ` (${f.nota})` : ''}`).join('\n')
    case 'cita': return `${b.rotulo}:\n${b.texto.split('\n').map(l => `  ${l}`).join('\n')}`
    case 'lista':
      return `${b.rotulo}:\n${b.items.map(i => `  - ${i.titulo}${i.detalle ? ` — ${i.detalle}` : ''}`).join('\n')}${b.mas ? `\n  … y ${b.mas.toLocaleString('es-CO')} más` : ''}`
    case 'pasos': return `${b.rotulo}:\n${b.items.map((p, k) => `  ${k + 1}. ${p}`).join('\n')}`
    case 'sello': return `Tu insignia: ${b.insignia.nombre} (${b.anio}). ${b.insignia.frase}`
  }
}

export function textoDelCorreo(d: DatosDelSobre): string {
  const e = ESTADOS_CORREO[d.estado]
  return [
    `Plan de Desarrollo · Por Amor a Fredonia · ${e.palabra}`,
    d.titulo,
    ...d.bloques.map(textoDeBloque),
    `${d.boton.texto}: ${d.boton.href}`,
    '—',
    d.pie.referencia,
    `Recibes este aviso ${d.pie.motivo}`,
    `Notificación automática: no respondas a este mensaje, esta dirección no recibe correo.${d.vistaPrevia ? ' El módulo Plan de Desarrollo está en vista previa.' : ''}`,
  ].join('\n\n')
}

export function armarCorreo(d: DatosDelSobre): CorreoListo {
  return { asunto: d.asunto, html: htmlDelCorreo(d), texto: textoDelCorreo(d) }
}
