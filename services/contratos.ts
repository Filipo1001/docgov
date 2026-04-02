/**
 * Service: Contratos
 *
 * All Supabase queries related to contratos and obligaciones.
 * Typed — no `any`.
 */

import { createClient } from '@/lib/supabase'
import type { Contrato, Obligacion, Rol } from '@/lib/types'
import { MESES } from '@/lib/constants'

// ─── Contract list queries ────────────────────────────────────

export async function getContratos(rol: Rol, userId: string): Promise<Contrato[]> {
  const supabase = createClient()

  let query = supabase
    .from('contratos')
    .select(`
      *,
      contratista:usuarios!contratos_contratista_id_fkey(nombre_completo),
      supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo),
      dependencia:dependencias(nombre, abreviatura)
    `)
    .order('created_at', { ascending: false })

  if (rol === 'supervisor') {
    query = query.eq('supervisor_id', userId)
  } else if (rol === 'contratista') {
    query = query.eq('contratista_id', userId)
  }
  // admin: no filter

  const { data } = await query
  return (data as Contrato[]) ?? []
}

export async function getContrato(id: string): Promise<Contrato | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('contratos')
    .select(`
      *,
      contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, email, telefono),
      supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo, cedula),
      dependencia:dependencias(nombre, abreviatura)
    `)
    .eq('id', id)
    .single()
  return (data as Contrato) ?? null
}

// ─── Obligation queries ───────────────────────────────────────

export async function getObligaciones(contratoId: string): Promise<Obligacion[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('obligaciones')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('orden')
  return (data as Obligacion[]) ?? []
}

export async function crearObligacion(params: {
  contratoId: string
  descripcion: string
  orden: number
  esPermanente: boolean
}): Promise<{ error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('obligaciones').insert({
    contrato_id: params.contratoId,
    descripcion: params.descripcion.trim(),
    orden: params.orden,
    es_permanente: params.esPermanente,
  })
  return error ? { error: error.message } : {}
}

export async function eliminarObligacion(oblId: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('obligaciones').delete().eq('id', oblId)
  return error ? { error: error.message } : {}
}

// ─── Period generation ────────────────────────────────────────

export async function generarPeriodos(contrato: Contrato): Promise<{ error?: string }> {
  const supabase = createClient()

  const fechaInicio = new Date(contrato.fecha_inicio + 'T00:00:00')
  const fechaFin    = new Date(contrato.fecha_fin    + 'T00:00:00')

  // Derive number of monthly periods from the actual date range
  const startMonthIdx = fechaInicio.getFullYear() * 12 + fechaInicio.getMonth()
  const endMonthIdx   = fechaFin.getFullYear()    * 12 + fechaFin.getMonth()
  const numMeses      = endMonthIdx - startMonthIdx + 1

  if (numMeses <= 0) return { error: 'Rango de fechas inválido' }

  const periodosNuevos = []

  for (let i = 0; i < numMeses; i++) {
    const fechaMes = new Date(fechaInicio)
    fechaMes.setMonth(fechaInicio.getMonth() + i)

    const mesIndex = fechaMes.getMonth()
    const anio     = fechaMes.getFullYear()

    const inicioP =
      i === 0
        ? contrato.fecha_inicio
        : `${anio}-${String(mesIndex + 1).padStart(2, '0')}-01`

    const ultimoDia = new Date(anio, mesIndex + 1, 0).getDate()
    const finP =
      i === numMeses - 1
        ? contrato.fecha_fin
        : `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${ultimoDia}`

    // Auto-mark as historical if the period is before the current month
    const now = new Date()
    const esPasado =
      anio < now.getFullYear() ||
      (anio === now.getFullYear() && mesIndex < now.getMonth())

    periodosNuevos.push({
      contrato_id: contrato.id,
      numero_periodo: i + 1,
      mes: MESES[mesIndex],
      anio,
      fecha_inicio: inicioP,
      fecha_fin: finP,
      valor_cobro: contrato.valor_mensual,
      estado: 'borrador',
      es_historico: esPasado,
      ...(esPasado && {
        historico_marcado_at: new Date().toISOString(),
        historico_nota: 'Periodo anterior a la digitalización del sistema — marcado automáticamente',
      }),
    })
  }

  const { error } = await supabase.from('periodos').insert(periodosNuevos)
  return error ? { error: error.message } : {}
}
