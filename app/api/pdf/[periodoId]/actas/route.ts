/**
 * GET /api/pdf/[periodoId]/actas
 *
 * Descarga un ZIP con los dos documentos institucionales del periodo:
 *   Acta_de_Supervision.pdf
 *   Acta_de_Pago.pdf
 *
 * Acceso: asesor / supervisor / admin
 * Condición: periodo debe estar en estado 'aprobado' o 'radicado'
 * Nombre ZIP: NOMBRE_CONTRATISTA_MES_ACTAS.zip
 *
 * Optimización: ambas actas se obtienen del caché de Supabase Storage
 * cuando están disponibles. Solo se regeneran en cache miss.
 * ZIP usa compresión STORE (level 0) — los PDFs ya están comprimidos,
 * DEFLATE no reduce el tamaño pero sí consume CPU innecesario.
 */

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'
import { buildPDFData } from '@/lib/pdf/data'
import { getOrGeneratePDFBuffer } from '@/lib/pdf/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function normalizeNombre(nombre: string): string {
  return nombre
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodoId: string }> }
) {
  const { periodoId } = await params

  const supabase = await createServerSupabaseClient()

  const acceso = await verificarAccesoPeriodo(supabase, periodoId)
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.message }, { status: acceso.status })
  }

  if (acceso.rol === 'contratista') {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const data = await buildPDFData(periodoId)
  if (!data) {
    return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  }

  if (!['aprobado', 'radicado'].includes(data.periodo.estado)) {
    return NextResponse.json(
      { error: 'Las actas solo están disponibles cuando el periodo ha sido aprobado' },
      { status: 403 }
    )
  }

  const estado = data.periodo.estado

  // Fetch both PDFs in parallel (cache-first)
  const [actaSupervisionBuffer, actaPagoBuffer] = await Promise.all([
    getOrGeneratePDFBuffer({
      supabase,
      tipo: 'acta-supervision',
      periodoId,
      estado,
      generate: async () => {
        const [{ renderToBuffer }, React, { ActaSupervisionPDF }] = await Promise.all([
          import('@react-pdf/renderer'),
          import('react'),
          import('@/lib/pdf/acta-supervision'),
        ])
        return renderToBuffer(React.createElement(ActaSupervisionPDF, { data }) as any) as unknown as Promise<Buffer>
      },
    }),
    getOrGeneratePDFBuffer({
      supabase,
      tipo: 'acta-pago',
      periodoId,
      estado,
      generate: async () => {
        const [{ renderToBuffer }, React, { ActaPagoPDF }] = await Promise.all([
          import('@react-pdf/renderer'),
          import('react'),
          import('@/lib/pdf/acta-pago'),
        ])
        return renderToBuffer(React.createElement(ActaPagoPDF, { data }) as any) as unknown as Promise<Buffer>
      },
    }),
  ])

  const nombreNorm = normalizeNombre(data.contrato.contratista.nombre_completo)
  const mesNorm    = data.periodo.mes.toUpperCase()
  const folderName = `${nombreNorm}_${mesNorm}_ACTAS`

  const zip    = new JSZip()
  const folder = zip.folder(folderName)!
  folder.file('Acta_de_Supervision.pdf', actaSupervisionBuffer)
  folder.file('Acta_de_Pago.pdf',        actaPagoBuffer)

  // STORE (level 0): PDFs are already compressed — DEFLATE wastes CPU with no size gain
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'STORE',
  })

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${folderName}.zip"`,
    },
  })
}
