import { requireContractAccess } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PeriodoDetalleClient from './PeriodoDetalleClient'

export default async function PeriodoDetallePage({
  params,
}: {
  params: Promise<{ id: string; periodoId: string }>
}) {
  const { id, periodoId } = await params

  // Verify the periodo belongs to this contract
  const supabase = await createServerSupabaseClient()
  const { data: periodo } = await supabase
    .from('periodos')
    .select('contrato_id')
    .eq('id', periodoId)
    .single()

  if (!periodo || periodo.contrato_id !== id) {
    redirect('/dashboard')
  }

  await requireContractAccess(id)
  return <PeriodoDetalleClient />
}
