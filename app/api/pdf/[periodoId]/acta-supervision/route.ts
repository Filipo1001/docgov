import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'
import { buildPDFData } from '@/lib/pdf/data'
import { getOrGeneratePDF } from '@/lib/pdf/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const filename = `acta-supervision-${data.contrato.numero}-${data.contrato.anio}-periodo-${data.periodo.numero}.pdf`

  return getOrGeneratePDF({
    supabase,
    tipo: 'acta-supervision',
    periodoId,
    estado: data.periodo.estado,
    filename,
    generate: async () => {
      const [{ renderToBuffer }, React, { ActaSupervisionPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
        import('@/lib/pdf/acta-supervision'),
      ])
      return renderToBuffer(React.createElement(ActaSupervisionPDF, { data }) as any) as unknown as Buffer
    },
  })
}
