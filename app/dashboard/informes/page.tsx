import { requireRole } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { MESES } from '@/lib/constants'
import { SELECT_INFORMES_MES, separarInformesDelMes, mesDeApertura, mesVecino, pendienteDeRevisar } from '@/lib/informes-mes'
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

  // La hora de Colombia, no la del servidor (UTC): el 30 a las 9 p. m. todavía es el mes en curso aquí.
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const depId = usuario.rol === 'asesor' ? (usuario.dependencia_id ?? undefined) : undefined
  const ssrTimestamp = Date.now()

  const supabase = await createServerSupabaseClient()

  // UNA consulta por mes y el mismo reparto que usa el cambio de mes (lib/informes-mes.ts): lo que se ve al abrir y lo que
  // se ve al volver a ese mes son siempre lo mismo.
  const delMes = async (mesIdx: number, anio: number) => {
    const { data: filas } = await supabase
      .from('periodos')
      .select(SELECT_INFORMES_MES)
      .eq('mes', MESES[mesIdx])
      .eq('anio', anio)
      .order('fecha_envio', { ascending: true })
    return separarInformesDelMes((filas ?? []) as unknown as Periodo[], depId)
  }

  // Abre en el mes anterior si todavía tiene algo por revisar o por radicar para quien mira (ver `mesDeApertura`).
  const previo = mesVecino(now.getMonth(), now.getFullYear(), -1)
  const delAnterior = await delMes(previo.mesIdx, previo.anio)
  const apertura = mesDeApertura(now, delAnterior.periodos.some(pendienteDeRevisar))
  const { periodos, borradores } = apertura.esAnterior ? delAnterior : await delMes(apertura.mesIdx, apertura.anio)
  const mes = MESES[apertura.mesIdx]
  const anio = apertura.anio

  return (
    <InformesClient
      initialPeriodos={periodos}
      initialBorradores={borradores}
      initialMes={mes}
      initialAnio={anio}
      abiertoEnAnterior={apertura.esAnterior}
      ssrTimestamp={ssrTimestamp}
    />
  )
}
