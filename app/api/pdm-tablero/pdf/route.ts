import { accesoPdm } from '@/lib/pdm/acceso'
import { cargarPlanPdm } from '@/lib/pdm/datos'
import { hoyBogota } from '@/lib/pdm/contrato'
import { cargarDirectorio } from '@/lib/pdm/directorio'
import { pdmHabilitado } from '@/lib/pdm/habilitado'
import { armarInforme, nombreDeArchivoDelInforme } from '@/lib/pdm/informe'
import { anioDeParametro } from '@/lib/pdm/seguimiento'
import { datosDelTablero } from '@/lib/pdm/tablero'
import { cargarCifrasPorSecretaria } from '@/lib/pdm/tablero-datos'

/**
 * GET /api/pdm-tablero/pdf?anio=2026&medida=cumplimiento&equipo=1
 *
 * El informe en PDF del tablero del secretario de despacho: una hoja A4 apaisada con lo que ve en pantalla y, si lo pide
 * (`equipo=1`), una segunda con su equipo por nombre. Sin `equipo`, el documento no trae a nadie por su nombre.
 *
 *   · Solo existe donde existe el módulo (vista previa o desarrollo): fuera de ahí responde 404, como todo lo del módulo.
 *   · Solo lo genera para el nivel «secretaría» (401 sin sesión del módulo, 403 con otro nivel). Lee TODO con la sesión de quien lo
 *     pide, así que la base le entrega solo lo que le toca (las cifras entre secretarías, solo a quien puede verlas).
 *   · Las cuentas son las del tablero (`lib/pdm/tablero.ts`): aquí no se calcula nada propio.
 *   · `nodejs` y no borde: @react-pdf/renderer necesita APIs de Node. Sin caché: es un documento pequeño y debe salir con las
 *     cifras de este momento.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  if (!pdmHabilitado()) return new Response(null, { status: 404 })
  try {
    const acceso = await accesoPdm()
    if (!acceso) return new Response(null, { status: 401, headers: SIN_CACHE })
    if (acceso.nivel !== 'coordinador') return new Response(null, { status: 403, headers: SIN_CACHE })

    const url = new URL(req.url)
    // El directorio se lee siempre: sin él no se sabe quién no tiene acceso, y eso no se debe decir como «nadie».
    const [plan, filasDeCifras, dir] = await Promise.all([cargarPlanPdm(), cargarCifrasPorSecretaria(), cargarDirectorio()])
    if (!plan.ok || plan.indicadores.length === 0) return new Response('El plan no se pudo leer. Vuelve a intentarlo en unos minutos.', { status: 503, headers: SIN_CACHE })

    const { anioActual } = plan.seguimiento
    const anio = anioDeParametro(url.searchParams.get('anio') ?? undefined, anioActual)
    const medida = url.searchParams.get('medida') === 'reportes' ? 'reportes' : 'cumplimiento'
    const ahora = new Date()
    const datos = datosDelTablero({
      secretaria: plan.indicadores[0].dependencia,
      indicadores: plan.indicadores,
      filasDeCifras,
      filasDeRitmo: null,
      anioActual,
      ahora,
      hoy: hoyBogota(ahora),
      corte: ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }),
    })
    const conIndicadores = new Set(plan.indicadores.flatMap(i => i.asignados.map(a => a.usuarioId)))
    const informe = armarInforme({
      datos,
      indicadores: plan.indicadores,
      personas: dir.personas.filter(p => conIndicadores.has(p.id)),
      personasLeidas: dir.ok,
      anio,
      medida,
      conEquipo: url.searchParams.get('equipo') === '1',
    })

    const [{ renderToBuffer }, React, { InformeDelTablero }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
      import('@/lib/pdm/informe-pdf'),
    ])
    const pdf = await renderToBuffer(React.createElement(InformeDelTablero, { d: informe }) as never)
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreDeArchivoDelInforme(datos.secretaria, anio)}"`,
        ...SIN_CACHE,
      },
    })
  } catch (e) {
    console.error('[pdm/tablero-pdf] no se pudo generar el informe:', e instanceof Error ? e.message : e)
    return new Response('No se pudo generar el informe.', { status: 500, headers: SIN_CACHE })
  }
}
