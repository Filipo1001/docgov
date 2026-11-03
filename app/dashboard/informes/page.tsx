import { requireRole } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { MESES } from '@/lib/constants'
import { SELECT_INFORMES_MES, separarInformesDelMes } from '@/lib/informes-mes'
import InformesClient from './InformesClient'
import type { Periodo } from '@/lib/types'

/**
 * Server component — fetches the current month's informes data server-side so
 * InformesClient starts with real data instead of a loading spinner.
 * - navigating here for the first time: data is in the SSR response, zero wait
 * - returning within staleTime (60 s): TanStack Query uses its cache, zero wait
 * - background refetchInterval (30 s) keeps data fresh after the initial render
 */
export default async function InformesPage() {
  // requireRole validates the session AND returns user info (id, rol, dependencia_id)
  const usuario = await requireRole(['admin', 'supervisor', 'asesor'])

  const now = new Date()
  const mes = MESES[now.getMonth()]
  const anio = now.getFullYear()
  const depId = usuario.rol === 'asesor' ? (usuario.dependencia_id ?? undefined) : undefined
  const ssrTimestamp = Date.now()

  const supabase = await createServerSupabaseClient()

  // UNA consulta del mes y el mismo reparto que usa el cambio de mes (lib/informes-mes.ts): lo que se ve al abrir y lo que se
  // ve al volver a este mes son siempre lo mismo.
  const { data: filas } = await supabase
    .from('periodos')
    .select(SELECT_INFORMES_MES)
    .eq('mes', mes)
    .eq('anio', anio)
    .order('fecha_envio', { ascending: true })

  const { periodos, borradores } = separarInformesDelMes((filas ?? []) as unknown as Periodo[], depId)

  return (
    <InformesClient
      initialPeriodos={periodos}
      initialBorradores={borradores}
      initialMes={mes}
      initialAnio={anio}
      ssrTimestamp={ssrTimestamp}
    />
  )
}
