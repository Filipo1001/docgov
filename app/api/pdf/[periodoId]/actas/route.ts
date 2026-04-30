/**
 * GET /api/pdf/[periodoId]/actas
 *
 * Descarga un ZIP con los dos documentos institucionales del periodo:
 *   01_Acta_de_Supervision.pdf
 *   02_Acta_de_Pago.pdf
 *
 * Acceso: asesor / supervisor / admin
 * Condición: periodo debe estar en estado 'aprobado' o 'radicado'
 * Nombre ZIP: NOMBRE_CONTRATISTA_MES_ACTAS.zip
 */

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'
import { buildPDFData } from '@/lib/pdf/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const [
    { renderToBuffer },
    React,
    { ActaSupervisionPDF },
    { ActaPagoPDF },
  ] = await Promise.all([
    import('@react-pdf/renderer'),
    import('react'),
    import('@/lib/pdf/acta-supervision'),
    import('@/lib/pdf/acta-pago'),
  ])

  const [actaSupervisionBuffer, actaPagoBuffer] = await Promise.all([
    renderToBuffer(React.createElement(ActaSupervisionPDF, { data }) as any) as unknown as Promise<Buffer>,
    renderToBuffer(React.createElement(ActaPagoPDF,        { data }) as any) as unknown as Promise<Buffer>,
  ])

  const nombreNorm = normalizeNombre(data.contrato.contratista.nombre_completo)
  const mesNorm    = data.periodo.mes.toUpperCase()
  const folderName = `${nombreNorm}_${mesNorm}_ACTAS`

  const zip    = new JSZip()
  const folder = zip.folder(folderName)!
  folder.file('01_Acta_de_Supervision.pdf', actaSupervisionBuffer)
  folder.file('02_Acta_de_Pago.pdf',        actaPagoBuffer)

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${folderName}.zip"`,
    },
  })
}
