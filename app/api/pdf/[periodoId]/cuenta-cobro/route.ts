import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'
import { buildPDFData } from '@/lib/pdf/data'
import { getOrGeneratePDF, invalidarCachePDF, PDFDatosIncompletosError } from '@/lib/pdf/cache'
import { mensajeDatosFaltantes } from '@/lib/pdf/validar'
import { estadoFacturaPeriodo } from '@/lib/factura-electronica'
import { descargarObjeto } from '@/lib/storage-firmado'

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

  // Para quien factura electrónicamente este documento no existe: en su lugar
  // se entrega la factura que él adjuntó. Se resuelve aquí y no solo en la UI
  // porque la ruta es accesible por URL directa y desde los ZIP.
  const factura = await estadoFacturaPeriodo(periodoId)
  if (factura.exigeFactura) {
    if (!factura.facturaUrl) {
      return NextResponse.json(
        { error: 'Este contratista factura electrónicamente: la Cuenta de Cobro no se genera. Aún no ha adjuntado su factura.' },
        { status: 404 },
      )
    }
    const buffer = await descargarObjeto('documentos', factura.facturaUrl)
    if (!buffer) {
      return NextResponse.json({ error: 'No se pudo leer la factura adjunta.' }, { status: 502 })
    }
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="factura-electronica-${periodoId}.pdf"`,
      },
    })
  }

  if (req.nextUrl.searchParams.get('force') === '1') {
    await invalidarCachePDF(createAdminSupabaseClient(), periodoId).catch(() => {})
  }

  // buildPDFData lives inside generate so it is only called on cache miss
  return getOrGeneratePDF({
    supabase,
    tipo: 'cuenta-cobro',
    periodoId,
    generate: async (verif) => {
      const data = await buildPDFData(periodoId)
      if (!data) throw new Error('Periodo no encontrado')
      const faltan = mensajeDatosFaltantes('cuenta-cobro', data)
      if (faltan) throw new PDFDatosIncompletosError(faltan)
      const filename = `cuenta-cobro-${data.contrato.numero}-${data.contrato.anio}-periodo-${data.periodo.numero}.pdf`
      const [{ renderToBuffer }, React, { CuentaDeCobroPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
        import('@/lib/pdf/cuenta-de-cobro'),
      ])
      const buffer = await renderToBuffer(React.createElement(CuentaDeCobroPDF, { data: { ...data, verificacion: verif ?? undefined } }) as any) as unknown as Buffer
      return { buffer, filename }
    },
  })
}
