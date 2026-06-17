/**
 * GET /api/pdf/[periodoId]/secop
 *
 * Descarga un ZIP con los 3 documentos requeridos para SECOP:
 *   Informe_de_Actividades.pdf
 *   Cuenta_de_Cobro.pdf
 *   Planilla_Seguridad_Social.{ext}  (si está adjunta)
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

  const estado = data.periodo.estado

  // Informe y Cuenta de Cobro: cache-first (igual que /actas). La primera
  // descarga genera y cachea; las siguientes se sirven desde Storage casi
  // instantáneamente. Los tipos 'informe' y 'cuenta-cobro' ya son invalidados
  // por invalidarCachePDF cuando cambia el estado del periodo.
  const [informeBuffer, cuentaBuffer, planillaResult] = await Promise.all([
    getOrGeneratePDFBuffer({
      supabase,
      tipo: 'informe',
      periodoId,
      estado,
      generate: async () => {
        const [{ renderToBuffer }, React, { InformeActividadesPDF }] = await Promise.all([
          import('@react-pdf/renderer'),
          import('react'),
          import('@/lib/pdf/informe-actividades'),
        ])
        return renderToBuffer(React.createElement(InformeActividadesPDF, { data }) as any) as unknown as Promise<Buffer>
      },
    }),
    getOrGeneratePDFBuffer({
      supabase,
      tipo: 'cuenta-cobro',
      periodoId,
      estado,
      generate: async () => {
        const [{ renderToBuffer }, React, { CuentaDeCobroPDF }] = await Promise.all([
          import('@react-pdf/renderer'),
          import('react'),
          import('@/lib/pdf/cuenta-de-cobro'),
        ])
        return renderToBuffer(React.createElement(CuentaDeCobroPDF, { data }) as any) as unknown as Promise<Buffer>
      },
    }),
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

  folder.file('Informe_de_Actividades.pdf', informeBuffer)
  folder.file('Cuenta_de_Cobro.pdf',        cuentaBuffer)
  if (planillaBuffer) {
    folder.file(`Planilla_Seguridad_Social.${planillaExt}`, planillaBuffer)
  }

  // STORE (sin compresión): los PDFs ya vienen comprimidos, así que DEFLATE
  // gasta CPU sin reducir tamaño — y esa CPU cuenta contra maxDuration en el
  // peor caso (cache miss). Alineado con paquete/route.ts.
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
