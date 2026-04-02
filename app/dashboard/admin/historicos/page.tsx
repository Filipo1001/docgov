import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import HistoricosClient from './HistoricosClient'
import type { Periodo } from '@/lib/types'

export default async function HistoricosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: me } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (me?.rol !== 'admin') redirect('/dashboard')

  const adminClient = createAdminSupabaseClient()

  // Candidatos: not yet historical, any state, ordered chronologically
  const { data: candidatosRaw } = await adminClient
    .from('periodos')
    .select(`
      *,
      contrato:contratos(
        id, numero, objeto,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula),
        dependencia:dependencias(nombre, abreviatura)
      )
    `)
    .eq('es_historico', false)
    .order('anio', { ascending: true })
    .order('mes', { ascending: true })

  // Ya marcados: already historical, ordered by when they were classified
  const { data: yaHistoricosRaw } = await adminClient
    .from('periodos')
    .select(`
      *,
      contrato:contratos(
        id, numero, objeto,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula),
        dependencia:dependencias(nombre, abreviatura)
      ),
      marcadoPor:usuarios!periodos_historico_marcado_por_fkey(nombre_completo)
    `)
    .eq('es_historico', true)
    .order('historico_marcado_at', { ascending: false })

  return (
    <HistoricosClient
      candidatos={(candidatosRaw as unknown as Periodo[]) ?? []}
      yaHistoricos={(yaHistoricosRaw as unknown as Periodo[]) ?? []}
    />
  )
}
