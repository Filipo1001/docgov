import { accesoPdm } from '@/lib/pdm/acceso'
import { nombreDeArchivoDeConstancia } from '@/lib/pdm/constancia'
import { generarConstanciaPdf } from '@/lib/pdm/constancia-documento'
import { pdmHabilitado } from '@/lib/pdm/habilitado'
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
 *
 * El paquete ZIP (`./paquete`) usa la misma generación (`generarConstanciaPdf`) y las mismas comprobaciones.
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

    const c = await generarConstanciaPdf(reporteId)
    if (!c.ok) return new Response(c.error, { status: 500, headers: SIN_CACHE })
    return new Response(c.pdf as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreDeArchivoDeConstancia(c.codigo)}"`,
        ...SIN_CACHE,
      },
    })
  } catch (e) {
    console.error('[pdm/constancia-pdf] no se pudo generar la constancia:', e instanceof Error ? e.message : e)
    return new Response('No se pudo generar la constancia.', { status: 500, headers: SIN_CACHE })
  }
}
