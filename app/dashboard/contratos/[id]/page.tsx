import { requireContractAccess } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ContratoDetalleClient from './ContratoDetalleClient'
import { listarDocumentosContrato } from '@/app/actions/documentos-contrato'

/**
 * Server component — fetches all contract data with server-side auth
 * so ContratoDetalleClient starts with real data on browser refresh.
 */
export default async function ContratoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  await requireContractAccess(id)

  const supabase = await createServerSupabaseClient()

  const [{ data: contrato }, { data: obligaciones }, { data: periodos }, documentos] = await Promise.all([
    supabase
      .from('contratos')
      .select(`
        *,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula, email, telefono, obligado_facturar_electronicamente),
        supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, cedula),
        dependencia:dependencias(nombre, abreviatura)
      `)
      .eq('id', id)
      .single(),

    supabase
      .from('obligaciones')
      .select('*')
      .eq('contrato_id', id)
      .order('orden'),

    supabase
      .from('periodos')
      .select('*')
      .eq('contrato_id', id)
      .order('numero_periodo'),

    // Expediente documental — RLS decide la visibilidad según el rol.
    listarDocumentosContrato(id),
  ])

  if (!contrato) redirect('/dashboard/contratos')

  return (
    // key={id} ensures fresh state when navigating between contracts
    <ContratoDetalleClient
      key={id}
      initialContrato={contrato}
      initialObligaciones={obligaciones ?? []}
      initialPeriodos={periodos ?? []}
      initialDocumentos={documentos}
    />
  )
}
