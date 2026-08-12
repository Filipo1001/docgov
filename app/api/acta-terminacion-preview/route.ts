/**
 * TEMPORAL — verificación visual del pulido del Acta de Terminación.
 * Se borra al terminar la revisión. No requiere sesión ni datos reales.
 *
 * ?otrosi=1 → incluye un caso con prórroga, para probar el punto 2 del pulido.
 */
import { NextRequest, NextResponse } from 'next/server'
import { qrDataUrl, urlVerificacion } from '@/lib/verificacion'
import type { ActaTerminacionData } from '@/lib/pdf/acta-terminacion'

export async function GET(request: NextRequest) {
  const conOtrosi = request.nextUrl.searchParams.get('otrosi') === '1'
  const codigo = 'PREVIEW-0000'

  const data: ActaTerminacionData = {
    municipio: {
      nombre: 'Fredonia',
      departamento: 'Antioquia',
      nit: '890.980.774-3',
      representante_legal: 'Juan Carlos Gómez Restrepo',
      firma_representante_url: undefined,
    },
    contrato: {
      numero: '023',
      anio: 2026,
      objeto: 'Prestar servicios profesionales de apoyo a la gestión administrativa y contractual de la Secretaría General de Gobierno del Municipio de Fredonia',
      valor_total: 20500000,
      valor_letras_total: 'veinte millones quinientos mil pesos m/cte',
      fecha_inicio: '2026-08-05',
      fecha_fin: conOtrosi ? '2027-02-28' : '2026-12-31',
      otrosies: conOtrosi ? [
        { numero: 1, tipo: 'prorroga', fecha_inicio: '2026-12-15' },
        { numero: 2, tipo: 'adicion', fecha_inicio: '2027-01-10' },
      ] : [],
    },
    contratista: {
      nombre_completo: 'Felipe Restrepo Ceballos',
      cedula: '1152456789',
      firma_url: undefined,
    },
    supervisor: {
      nombre_completo: 'Sara Sánchez Vélez',
      cargo: 'Secretaria General de Gobierno',
      firma_url: undefined,
    },
    fechaTerminacion: conOtrosi ? '2027-02-28' : '2026-12-31',
    fechaAceptacion: new Date().toISOString(),
    verificacion: {
      codigo,
      qr: await qrDataUrl(codigo),
      url: urlVerificacion(codigo),
      fechaAprobacion: new Date().toISOString(),
      municipio: 'FREDONIA',
    },
  }

  const [{ renderToBuffer }, React, { ActaTerminacionPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('react'),
    import('@/lib/pdf/acta-terminacion'),
  ])
  const buffer = await renderToBuffer(
    React.createElement(ActaTerminacionPDF, { data }) as any,
  ) as unknown as Buffer

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf' },
  })
}
