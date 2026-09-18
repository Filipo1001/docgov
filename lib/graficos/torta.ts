/**
 * lib/graficos/torta.ts — la torta del consolidado mensual.
 *
 * ── Por qué esto existe y no es un <svg> dentro del correo ───────────────
 *
 * Gmail y Outlook eliminan `<svg>` del cuerpo de un correo: la etiqueta
 * desaparece entera y donde iba el gráfico no queda ni un hueco. Lo único que
 * pinta un círculo en todos los clientes es un `<img>` con un mapa de bits.
 *
 * Así que el gráfico se dibuja aquí en SVG, se rasteriza a PNG con `sharp`
 * —que ya viene con Next para optimizar imágenes, no añade dependencias— y se
 * sirve desde `/api/grafico/envios`.
 *
 * ── Qué viaja en la URL, y qué no ────────────────────────────────────────
 *
 * Solo DOS ENTEROS: cuántos enviaron y cuántos contratos había. Ni el nombre
 * de la dependencia, ni el mes, ni un identificador. El correo ya dice de qué
 * secretaría habla; la imagen solo tiene que saber dibujar una proporción.
 *
 * Esto importa porque la URL de una imagen de correo la ve el proxy de Gmail,
 * que además la descarga y la cachea. Cuanto menos lleve, mejor: «38 y 40» no
 * identifica a nadie.
 *
 * ── Por qué va firmada ───────────────────────────────────────────────────
 *
 * Sin firma, cualquiera podría pedir `?e=1&t=100` y tendría una imagen alojada
 * en el dominio del municipio sugiriendo que la alcaldía cumple el 1%. La
 * firma no protege un secreto —los dos números salen en el propio correo—:
 * impide fabricar gráficos ajenos con nuestra marca encima.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { ORIGEN_APP } from '@/lib/dominio'

/** Tinta de la marca para la porción cumplida. */
const TINTA = '#192031'
/** Gris neutro para lo que falta: no es rojo, no es una acusación. */
const HUECO = '#cbd5e1'

export interface DatosTorta {
  /** Contratos cuyo informe salió del borrador. */
  enviados: number
  /** Contratos vigentes en el mes. */
  total: number
}

/**
 * La firma de un gráfico.
 *
 * Se apoya en `CRON_SECRET` porque es el mismo secreto sin el cual estos
 * correos no llegan a existir: si falta, no hay consolidado que enviar y no
 * hay gráfico que firmar. Evita añadir una variable de entorno más que alguien
 * tendría que acordarse de configurar.
 */
export function firmarTorta({ enviados, total }: DatosTorta): string | null {
  const secreto = process.env.CRON_SECRET
  if (!secreto) return null
  return createHmac('sha256', secreto).update(`${enviados}:${total}`).digest('hex').slice(0, 24)
}

/** Comparación en tiempo constante; `timingSafeEqual` exige igual longitud. */
export function firmaValida(datos: DatosTorta, firma: string): boolean {
  const esperada = firmarTorta(datos)
  if (!esperada || esperada.length !== firma.length) return false
  return timingSafeEqual(Buffer.from(esperada), Buffer.from(firma))
}

/** La URL absoluta del PNG, lista para el `src` de un `<img>`. */
export function urlTorta(datos: DatosTorta): string | null {
  const firma = firmarTorta(datos)
  if (!firma) return null
  return `${ORIGEN_APP}/api/grafico/envios?e=${datos.enviados}&t=${datos.total}&s=${firma}`
}

/** Punto de la circunferencia para una fracción del total, desde las 12 en punto. */
function punto(cx: number, cy: number, r: number, fraccion: number): [number, number] {
  const a = 2 * Math.PI * fraccion - Math.PI / 2
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

const n2 = (n: number) => Math.round(n * 100) / 100

/**
 * El SVG de la torta, con su leyenda.
 *
 * Se dibuja al doble de tamaño del que ocupará en el correo: las pantallas de
 * densidad doble son la norma en el móvil, y una imagen a tamaño natural se ve
 * borrosa justo donde más se lee el correo.
 */
export function svgTorta({ enviados, total }: DatosTorta): string {
  const ESCALA = 2
  const A = 420 * ESCALA
  const H = 190 * ESCALA
  const cx = 105 * ESCALA
  const cy = 95 * ESCALA
  const r = 72 * ESCALA

  const sinEnviar = Math.max(0, total - enviados)
  const frac = total > 0 ? enviados / total : 0
  const pct = Math.round(frac * 100)

  // Un arco no puede dar la vuelta entera: con 0% o 100% el `path` degenera en
  // un punto y desaparece. Esos dos casos se pintan como un círculo liso.
  let porciones: string
  if (total === 0) {
    porciones = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${HUECO}"/>`
  } else if (enviados >= total) {
    porciones = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${TINTA}"/>`
  } else if (enviados <= 0) {
    porciones = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${HUECO}"/>`
  } else {
    const [x, y] = punto(cx, cy, r, frac)
    const mayor = frac > 0.5 ? 1 : 0
    porciones =
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${HUECO}"/>` +
      `<path d="M ${cx} ${cy} L ${cx} ${n2(cy - r)} A ${r} ${r} 0 ${mayor} 1 ${n2(x)} ${n2(y)} Z" fill="${TINTA}"/>`
  }

  // Centro hueco: la lectura de una proporción mejora con el anillo, y deja
  // sitio para el número, que es lo que de verdad se recuerda.
  const rInterior = r * 0.56
  const leyenda = (dy: number, color: string, etiqueta: string, valor: number) => `
    <rect x="${232 * ESCALA}" y="${dy * ESCALA}" width="${11 * ESCALA}" height="${11 * ESCALA}" rx="${3 * ESCALA}" fill="${color}"/>
    <text x="${251 * ESCALA}" y="${(dy + 9.5) * ESCALA}" font-family="Helvetica, Arial, sans-serif" font-size="${13 * ESCALA}" fill="#334155">${etiqueta}</text>
    <text x="${406 * ESCALA}" y="${(dy + 9.5) * ESCALA}" font-family="Helvetica, Arial, sans-serif" font-size="${13 * ESCALA}" font-weight="bold" fill="#0f172a" text-anchor="end">${valor}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A}" height="${H}" viewBox="0 0 ${A} ${H}">
  <rect width="${A}" height="${H}" fill="#ffffff"/>
  ${porciones}
  <circle cx="${cx}" cy="${cy}" r="${n2(rInterior)}" fill="#ffffff"/>
  <text x="${cx}" y="${cy + 4 * ESCALA}" font-family="Helvetica, Arial, sans-serif" font-size="${30 * ESCALA}" font-weight="bold" fill="${TINTA}" text-anchor="middle">${pct}%</text>
  <text x="${cx}" y="${cy + 22 * ESCALA}" font-family="Helvetica, Arial, sans-serif" font-size="${11 * ESCALA}" fill="#64748b" text-anchor="middle">enviaron</text>
  ${leyenda(66, TINTA, 'Informes enviados', enviados)}
  ${leyenda(94, HUECO, 'Sin enviar', sinEnviar)}
  <line x1="${232 * ESCALA}" y1="${122 * ESCALA}" x2="${406 * ESCALA}" y2="${122 * ESCALA}" stroke="#e2e8f0" stroke-width="${ESCALA}"/>
  <text x="${232 * ESCALA}" y="${139 * ESCALA}" font-family="Helvetica, Arial, sans-serif" font-size="${13 * ESCALA}" fill="#64748b">Contratos activos</text>
  <text x="${406 * ESCALA}" y="${139 * ESCALA}" font-family="Helvetica, Arial, sans-serif" font-size="${13 * ESCALA}" font-weight="bold" fill="#0f172a" text-anchor="end">${total}</text>
</svg>`
}

/** Ancho en píxeles CSS con el que el correo debe pedir la imagen. */
export const ANCHO_TORTA = 420
export const ALTO_TORTA = 190
