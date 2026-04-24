/**
 * Service: Periodos
 *
 * All Supabase queries related to periodos, actividades, and evidencias.
 */

import { createClient } from '@/lib/supabase'
import type { Periodo, Obligacion, Actividad, Contrato, EstadoPeriodo } from '@/lib/types'
import { MESES } from '@/lib/constants'

// ─── Periodo queries ──────────────────────────────────────────

export async function getPeriodoConContrato(
  periodoId: string,
  contratoId: string
): Promise<{
  contrato: Contrato | null
  periodo: Periodo | null
  obligaciones: Obligacion[]
  actividades: Actividad[]
}> {
  const supabase = createClient()

  const [
    { data: contrato },
    { data: periodo },
    { data: obligaciones },
    { data: actividades },
  ] = await Promise.all([
    supabase
      .from('contratos')
      .select(`
        *,
        contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, email, telefono, cargo, direccion, firma_url),
        supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo, cedula, cargo, firma_url),
        dependencia:dependencias(nombre, abreviatura)
      `)
      .eq('id', contratoId)
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
      .select('*')
      .eq('contrato_id', contratoId)
      .order('orden'),

    supabase
      .from('actividades')
      .select('*, evidencias(*)')
      .eq('periodo_id', periodoId)
      .order('orden'),
  ])

  return {
    contrato: (contrato as Contrato) ?? null,
    periodo: (periodo as Periodo) ?? null,
    obligaciones: (obligaciones as Obligacion[]) ?? [],
    actividades: (actividades as Actividad[]) ?? [],
  }
}

export async function getPeriodosByContrato(contratoId: string): Promise<Periodo[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('periodos')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('numero_periodo')
  return (data as Periodo[]) ?? []
}

// ─── Monthly informes queries ───────────────────────────────

/**
 * Get all periods for a given month/year with contract + contratista info + preaprobaciones.
 * Used by the Informes page for asesores and secretarias.
 */
export async function getInformesMensuales(
  mes: string,
  anio: number,
  dependenciaId?: string
): Promise<Periodo[]> {
  const supabase = createClient()

  let query = supabase
    .from('periodos')
    .select(`
      *,
      contrato:contratos(
        id, numero, objeto, contratista_id, supervisor_id, dependencia_id,
        contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula),
        supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
        dependencia:dependencias(nombre, abreviatura)
      ),
      preaprobaciones(id, asesor_id, created_at, asesor:usuarios!preaprobaciones_asesor_id_fkey(id, nombre_completo))
    `)
    .eq('mes', mes.toUpperCase())
    .eq('anio', anio)
    .order('fecha_envio', { ascending: true })

  const { data } = await query
  let periodos = (data as Periodo[]) ?? []

  // Show submitted+ periods OR historical ones (even if borrador)
  periodos = periodos.filter(p => p.estado !== 'borrador' || p.es_historico === true)

  // Filter by dependencia if specified (for asesores)
  if (dependenciaId) {
    periodos = periodos.filter(p => p.contrato?.dependencia_id === dependenciaId)
  }

  return periodos
}

/**
 * Get borrador periods for a given month/year — "Sin Enviar" view for asesores/secretarias.
 * Returns only active contracts whose period for that month is still in borrador state.
 */
export async function getInformesBorrador(
  mes: string,
  anio: number,
  dependenciaId?: string
): Promise<Periodo[]> {
  const supabase = createClient()

  let query = supabase
    .from('periodos')
    .select(`
      *,
      contrato:contratos(
        id, numero, objeto, contratista_id, supervisor_id, dependencia_id,
        contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula),
        supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
        dependencia:dependencias(nombre, abreviatura)
      ),
      preaprobaciones(id, asesor_id, created_at, asesor:usuarios!preaprobaciones_asesor_id_fkey(id, nombre_completo))
    `)
    .eq('mes', mes.toUpperCase())
    .eq('anio', anio)
    .eq('estado', 'borrador')
    .eq('es_historico', false)
    .order('contrato_id')

  const { data } = await query
  let periodos = (data as Periodo[]) ?? []

  if (dependenciaId) {
    periodos = periodos.filter(p => p.contrato?.dependencia_id === dependenciaId)
  }

  return periodos
}

/**
 * Get all periods for a given month/year including borradores (for contratista view).
 */
export async function getMisInformesMensuales(
  userId: string,
  mes: string,
  anio: number
): Promise<Periodo[]> {
  const supabase = createClient()

  // Get contratista's contract IDs first
  const { data: contratos } = await supabase
    .from('contratos')
    .select('id')
    .eq('contratista_id', userId)

  if (!contratos?.length) return []

  const contratoIds = contratos.map(c => c.id)

  const { data } = await supabase
    .from('periodos')
    .select(`
      *,
      contrato:contratos(
        id, numero, objeto, contratista_id, supervisor_id, dependencia_id,
        dependencia:dependencias(nombre, abreviatura)
      ),
      preaprobaciones(id, asesor_id, created_at, asesor:usuarios!preaprobaciones_asesor_id_fkey(id, nombre_completo))
    `)
    .in('contrato_id', contratoIds)
    .eq('mes', mes.toUpperCase())
    .eq('anio', anio)
    .order('numero_periodo')

  return (data as Periodo[]) ?? []
}

/**
 * Get all periods for a contract to calculate accumulated payments
 * (used by Acta de Pago PDF).
 */
export async function getPeriodosParaPago(contratoId: string): Promise<Periodo[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('periodos')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('numero_periodo')
  return (data as Periodo[]) ?? []
}

// ─── Approval queue queries (legacy — used by aprobaciones page) ─

export async function getPeriodosPendientesParaRol(
  rol: string,
  userId: string
): Promise<Periodo[]> {
  const supabase = createClient()

  // All reviewable periods are in 'enviado' state now
  const estadoFiltro: EstadoPeriodo | EstadoPeriodo[] =
    rol === 'admin' ? 'enviado' : 'enviado'

  if (rol !== 'admin' && rol !== 'supervisor') return []

  let query = supabase
    .from('periodos')
    .select(`
      *,
      contrato:contratos(
        id, numero, objeto, contratista_id, supervisor_id, dependencia_id,
        contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula),
        supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
        dependencia:dependencias(nombre, abreviatura)
      ),
      preaprobaciones(id, asesor_id, created_at, asesor:usuarios!preaprobaciones_asesor_id_fkey(id, nombre_completo))
    `)
    .eq('estado', estadoFiltro)
    .order('fecha_envio', { ascending: true })

  // Supervisor only sees their assigned contracts
  if (rol === 'supervisor') {
    const { data: ids } = await supabase
      .from('contratos')
      .select('id')
      .eq('supervisor_id', userId)
    const contratoIds = ids?.map((c) => c.id) ?? []
    if (contratoIds.length === 0) return []
    query = query.in('contrato_id', contratoIds)
  }

  const { data } = await query
  return (data as Periodo[]) ?? []
}

// ─── Contratistas by dependencia ────────────────────────────

/**
 * Get all contratistas (users) that have contracts in a given dependencia.
 * Used by asesor's "Contratistas" page.
 */
export async function getContratistasPorDependencia(dependenciaId: string): Promise<{
  id: string
  nombre_completo: string
  cedula: string
  email: string
  foto_url?: string | null
  tiene_contrato: boolean
  contrato_activo?: { id: string; numero: string; objeto: string }
}[]> {
  const supabase = createClient()

  // Get all contracts in this dependencia with their contratistas
  const { data: contratos } = await supabase
    .from('contratos')
    .select(`
      id, numero, objeto, contratista_id, activo,
      contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, email, foto_url)
    `)
    .eq('dependencia_id', dependenciaId)
    .order('created_at', { ascending: false })

  if (!contratos?.length) return []

  // Group by contratista (a person may have multiple contracts)
  const map = new Map<string, {
    id: string
    nombre_completo: string
    cedula: string
    email: string
    foto_url?: string | null
    tiene_contrato: boolean
    contrato_activo?: { id: string; numero: string; objeto: string }
  }>()

  for (const c of contratos) {
    const cont = (c as any).contratista
    if (!cont) continue

    if (!map.has(cont.id)) {
      map.set(cont.id, {
        id: cont.id,
        nombre_completo: cont.nombre_completo,
        cedula: cont.cedula,
        email: cont.email,
        foto_url: cont.foto_url ?? null,
        tiene_contrato: c.activo !== false,
        contrato_activo: c.activo !== false ? { id: c.id, numero: c.numero, objeto: c.objeto } : undefined,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))
}

// ─── Actividad mutations ─────────────────────────────────────

export async function crearActividad(params: {
  periodoId: string
  obligacionId: string
  descripcion: string
  cantidad: number
  orden: number
}): Promise<{ error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('actividades').insert({
    periodo_id: params.periodoId,
    obligacion_id: params.obligacionId,
    descripcion: params.descripcion.trim(),
    cantidad: params.cantidad,
    orden: params.orden,
  })
  return error ? { error: error.message } : {}
}

export async function eliminarActividad(actividadId: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('actividades')
    .delete()
    .eq('id', actividadId)
  return error ? { error: error.message } : {}
}
