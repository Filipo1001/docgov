import { accesoPdm } from '@/lib/pdm/acceso'
import { pdmHabilitado } from '@/lib/pdm/habilitado'
import { nombreDeArchivoDePaquete } from '@/lib/pdm/paquete'
import { construirPaquete } from '@/lib/pdm/paquete-servidor'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * GET /api/pdm-constancia/{reporteId}/paquete
 *
 * El paquete ZIP de una versión de reporte: la constancia en PDF, los archivos originales tal como se subieron, el listado de sus
 * huellas SHA-256 (en el formato de `shasum`) y un LEEME. Para llevarse todo lo que respalda un reporte y poder demostrar después
 * que no cambió. Ver `lib/pdm/paquete.ts`.
 *
 *   · Mismas comprobaciones que la constancia en PDF: 404 fuera del entorno del módulo, 401 sin sesión del módulo, y 404 si la
 *     sesión no ve ese reporte (lo decide la base). Solo quien ve el reporte y sus archivos se los puede llevar.
 *   · Las huellas del listado se calculan al empaquetar y se comparan con las registradas al subir cada archivo. Si alguna NO
 *     coincide, el paquete se entrega igual, marcado en el LEEME, y la respuesta lo dice en `X-Paquete-Discrepancias`.
 *   · Un archivo que no se puede leer deja sin paquete (502): no se entrega uno incompleto por una falla.
 *   · Si los archivos pasan de lo que cabe en un paquete (150 MB: en la práctica, videos), el paquete sale con los que caben y el
 *     LEEME dice cuáles dejó fuera y su huella; la respuesta lo dice en `X-Paquete-Omitidos`. No hay 413: un paquete que se
 *     declara parcial sigue sirviendo, y uno que no baja no sirve de nada.
 *   · `nodejs` y sin caché; hasta 60 s para leer los archivos.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SIN_CACHE = { 'Cache-Control': 'private, no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ reporteId: string }> }) {
  if (!pdmHabilitado()) return new Response(null, { status: 404 })
  try {
    const acceso = await accesoPdm()
    if (!acceso) return new Response(null, { status: 401, headers: SIN_CACHE })

    const { reporteId } = await params
    if (!UUID.test(reporteId)) return new Response(null, { status: 404, headers: SIN_CACHE })

    const supabase = await createServerSupabaseClient()
    const { data: visible, error } = await supabase.from('pdm_reportes').select('id').eq('id', reporteId).maybeSingle()
    if (error) {
      console.error('[pdm/paquete] no se pudo leer el reporte:', error.message)
      return new Response('No se pudo generar el paquete.', { status: 500, headers: SIN_CACHE })
    }
    if (!visible) return new Response(null, { status: 404, headers: SIN_CACHE })

    const p = await construirPaquete(supabase, reporteId)
    if (!p.ok) return new Response(p.error, { status: p.estado, headers: SIN_CACHE })
    return new Response(p.resultado.zip as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${nombreDeArchivoDePaquete(p.codigo)}"`,
        'X-Paquete-Archivos': String(p.resultado.archivos.length),
        'X-Paquete-Discrepancias': String(p.resultado.discrepancias),
        'X-Paquete-Omitidos': String(p.resultado.omitidos.length),
        ...SIN_CACHE,
      },
    })
  } catch (e) {
    console.error('[pdm/paquete] no se pudo generar el paquete:', e instanceof Error ? e.message : e)
    return new Response('No se pudo generar el paquete.', { status: 500, headers: SIN_CACHE })
  }
}
