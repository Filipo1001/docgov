import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const data = await buildPDFData(periodoId)
  if (!data) {
    return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  }

  const filename = `acta-pago-${data.contrato.numero}-${data.contrato.anio}-periodo-${data.periodo.numero}.pdf`

  return getOrGeneratePDF({
    supabase,
    tipo: 'acta-pago',
    periodoId,
    estado: data.periodo.estado,
    filename,
    generate: async () => {
      const [{ renderToBuffer }, React, { ActaPagoPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
        import('@/lib/pdf/acta-pago'),
      ])
      return renderToBuffer(React.createElement(ActaPagoPDF, { data }) as any) as unknown as Buffer
    },
  })
}
