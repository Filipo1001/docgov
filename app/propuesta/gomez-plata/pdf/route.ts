import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { GOMEZ_PLATA } from '../datos'

/**
 * Entrega la propuesta en PDF.
 *
 * `nodejs` y no el runtime de borde: @react-pdf/renderer necesita APIs de Node
 * —el sistema de archivos, entre otras— para componer el documento.
 *
 * EL ESCUDO SE LEE DEL DISCO Y SE INCRUSTA EN BASE64. Pasarle una ruta relativa
 * al renderizador no sirve: no corre en un navegador y no tiene origen contra
 * el que resolverla. Y pasarle la URL del municipio sería peor — una descarga
 * de un servidor ajeno en mitad de la generación, que el día que ellos
 * reorganicen su web deja el documento sin escudo o colgado.
 *
 * Sin caché: el documento es pequeño, se genera en un instante y así cualquier
 * corrección de texto sale en la siguiente descarga sin purgar nada.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [{ renderToBuffer }, React, { PropuestaGomezPlataPDF }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
      import('../Documento'),
    ])

    const bytes = await readFile(path.join(process.cwd(), 'public', 'municipios', 'gomez-plata.png'))
    const escudo = `data:image/png;base64,${bytes.toString('base64')}`

    const pdf = await renderToBuffer(
      React.createElement(PropuestaGomezPlataPDF, { escudo }) as never,
    )

    // `inline`: se abre en el visor del navegador en vez de caer a la carpeta de
    // descargas. Quien recibe una propuesta quiere verla, no archivarla todavía.
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          `inline; filename="Propuesta Contratista Digital - Alcaldia de ${GOMEZ_PLATA.municipio}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[propuesta/gomez-plata/pdf]', err)
    return NextResponse.json({ error: 'No se pudo generar el documento' }, { status: 500 })
  }
}
