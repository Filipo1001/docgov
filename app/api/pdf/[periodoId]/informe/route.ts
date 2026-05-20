import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'
import { buildPDFData } from '@/lib/pdf/data'
import { getOrGeneratePDF, invalidarCachePDF } from '@/lib/pdf/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ periodoId: string }> }
) {
  const { periodoId } = await params

  const supabase = await createServerSupabaseClient()

  const acceso = await verificarAccesoPeriodo(supabase, periodoId)
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.message }, { status: acceso.status })
  }

  // ?force=1 — bypass cache and regenerate the PDF from scratch.
  // Useful when a stale cached PDF needs to be manually cleared by an admin.
  const forceRegen = req.nextUrl.searchParams.get('force') === '1'
  if (forceRegen) {
    await invalidarCachePDF(createAdminSupabaseClient(), periodoId).catch(() => {})
  }

  // buildPDFData lives inside generate so it is only called on cache miss
  return getOrGeneratePDF({
    supabase,
    tipo: 'informe',
    periodoId,
    generate: async () => {
      const data = await buildPDFData(periodoId)
      if (!data) throw new Error('Periodo no encontrado')
      const filename = `informe-actividades-${data.contrato.numero}-${data.contrato.anio}-periodo-${data.periodo.numero}.pdf`
      const [{ renderToBuffer }, React, { InformeActividadesPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
        import('@/lib/pdf/informe-actividades'),
      ])
      const buffer = await renderToBuffer(React.createElement(InformeActividadesPDF, { data }) as any) as unknown as Buffer
      return { buffer, filename }
    },
  })
}
