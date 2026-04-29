/**
 * GET /api/pdf/[periodoId]/secop
 *
 * Descarga un ZIP con los 3 documentos requeridos para SECOP:
 *   01_Informe_de_Actividades.pdf
 *   02_Cuenta_de_Cobro.pdf
 *   03_Planilla_Seguridad_Social.{ext}  (si está adjunta)
 *
 * Acceso: contratista del contrato + asesor / supervisor / admin
 * Condición: periodo debe estar en estado 'aprobado' o 'radicado'
 * Nombre ZIP: NOMBRE_CONTRATISTA_MES_SECOP.zip
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

  const data = await buildPDFData(periodoId)
  if (!data) {
    return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  }

  if (!['aprobado', 'radicado'].includes(data.periodo.estado)) {
    return NextResponse.json(
      { error: 'Los documentos SECOP solo están disponibles cuando el periodo ha sido aprobado por la secretaria' },
      { status: 403 }
    )
  }

  // Fetch planilla in parallel with PDF generation
  const planillaPromise = supabase
    .from('periodos')
    .select('planilla_ss_url')
    .eq('id', periodoId)
    .single()

  const [
    { renderToBuffer },
    React,
    { InformeActividadesPDF },
    { CuentaDeCobroPDF },
  ] = await Promise.all([
    import('@react-pdf/renderer'),
    import('react'),
    import('@/lib/pdf/informe-actividades'),
    import('@/lib/pdf/cuenta-de-cobro'),
  ])

  const [informeBuffer, cuentaBuffer, planillaResult] = await Promise.all([
    renderToBuffer(React.createElement(InformeActividadesPDF, { data }) as any) as unknown as Promise<Buffer>,
    renderToBuffer(React.createElement(CuentaDeCobroPDF,      { data }) as any) as unknown as Promise<Buffer>,
    planillaPromise,
  ])

  // Fetch planilla file if available
  let planillaBuffer: Buffer | null = null
  let planillaExt = 'pdf'
  const planillaUrl = planillaResult.data?.planilla_ss_url
  if (planillaUrl) {
    try {
      const res = await fetch(planillaUrl)
      if (res.ok) {
        planillaBuffer = Buffer.from(await res.arrayBuffer())
        const ext = new URL(planillaUrl).pathname.split('.').pop()?.toLowerCase()
        if (ext && ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
          planillaExt = ext === 'jpeg' ? 'jpg' : ext
        }
      }
    } catch {
      // Non-fatal — ZIP generated without planilla
    }
  }

  const nombreNorm = normalizeNombre(data.contrato.contratista.nombre_completo)
  const mesNorm    = data.periodo.mes.toUpperCase()
  const folderName = `${nombreNorm}_${mesNorm}_SECOP`

  const zip    = new JSZip()
  const folder = zip.folder(folderName)!

  folder.file('01_Informe_de_Actividades.pdf', informeBuffer)
  folder.file('02_Cuenta_de_Cobro.pdf',        cuentaBuffer)
  if (planillaBuffer) {
    folder.file(`03_Planilla_Seguridad_Social.${planillaExt}`, planillaBuffer)
  }

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
