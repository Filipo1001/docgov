/**
 * GET /api/grafico/envios?e=38&t=40&s=… — la torta del consolidado, en PNG.
 *
 * Existe porque Gmail y Outlook eliminan `<svg>` del cuerpo de un correo. Un
 * `<img>` con un mapa de bits es lo único que pinta un círculo en todos los
 * clientes, y esta ruta es de donde sale ese mapa de bits.
 *
 * ── Pública sin sesión, y tiene que serlo ────────────────────────────────
 *
 * El cliente de correo descarga la imagen sin cookies; Gmail ni siquiera la
 * pide desde el ordenador de quien lee, sino desde su proxy. Cualquier
 * comprobación de sesión dejaría el correo con un hueco.
 *
 * Lo que la hace inofensiva es que no consulta la base de datos ni conoce a
 * nadie: recibe DOS ENTEROS por la URL y dibuja una proporción. No hay
 * dependencia, ni mes, ni identificador que filtrar. Es el mismo criterio de
 * la regla 4 del proyecto —público no es indexable—, y por eso lleva
 * `X-Robots-Tag: noindex` como `/verificar`.
 *
 * La firma no guarda un secreto: los dos números están escritos en el propio
 * correo. Impide que alguien fabrique `?e=1&t=100` y tenga una imagen alojada
 * en el dominio del municipio diciendo que la alcaldía cumple el 1%.
 */

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { svgTorta, firmaValida } from '@/lib/graficos/torta'

export const runtime = 'nodejs'

/** Un consolidado no cambia una vez cerrado el mes: se puede cachear fuerte. */
const CACHE = 'public, max-age=31536000, immutable'

/** Entero no negativo y acotado: el municipio no va a tener 10.000 contratos. */
function entero(v: string | null): number | null {
  if (v === null || !/^\d{1,4}$/.test(v)) return null
  return Number(v)
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const enviados = entero(q.get('e'))
  const total = entero(q.get('t'))
  const firma = q.get('s') ?? ''

  if (enviados === null || total === null || enviados > total) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }
  if (!firmaValida({ enviados, total }, firma)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 403 })
  }

  const png = await sharp(Buffer.from(svgTorta({ enviados, total }))).png().toBuffer()

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': CACHE,
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Length': String(png.length),
    },
  })
}
