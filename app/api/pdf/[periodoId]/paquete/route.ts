/**
 * GET /api/pdf/[periodoId]/paquete
 *
 * Descarga un ZIP con los 5 documentos del periodo:
 *   Informe_de_Actividades.pdf
 *   Cuenta_de_Cobro.pdf
 *   Acta_de_Supervision.pdf
 *   Acta_de_Pago.pdf
 *   Planilla_Seguridad_Social.{ext}  (si está adjunta)
 *
 * Acceso: solo asesor / supervisor / admin
 * Condición: periodo debe estar en estado 'aprobado' o 'radicado'
 * Nombre ZIP: NOMBRE_CONTRATISTA_MES.zip  (ej. FELIPE_RESTREPO_ABRIL.zip)
 *
 * Optimización: los 4 PDFs se obtienen del caché de Supabase Storage cuando
 * están disponibles (estados aprobado/radicado siempre lo están después de la
 * primera descarga individual). Solo se regeneran en cache miss.
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

/** "Felipe Restrepo Ceballos" → "FELIPE_RESTREPO_CEBALLOS" */
function normalizeNombre(nombre: string): string {
  return nombre
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^A-Z0-9\s]/g, '')       // keep letters, numbers, spaces
    .trim()
    .replace(/\s+/g, '_')
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodoId: string }> }
) {
  const { periodoId } = await params

  // ── Auth + ownership check ───────────────────────────────────
  const supabase = await createServerSupabaseClient()

  const acceso = await verificarAccesoPeriodo(supabase, periodoId)
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.message }, { status: acceso.status })
  }

  // Paquete completo solo para roles administrativos (no contratista)
  if (acceso.rol === 'contratista') {
    return NextResponse.json({ error: 'No tienes permiso para descargar el paquete completo' }, { status: 403 })
  }

  // ── Build PDF data ───────────────────────────────────────────
  const data = await buildPDFData(periodoId)
  if (!data) {
    return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  }

  // ── Estado check ─────────────────────────────────────────────
  if (!['aprobado', 'radicado'].includes(data.periodo.estado)) {
    return NextResponse.json(
      { error: 'El paquete solo está disponible cuando el periodo ha sido aprobado por la secretaria' },
      { status: 403 }
    )
  }

  const estado = data.periodo.estado

  // ── Fetch planilla URL in parallel with PDF generation ───────
  const planillaPromise = supabase
    .from('periodos')
    .select('planilla_ss_url')
    .eq('id', periodoId)
    .single()

  // ── Get all 4 PDFs in parallel (cache-first) ─────────────────
  // Cache hits (common for aprobado/radicado) fetch from Supabase CDN — no CPU.
  // Cache misses generate the PDF, upload to cache, and return the buffer.
  const [informeBuffer, cuentaBuffer, supervisionBuffer, pagoBuffer, planillaResult] =
    await Promise.all([
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
      planillaPromise,
    ])

  // ── Fetch planilla file if available ─────────────────────────
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
      // Non-fatal — ZIP will be generated without planilla
    }
  }

  // ── Build ZIP ────────────────────────────────────────────────
  const nombreNorm = normalizeNombre(data.contrato.contratista.nombre_completo)
  const mesNorm    = data.periodo.mes.toUpperCase()
  const folderName = `${nombreNorm}_${mesNorm}`

  const zip    = new JSZip()
  const folder = zip.folder(folderName)!

  folder.file('Informe_de_Actividades.pdf', informeBuffer)
  folder.file('Cuenta_de_Cobro.pdf',        cuentaBuffer)
  folder.file('Acta_de_Supervision.pdf',    supervisionBuffer)
  folder.file('Acta_de_Pago.pdf',           pagoBuffer)
  if (planillaBuffer) {
    folder.file(`Planilla_Seguridad_Social.${planillaExt}`, planillaBuffer)
  }

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
