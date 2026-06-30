import { requireContractAccess } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PeriodoDetalleClient, { type PeriodoHermano } from './PeriodoDetalleClient'
import type { Contrato, Periodo, Obligacion, Actividad, DuplicadoMatch } from '@/lib/types'
import { buscarDuplicados } from '@/lib/duplicados'

/**
 * Server component — runs with full server-side auth (httpOnly cookies).
 *
 * All data is fetched here before the client component mounts, so the page
 * is never blank on browser refresh: the SSR response already contains the
 * contract/period data as serialised props, and PeriodoDetalleClient starts
 * with real data instead of waiting for a client-side fetch that depends on
 * the browser Supabase session being warm.
 */
export default async function PeriodoDetallePage({
  params,
}: {
  params: Promise<{ id: string; periodoId: string }>
}) {
  const { id, periodoId } = await params

  // ── Auth ─────────────────────────────────────────────────────
  // requireContractAccess redirects to /login (no user) or /dashboard
  // (insufficient access) — those redirects are handled by Next.js before
  // any HTML is sent to the browser.
  await requireContractAccess(id)

  // ── Data fetch (server-side, guaranteed authenticated) ───────
  const supabase = await createServerSupabaseClient()

  const [mainData, initialDuplicados] = await Promise.all([
    Promise.all([
      supabase
        .from('contratos')
        .select(`
          *,
          contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, email, telefono, cargo, direccion, firma_url),
          supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo, cedula, cargo, firma_url),
          dependencia:dependencias(nombre, abreviatura)
        `)
        .eq('id', id)
        .single(),

      supabase
        .from('periodos')
        .select(`
          *,
          preaprobaciones(id, asesor_id, created_at, asesor:usuarios!preaprobaciones_asesor_id_fkey(id, nombre_completo)),
          historial_periodos(id, estado_anterior, estado_nuevo, usuario_id, comentario, created_at, usuario:usuarios!historial_periodos_usuario_id_fkey(id, nombre_completo, rol))
        `)
        .eq('id', periodoId)
        .order('created_at', { referencedTable: 'historial_periodos', ascending: true })
        .single(),

      supabase
        .from('obligaciones')
        .select('*, otrosi_id')
        .eq('contrato_id', id)
        .order('orden'),

      supabase
        .from('actividades')
        .select('*, evidencias(*)')
        .eq('periodo_id', periodoId)
        .order('orden'),

      // Todos los periodos del contrato — para detectar repetición de número de
      // planilla (alertas de mes vencido / cotización faltante) en la tarjeta.
      supabase
        .from('periodos')
        .select('id, numero_periodo, mes, numero_planilla, cotizacion_mes')
        .eq('contrato_id', id)
        .order('numero_periodo'),

      supabase
        .from('otrosies')
        .select('id, fecha_inicio')
        .eq('contrato_id', id),

      supabase
        .from('obligacion_revisiones')
        .select('obligacion_id, aprobada, nota')
        .eq('periodo_id', periodoId),
    ]),
    buscarDuplicados(periodoId, id, supabase),
  ])

  const [
    { data: contrato },
    { data: periodo },
    { data: obligacionesRaw },
    { data: actividades },
    { data: periodosHermanos },
    { data: otrosies },
    { data: revisionesRaw },
  ] = mainData

  // Safety: if the period doesn't belong to this contract or data is missing,
  // redirect rather than rendering a broken page.
  if (!contrato || !periodo || periodo.contrato_id !== id) {
    redirect('/dashboard')
  }

  // Filtrar obligaciones vigentes para este período:
  // otrosi_id = null → aplica desde el inicio del contrato.
  // otrosi_id != null → solo aplica si el otrosí inició antes o durante este período.
  const fechaFinPeriodo = (periodo as any).fecha_fin as string
  const otrosiDateMap = new Map(
    (otrosies ?? []).map((o: { id: string; fecha_inicio: string }) => [o.id, o.fecha_inicio])
  )
  const obligaciones = (obligacionesRaw ?? []).filter((obl: any) => {
    if (!obl.otrosi_id) return true
    const fechaOtrosi = otrosiDateMap.get(obl.otrosi_id)
    return !fechaOtrosi || fechaOtrosi <= fechaFinPeriodo
  })

  // Revisión por obligación (✓ + nota). Sin fila → aprobada por defecto, sin nota.
  const initialRevisiones: Record<string, { aprobada: boolean; nota: string | null }> = {}
  for (const r of (revisionesRaw ?? []) as Array<{ obligacion_id: string; aprobada: boolean; nota: string | null }>) {
    initialRevisiones[r.obligacion_id] = { aprobada: r.aprobada, nota: r.nota }
  }

  return (
    // key={periodoId} forces a full remount when navigating between periods
    // so useState initialises fresh from the new props on every SPA navigation.
    <PeriodoDetalleClient
      key={periodoId}
      initialContrato={contrato as unknown as Contrato}
      initialPeriodo={periodo as unknown as Periodo}
      initialObligaciones={(obligaciones ?? []) as unknown as Obligacion[]}
      initialActividades={(actividades ?? []) as unknown as Actividad[]}
      initialRevisiones={initialRevisiones}
      periodosHermanos={(periodosHermanos ?? []) as PeriodoHermano[]}
      initialDuplicados={initialDuplicados as Record<string, DuplicadoMatch[]>}
    />
  )
}
