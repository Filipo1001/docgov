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
