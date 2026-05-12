import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'
import { buildPDFData } from '@/lib/pdf/data'
import { getOrGeneratePDF } from '@/lib/pdf/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  // buildPDFData lives inside generate so it is only called on cache miss
  return getOrGeneratePDF({
    supabase,
    tipo: 'cuenta-cobro',
    periodoId,
    generate: async () => {
      const data = await buildPDFData(periodoId)
      if (!data) throw new Error('Periodo no encontrado')
      const filename = `cuenta-cobro-${data.contrato.numero}-${data.contrato.anio}-periodo-${data.periodo.numero}.pdf`
      const [{ renderToBuffer }, React, { CuentaDeCobroPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
        import('@/lib/pdf/cuenta-de-cobro'),
      ])
      const buffer = await renderToBuffer(React.createElement(CuentaDeCobroPDF, { data }) as any) as unknown as Buffer
      return { buffer, filename }
    },
  })
}
