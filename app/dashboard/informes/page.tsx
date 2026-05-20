import { requireRole } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { MESES } from '@/lib/constants'
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

  const selectPeriodos = `
    *,
    contrato:contratos(
      id, numero, objeto, contratista_id, supervisor_id, dependencia_id,
      contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula),
      supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
      dependencia:dependencias(nombre, abreviatura)
    ),
    preaprobaciones(id, asesor_id, created_at, asesor:usuarios!preaprobaciones_asesor_id_fkey(id, nombre_completo))
  `

  const [{ data: rawPeriodos }, { data: rawBorradores }] = await Promise.all([
    supabase
      .from('periodos')
      .select(selectPeriodos)
      .eq('mes', mes)
      .eq('anio', anio)
      .order('fecha_envio', { ascending: true }),

    supabase
      .from('periodos')
      .select(selectPeriodos)
      .eq('mes', mes)
      .eq('anio', anio)
      .eq('estado', 'borrador')
      .eq('es_historico', false)
      .order('contrato_id'),
  ])

  let periodos = ((rawPeriodos ?? []) as Periodo[]).filter(
    p => p.estado !== 'borrador' || p.es_historico === true,
  )
  let borradores = (rawBorradores ?? []) as Periodo[]

  if (depId) {
    periodos  = periodos .filter(p => p.contrato?.dependencia_id === depId)
    borradores = borradores.filter(p => p.contrato?.dependencia_id === depId)
  }

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
