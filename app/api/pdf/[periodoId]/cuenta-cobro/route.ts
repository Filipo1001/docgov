import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildPDFData } from '@/lib/pdf/data'
import { CuentaDeCobroPDF } from '@/lib/pdf/cuenta-de-cobro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodoId: string }> }
) {
  const { periodoId } = await params

  // Auth check
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const data = await buildPDFData(periodoId)
  if (!data) {
    return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  }

  const buffer = await renderToBuffer(React.createElement(CuentaDeCobroPDF, { data }))

  const filename = `cuenta-cobro-${data.contrato.numero}-${data.contrato.anio}-periodo-${data.periodo.numero}.pdf`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
