import { requireContractAccess } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PeriodoDetalleClient, { type PeriodoHermano } from './PeriodoDetalleClient'
import type { Contrato, Periodo, Obligacion, Actividad, DuplicadoMatch, EvidenciaParaBackfill } from '@/lib/types'
import { buscarDuplicados } from '@/lib/duplicados'
import { firmarUrls, firmarUrlsMiniatura, firmarUrl, UMBRAL_MINIATURA_BYTES } from '@/lib/storage-firmado'
import type { AdjuntoDTO } from '@/app/actions/adjuntos'

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
          contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, email, telefono, cargo, direccion, firma_url, obligado_facturar_electronicamente),
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

  // Adjuntos PDF agrupados por actividad — se muestran junto a las imágenes en
  // la evidencia de cada obligación. Se firman aquí (bucket privado) para que el
  // visor integrado pueda leerlos sin una ida y vuelta adicional.
  const { data: adjuntosRaw } = await supabase
    .from('documentos_adjuntos')
    .select('id, nombre_original, bytes, paginas, orden, estado, verificacion_nota, created_at, actividad_id, storage_path')
    .eq('entidad_tipo', 'periodo')
    .eq('entidad_id', periodoId)
    .is('eliminado_at', null)
    .order('orden', { ascending: true })

  const initialAdjuntos: Record<string, AdjuntoDTO[]> = {}
  for (const a of (adjuntosRaw ?? []) as Array<AdjuntoDTO & { storage_path: string }>) {
    if (!a.actividad_id) continue
    const { storage_path, ...resto } = a
    const urlFirmada = (await firmarUrl('adjuntos', storage_path)) ?? undefined
      ; (initialAdjuntos[a.actividad_id] ??= []).push({ ...resto, urlFirmada })
  }

  // ¿Existe ya la certificación de retención para (contrato, año gravable)?
  // Solo se muestra su tarjeta de descarga en el PRIMER periodo del contrato.
  const { data: certRow } = await supabase
    .from('certificaciones_retencion')
    .select('id')
    .eq('contrato_id', id)
    .eq('anio_gravable', (periodo as { anio: number }).anio)
    .maybeSingle()
  const certDisponible = !!certRow

  // Acta de terminación: única por contrato. Su descarga se ofrece solo en el
  // último periodo y solo si ya fue aceptada.
  // Solo cuenta si ya está EMITIDA: aceptada sin aprobar todavía no es un
  // documento descargable.
  const { data: actaRow } = await supabase
    .from('actas_terminacion')
    .select('id, emitida_en')
    .eq('contrato_id', (contrato as { id: string }).id)
    .maybeSingle()
  const actaTerminacionDisponible = !!actaRow?.emitida_en

  // ── Signed URLs (private buckets) ──────────────────────────────
  // The DB stores canonical public-form URLs; the buckets are private, so we
  // convert everything the client will render into signed URLs here.
  const duplicadosResult = initialDuplicados as { matches: Record<string, DuplicadoMatch[]>; paraBackfill: EvidenciaParaBackfill[] }
  // Grid-rendered evidencias (thumbnails) vs. backfill-only URLs (never shown,
  // only read pixel-by-pixel for pHash) — kept separate so only the former
  // pays for thumbnail transforms.
  const evidenciasGrid = (actividades ?? []).flatMap(
    (a: { evidencias?: { url: string; bytes?: number | null }[] }) => a.evidencias ?? []
  )
  const urlsEvidenciasGrid = evidenciasGrid.map(e => e.url)

  // Solo las fotos pesadas justifican una miniatura transformada: se facturan
  // por imagen distinta y las evidencias ya llegan comprimidas del cliente
  // (mediana 92 KB). Ver UMBRAL_MINIATURA_BYTES.
  //
  // `bytes` nulo —una fila anterior al backfill— se trata como pequeña: el
  // cliente resuelve `miniatura ?? firmada ?? url`, así que lo peor que pasa
  // es que se sirva la imagen completa. Nunca queda una imagen rota.
  const urlsParaMiniatura = evidenciasGrid
    .filter(e => (e.bytes ?? 0) > UMBRAL_MINIATURA_BYTES)
    .map(e => e.url)
  const urlsParaBackfill = (duplicadosResult.paraBackfill ?? []).map(e => e.url)
  const [firmadasEvidencias, firmadasDocumentos, miniaturasEvidencias] = await Promise.all([
    // Full-resolution: ONE storage API call regardless of image count
    // (createSignedUrls). Used by the lightbox and the pHash backfill.
    firmarUrls('evidencias', [...urlsEvidenciasGrid, ...urlsParaBackfill]),
    firmarUrls('documentos', [
      (periodo as { planilla_ss_url?: string | null }).planilla_ss_url,
      (periodo as { factura_electronica_url?: string | null }).factura_electronica_url,
    ]),
    // 160×160 para la grilla, solo en las fotos que superan el umbral. En la
    // gran mayoría de periodos esta lista va vacía y no se hace ni una llamada.
    firmarUrlsMiniatura('evidencias', urlsParaMiniatura, { width: 160, height: 160, resize: 'cover', quality: 70 }),
  ])
  const initialUrlsFirmadas: Record<string, string> = { ...firmadasEvidencias, ...firmadasDocumentos }

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
      certDisponible={certDisponible}
      actaTerminacionDisponible={actaTerminacionDisponible}
      periodosHermanos={(periodosHermanos ?? []) as PeriodoHermano[]}
      initialDuplicados={duplicadosResult.matches ?? {}}
      initialParaBackfill={duplicadosResult.paraBackfill ?? []}
      initialUrlsFirmadas={initialUrlsFirmadas}
      initialUrlsMiniatura={miniaturasEvidencias}
      initialAdjuntos={initialAdjuntos}
    />
  )
}
