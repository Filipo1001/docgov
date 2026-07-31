import 'server-only'

/**
 * lib/pdf/anexos.ts — Fusión de los anexos PDF al final del Informe de Actividades.
 *
 * @react-pdf/renderer no puede incrustar un PDF ajeno: genera documentos desde
 * componentes React. Para anexar páginas de un PDF existente hace falta
 * pdf-lib, que sí sabe copiar páginas entre documentos.
 *
 * Dos decisiones importantes:
 *
 * 1. RE-NUMERACIÓN. El informe imprime "Página X de Y" en un pie fijo, donde Y
 *    es el total que conoce react-pdf. Al anexar páginas, ese total deja de ser
 *    cierto: las páginas originales dirían "de 4" en un documento de 12. Por eso
 *    se estampa una numeración global nueva sobre TODAS las páginas al pie
 *    derecho, que sí refleja el documento completo.
 *
 * 2. FALLO TOLERANTE. Si un anexo está dañado, la fusión de ESE anexo se omite
 *    y el resto continúa. Un archivo secundario nunca debe impedir producir el
 *    documento oficial.
 */

import { descargarObjeto } from '@/lib/storage-firmado'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import type { PDFAnexo, PDFData } from './types'
import type { VerificacionPDF } from './verificacion-pdf'

export interface AnexoParaFusion {
  /** Ruta en el bucket `adjuntos`. */
  storage_path: string
  nombre_original: string
  /** Número de anexo (1-based), en orden de carga. */
  orden: number
}

interface AnexoCompleto extends AnexoParaFusion {
  paginas: number | null
  bytes: number
  sha256: string
}

/**
 * Carga los anexos vigentes de un periodo, en orden.
 * Devuelve [] ante cualquier fallo: los anexos nunca deben impedir generar el informe.
 */
export async function cargarAnexos(periodoId: string): Promise<AnexoCompleto[]> {
  try {
    const admin = createAdminSupabaseClient()
    const { data } = await admin
      .from('documentos_adjuntos')
      .select('storage_path, nombre_original, orden, paginas, bytes, sha256')
      .eq('entidad_tipo', 'periodo')
      .eq('entidad_id', periodoId)
      .eq('estado', 'limpio')          // solo los verificados
      .is('eliminado_at', null)
      .order('orden', { ascending: true })
    return (data ?? []) as AnexoCompleto[]
  } catch {
    return []
  }
}

/** Convierte los anexos al formato del índice que se renderiza en el informe. */
export function aIndicePDF(anexos: AnexoCompleto[]): PDFAnexo[] {
  return anexos.map(a => ({
    orden: a.orden,
    nombre: a.nombre_original,
    paginas: a.paginas,
    bytes: Number(a.bytes),
    sha256: a.sha256,
  }))
}

/**
 * Punto de entrada ÚNICO para generar el Informe de Actividades con sus anexos.
 *
 * Existe porque el informe se produce en cuatro sitios distintos (ruta directa
 * y tres ZIPs); tener la fusión en un solo lugar evita que se desincronicen.
 */
export async function generarInformeConAnexos(
  periodoId: string,
  data: PDFData,
  verif: VerificacionPDF | null,
): Promise<Buffer> {
  const anexos = await cargarAnexos(periodoId)

  const [{ renderToBuffer }, React, { InformeActividadesPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('react'),
    import('./informe-actividades'),
  ])

  const buffer = await renderToBuffer(
    React.createElement(InformeActividadesPDF, {
      data: { ...data, verificacion: verif ?? undefined, anexos: aIndicePDF(anexos) },
    }) as any,
  ) as unknown as Buffer

  return fusionarAnexos(buffer, anexos)
}

/**
 * Altura del sello de numeración, en puntos desde el borde inferior.
 *
 * El pie fijo del informe (código de verificación) arranca a 18 pt y crece
 * hacia arriba, así que la numeración global se estampa POR DEBAJO para no
 * solaparse con él — ambos van centrados.
 */
const PIE_Y = 7
const MARGEN_X = 34

/**
 * Une los anexos al final del informe ya generado.
 *
 * @param informeBuffer PDF del Informe de Actividades generado por react-pdf
 * @param anexos        metadatos de los anexos, en orden
 * @returns             PDF fusionado; si algo falla, el informe original intacto
 */
export async function fusionarAnexos(
  informeBuffer: Buffer,
  anexos: AnexoParaFusion[],
): Promise<Buffer> {
  if (!anexos.length) return informeBuffer

  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

    const doc = await PDFDocument.load(informeBuffer, { updateMetadata: false })
    const fuente = await doc.embedFont(StandardFonts.Helvetica)
    const fuenteBold = await doc.embedFont(StandardFonts.HelveticaBold)

    // Páginas del informe antes de anexar: a partir de aquí empiezan los anexos.
    const paginasInforme = doc.getPageCount()

    for (const anexo of anexos) {
      try {
        const bytes = await descargarObjeto('adjuntos', anexo.storage_path)
        if (!bytes) continue

        const src = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false })
        const indices = src.getPageIndices()
        const copiadas = await doc.copyPages(src, indices)

        copiadas.forEach((pagina, i) => {
          doc.addPage(pagina)
          // Leyenda "Anexo N — página X de Y" arriba a la derecha de cada
          // página anexada, para que cualquier hoja suelta sea identificable.
          const { width, height } = pagina.getSize()
          const etiqueta = `Anexo ${anexo.orden} — página ${i + 1} de ${indices.length}`
          const ancho = fuenteBold.widthOfTextAtSize(etiqueta, 8)
          pagina.drawText(etiqueta, {
            x: Math.max(MARGEN_X, width - ancho - MARGEN_X),
            y: height - 22,
            size: 8,
            font: fuenteBold,
            color: rgb(0.25, 0.25, 0.25),
          })
        })
      } catch {
        // Anexo ilegible o cifrado: se omite y el informe se genera igual.
        continue
      }
    }

    // ── Numeración global ───────────────────────────────────────────────────
    // El informe se renderizó SIN numeración propia (ver informe-actividades.tsx),
    // precisamente para poder estamparla aquí sobre el documento ya completo y
    // que el total sea el real. No hay nada que tapar: se dibuja limpio.
    //
    // Solo se estampa si de verdad se anexó algo. Si todos los anexos fallaron,
    // el documento se queda sin numeración visible, que es preferible a una
    // numeración incorrecta — y ese caso implica que algo ya se registró como error.
    const total = doc.getPageCount()
    if (total > paginasInforme) {
      doc.getPages().forEach((pagina, i) => {
        const { width } = pagina.getSize()
        const texto = `Página ${i + 1} de ${total}`
        const ancho = fuente.widthOfTextAtSize(texto, 7.5)
        pagina.drawText(texto, {
          x: (width - ancho) / 2,          // centrado, como el pie original del informe
          y: PIE_Y,
          size: 7.5,
          font: fuente,
          color: rgb(0.53, 0.53, 0.53),
        })
      })
    }

    const salida = await doc.save()
    return Buffer.from(salida)
  } catch {
    // Cualquier fallo global → informe sin anexos. Nunca romper el documento.
    return informeBuffer
  }
}
