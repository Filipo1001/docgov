/**
 * Service: Contratos
 *
 * All Supabase queries related to contratos and obligaciones.
 * Typed — no `any`.
 */

import { createClient } from '@/lib/supabase'
import type { Contrato, Obligacion, Rol } from '@/lib/types'
import { MESES } from '@/lib/constants'

// ─── Paginated list (TanStack Query) ──────────────────────────

export interface FiltrosContratos {
  /** Search by N° contrato OR objeto (case-insensitive) */
  q?: string
  dependenciaId?: string
  supervisorId?: string
  /** valor_mensual range (inclusive). 0/Infinity = no bound. */
  rangoMin?: number
  rangoMax?: number
  /** Filter by current vigencia */
  vigencia?: 'todos' | 'vigentes' | 'vencidos'
}

export interface ContratoListItem {
  id: string
  numero: string
  anio: number
  objeto: string
  valor_total: number
  valor_mensual: number
  plazo_meses: number
  fecha_inicio: string
  fecha_fin: string
  contratista: {
    id: string
    nombre_completo: string
    cedula: string | null
    email: string | null
    telefono: string | null
    foto_url: string | null
    firma_url: string | null
    cargo: string | null
    banco: string | null
    tipo_cuenta: string | null
    numero_cuenta: string | null
  } | null
  supervisor: { id: string; nombre_completo: string } | null
  dependencia: { id: string; nombre: string; abreviatura: string } | null
}

export interface PaginaContratos {
  items: ContratoListItem[]
  nextOffset: number | null
  total: number
}

/**
 * Paginated query used by useInfiniteQuery in /dashboard/contratos.
 * All structural filters are applied server-side; "solo incompletos"
 * is a post-filter on the client because it requires checking multiple
 * fields per contractor.
 */
export async function getContratosPagina(params: {
  pageParam?: number
  limit?: number
  rol: Rol
  userId: string
  filtros?: FiltrosContratos
}): Promise<PaginaContratos> {
  const supabase = createClient()
  const pageParam = params.pageParam ?? 0
  const limit = params.limit ?? 30
  const { rol, userId, filtros = {} } = params

  let query = supabase
    .from('contratos')
    .select(
      `
      id, numero, anio, objeto, valor_total, valor_mensual, plazo_meses,
      fecha_inicio, fecha_fin,
      contratista:usuarios!contratos_contratista_id_fkey(
        id, nombre_completo, cedula, email, telefono, foto_url,
        firma_url, cargo, banco, tipo_cuenta, numero_cuenta
      ),
      supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
      dependencia:dependencias(id, nombre, abreviatura)
    `,
      { count: 'exact' },
    )
    .order('numero', { ascending: true })
    .range(pageParam, pageParam + limit - 1)

  // Role scoping
  if (rol === 'supervisor') query = query.eq('supervisor_id', userId)
  else if (rol === 'contratista') query = query.eq('contratista_id', userId)

  // Server-side filters
  if (filtros.dependenciaId) query = query.eq('dependencia_id', filtros.dependenciaId)
  if (filtros.supervisorId) query = query.eq('supervisor_id', filtros.supervisorId)
  if (filtros.rangoMin && filtros.rangoMin > 0) query = query.gte('valor_mensual', filtros.rangoMin)
  if (filtros.rangoMax && Number.isFinite(filtros.rangoMax)) query = query.lte('valor_mensual', filtros.rangoMax)

  const hoy = new Date().toISOString().slice(0, 10)
  if (filtros.vigencia === 'vigentes') query = query.gte('fecha_fin', hoy)
  else if (filtros.vigencia === 'vencidos') query = query.lt('fecha_fin', hoy)

  // Text search — server-side OR on numero/objeto
  if (filtros.q && filtros.q.trim()) {
    const q = filtros.q.trim().replace(/[%,]/g, '') // sanitize
    query = query.or(`numero.ilike.%${q}%,objeto.ilike.%${q}%`)
  }

  const { data, count, error } = await query
  if (error) throw error

  const items = (data ?? []) as unknown as ContratoListItem[]
  const nextOffset = items.length === limit ? pageParam + limit : null

  return { items, nextOffset, total: count ?? 0 }
}

// ─── Contract list queries (legacy, kept for back-compat) ─────

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

/**
 * Calcula la distribución mensual de pagos para un contrato.
 *
 * Reglas:
 *  - Meses intermedios (completos): se pagan por `valor_mensual`.
 *  - Primer mes si inicia después del día 1: proporcional por días activos.
 *      valor = round(valor_mensual * diasActivos / diasDelMes)
 *  - Último mes si termina antes del último día: proporcional por días activos.
 *  - Residuo: el último periodo absorbe la diferencia con `valor_total`
 *    para garantizar sum(valor_cobro) === valor_total sin drift por redondeo.
 *
 * Exportada para permitir previsualización en la UI de creación de contrato.
 */
export function calcularDistribucionPeriodos(params: {
  fechaInicio: string
  fechaFin: string
  valorTotal: number
  valorMensual: number
}): Array<{
  numero: number
  mes: string
  mesIndex: number // 0-11 (para auto-marcar histórico sin lookup)
  anio: number
  fechaInicio: string
  fechaFin: string
  valorCobro: number
  diasActivos: number
  diasDelMes: number
}> {
  const fechaInicio = new Date(params.fechaInicio + 'T00:00:00')
  const fechaFin    = new Date(params.fechaFin    + 'T00:00:00')

  const startMonthIdx = fechaInicio.getFullYear() * 12 + fechaInicio.getMonth()
  const endMonthIdx   = fechaFin.getFullYear()    * 12 + fechaFin.getMonth()
  const numMeses      = endMonthIdx - startMonthIdx + 1
  if (numMeses <= 0) return []

  const resultado: ReturnType<typeof calcularDistribucionPeriodos> = []

  for (let i = 0; i < numMeses; i++) {
    const fechaMes = new Date(fechaInicio)
    fechaMes.setMonth(fechaInicio.getMonth() + i)
    const mesIndex = fechaMes.getMonth()
    const anio     = fechaMes.getFullYear()

    const ultimoDia = new Date(anio, mesIndex + 1, 0).getDate()
    const diaInicio = i === 0 ? fechaInicio.getDate() : 1
    const diaFin    = i === numMeses - 1 ? fechaFin.getDate() : ultimoDia
    const diasActivos = diaFin - diaInicio + 1

    const inicioP = `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${String(diaInicio).padStart(2, '0')}`
    const finP    = `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${String(diaFin).padStart(2, '0')}`

    const esCompleto = diasActivos === ultimoDia
    const valorBruto = esCompleto
      ? params.valorMensual
      : Math.round((params.valorMensual * diasActivos) / ultimoDia)

    resultado.push({
      numero: i + 1,
      mes: MESES[mesIndex],
      mesIndex,
      anio,
      fechaInicio: inicioP,
      fechaFin: finP,
      valorCobro: valorBruto,
      diasActivos,
      diasDelMes: ultimoDia,
    })
  }

  // Ajuste de residuo en el último periodo para que la suma = valor_total
  const suma = resultado.reduce((acc, p) => acc + p.valorCobro, 0)
  const delta = params.valorTotal - suma
  if (delta !== 0 && resultado.length > 0) {
    resultado[resultado.length - 1].valorCobro += delta
  }

  return resultado
}

export async function generarPeriodos(contrato: Contrato): Promise<{ error?: string }> {
  const supabase = createClient()

  const distribucion = calcularDistribucionPeriodos({
    fechaInicio: contrato.fecha_inicio,
    fechaFin: contrato.fecha_fin,
    valorTotal: contrato.valor_total,
    valorMensual: contrato.valor_mensual,
  })

  if (distribucion.length === 0) return { error: 'Rango de fechas inválido' }

  const now = new Date()
  const periodosNuevos = distribucion.map((p) => {
    const esPasado =
      p.anio < now.getFullYear() ||
      (p.anio === now.getFullYear() && p.mesIndex < now.getMonth())

    return {
      contrato_id: contrato.id,
      numero_periodo: p.numero,
      mes: p.mes,
      anio: p.anio,
      fecha_inicio: p.fechaInicio,
      fecha_fin: p.fechaFin,
      valor_cobro: p.valorCobro,
      estado: 'borrador',
      es_historico: esPasado,
      ...(esPasado && {
        historico_marcado_at: new Date().toISOString(),
        historico_nota: 'Periodo anterior a la digitalización del sistema — marcado automáticamente',
      }),
    }
  })

  const { error } = await supabase.from('periodos').insert(periodosNuevos)
  return error ? { error: error.message } : {}
}
