import QRCode from 'qrcode'
import { accesoPdm } from '@/lib/pdm/acceso'
import { nombreDeArchivoDeConstancia, rutaDeVerificacion } from '@/lib/pdm/constancia'
import { cargarConstanciaPublica, emitirConstancia } from '@/lib/pdm/constancia-servidor'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import { pdmHabilitado } from '@/lib/pdm/habilitado'
import { ORIGEN_APP } from '@/lib/dominio'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * GET /api/pdm-constancia/{reporteId}
 *
 * La constancia en PDF de una versión de reporte: datos, archivos con su huella y el QR que lleva a `/verificar/PDM-…`.
 *
 *   · Solo existe donde existe el módulo (vista previa o desarrollo; en producción, abierto por `PDM_PRODUCCION`): fuera de ahí
 *     responde 404, como todo lo del módulo. OJO: la página pública `/verificar/PDM-…` NO depende de eso: un QR impreso tiene
 *     que seguir valiendo aunque algún día se cierre el módulo.
 *   · Solo quien tiene acceso al módulo (401 si no) Y ve ese reporte. Eso lo decide la base con la sesión de quien pide: quien no
 *     ve el reporte recibe 404, igual que si no existiera.
 *   · El código se crea aquí la primera vez que alguien pide la constancia de esa versión y desde entonces es el mismo
 *     (`pdm_constancia_emitir`); el QR impreso no cambia nunca.
 *   · El contenido es el que entrega `pdm_constancia_publica`: el mismo que ve el público. Nada de nombres de archivo ni textos.
 *   · `nodejs` y no borde: @react-pdf/renderer necesita APIs de Node. Sin caché: el estado impreso es el de este instante.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'Cache-Control': 'private, no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ reporteId: string }> }) {
  if (!pdmHabilitado()) return new Response(null, { status: 404 })
  try {
    const acceso = await accesoPdm()
    if (!acceso) return new Response(null, { status: 401, headers: SIN_CACHE })

    const { reporteId } = await params
    if (!UUID.test(reporteId)) return new Response(null, { status: 404, headers: SIN_CACHE })

    // ¿Ve este reporte? La seguridad por filas decide con la sesión de quien pide (un reporte anulado solo lo ven quienes deben).
    const supabase = await createServerSupabaseClient()
    const { data: visible, error } = await supabase.from('pdm_reportes').select('id').eq('id', reporteId).maybeSingle()
    if (error) {
      console.error('[pdm/constancia-pdf] no se pudo leer el reporte:', error.message)
      return new Response('No se pudo generar la constancia.', { status: 500, headers: SIN_CACHE })
    }
    if (!visible) return new Response(null, { status: 404, headers: SIN_CACHE })

    const emitida = await emitirConstancia(reporteId)
    if (!emitida.ok) return new Response(emitida.error, { status: 500, headers: SIN_CACHE })
    const lectura = await cargarConstanciaPublica(emitida.codigo)
    if (lectura.estado !== 'ok') return new Response('No se pudo generar la constancia.', { status: 500, headers: SIN_CACHE })

    const url = `${ORIGEN_APP}${rutaDeVerificacion(emitida.codigo)}`
    const qr = await QRCode.toDataURL(url, { margin: 0, width: 360, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } })

    const [{ renderToBuffer }, React, { ConstanciaDeReporte }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
      import('@/lib/pdm/constancia-pdf'),
    ])
    const pdf = await renderToBuffer(
      React.createElement(ConstanciaDeReporte, { c: lectura.constancia, qr, url, generadaEn: fechaHoraBogota(new Date().toISOString()) }) as never,
    )
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreDeArchivoDeConstancia(emitida.codigo)}"`,
        ...SIN_CACHE,
      },
    })
  } catch (e) {
    console.error('[pdm/constancia-pdf] no se pudo generar la constancia:', e instanceof Error ? e.message : e)
    return new Response('No se pudo generar la constancia.', { status: 500, headers: SIN_CACHE })
  }
}
