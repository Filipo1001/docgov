/**
 * Service: Contratista Dashboard
 *
 * Rich data queries for the contratista home dashboard.
 * Cliente inyectable: por defecto usa el browser client ('use client');
 * las server actions del panel (app/actions/dashboard.ts) inyectan el del
 * servidor para sacar la capa de auth del navegador de la ruta crítica.
 */

import { createClient } from '@/lib/supabase'

/**
 * Cliente inyectable: por defecto el del navegador (pantallas 'use client');
 * las server actions del panel inyectan el del servidor, que comparte esta
 * misma forma estructural.
 */
type ClienteSupabase = ReturnType<typeof createClient>
import { MESES } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────

export interface ContratoContratista {
  id: string
  numero: string
  anio: number
  objeto: string
  valor_total: number
  valor_mensual: number
  fecha_inicio: string
  fecha_fin: string
  plazo_meses: number
  dependencia: { nombre: string; abreviatura: string } | null
  supervisor: { nombre_completo: string } | null
}

export interface PeriodoResumen {
  id: string
  contrato_id: string
  numero_periodo: number
  mes: string
  anio: number
  estado: string
  valor_cobro: number
  motivo_rechazo: string | null
  fecha_envio: string | null
  es_historico: boolean
  /** Para acotar qué obligaciones estaban vigentes en este periodo. */
  fecha_fin: string | null
  planilla_estado: string | null
  planilla_comentario: string | null
}

/** Una obligación que la revisión mandó corregir, con lo que pidió. */
export interface CorreccionPendiente {
  obligacionId: string
  /** La MISMA posición que lleva en el acordeón de la página del periodo. */
  numero: number
  descripcion: string
  nota: string
}

/**
 * Por qué volvió el informe del mes, para el panel de inicio.
 *
 * Solo se consulta cuando el periodo del mes está devuelto: en cualquier otro
 * estado el panel no pide nada de esto.
 */
export interface DevolucionPendiente {
  /**
   * Quién lo devolvió y cuándo, leído de `historial_periodos`.
   *
   * No de `periodos.fecha_rechazo`: esa columna está vacía en los 739
   * periodos de producción — nunca se escribió. Usarla habría dado un «hace
   * un momento» permanente en cada tarjeta.
   */
  porNombre: string | null
  porRol: string | null
  fecha: string | null
  motivoGeneral: string | null
  correcciones: CorreccionPendiente[]
  planillaDevuelta: boolean
  planillaComentario: string | null
}

export interface DashboardContratista {
  contrato: ContratoContratista | null
  periodos: PeriodoResumen[]
  periodoActual: PeriodoResumen | null
  /** Solo cuando `periodoActual` está devuelto; si no, null. */
  devolucion: DevolucionPendiente | null
  progreso: {
    diasTranscurridos: number
    diasTotales: number
    porcentaje: number
    diasRestantes: number
    fechaFin: string
  } | null
  stats: {
    totalPeriodos: number
    aprobados: number
    pendientes: number
    rechazados: number
    porCompletar: number
  }
}

// ─── Query ────────────────────────────────────────────────────

export async function getDashboardContratista(
  userId: string,
  // El panel corre server-side (ver app/actions/dashboard.ts): el cliente del
  // navegador puede quedar con su capa de auth colgada tras reanudar y esta
  // pantalla era la única que dependía de él. Inyectable para no duplicar la query.
  cliente?: ClienteSupabase,
): Promise<DashboardContratista> {
  const supabase = cliente ?? createClient()

  // 1. Get active contract(s) for this user
  //
  // Los errores se LANZAN, no se tragan. Descartarlos convertía cualquier
  // fallo (token vencido al volver de segundo plano, red caída) en un
  // dashboard "sin contrato" cacheado como éxito. Con throw, TanStack
  // conserva los datos anteriores, marca el error y reintenta — la pantalla
  // degrada a "lo último que se supo" en lugar de mentir con un vacío.
  const now = new Date().toISOString().slice(0, 10)
  const { data: contratos, error: errContratos } = await supabase
    .from('contratos')
    .select(`
      id, numero, anio, objeto, valor_total, valor_mensual,
      fecha_inicio, fecha_fin, plazo_meses,
      dependencia:dependencias(nombre, abreviatura),
      supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo)
    `)
    .eq('contratista_id', userId)
    .order('fecha_inicio', { ascending: false })
  if (errContratos) throw errContratos

  // Prefer active contract, else most recent
  const activo = (contratos ?? []).find(
    (c: any) => c.fecha_inicio <= now && c.fecha_fin >= now
  ) ?? (contratos ?? [])[0]

  if (!activo) {
    return {
      contrato: null,
      periodos: [],
      periodoActual: null,
      devolucion: null,
      progreso: null,
      stats: { totalPeriodos: 0, aprobados: 0, pendientes: 0, rechazados: 0, porCompletar: 0 },
    }
  }

  const contrato = activo as any as ContratoContratista

  // 2. Get all periods for this contract
  const { data: periodosRaw, error: errPeriodos } = await supabase
    .from('periodos')
    .select('id, contrato_id, numero_periodo, mes, anio, estado, valor_cobro, motivo_rechazo, fecha_envio, es_historico, fecha_fin, planilla_estado, planilla_comentario')
    .eq('contrato_id', contrato.id)
    .order('numero_periodo')
  if (errPeriodos) throw errPeriodos

  const periodos: PeriodoResumen[] = (periodosRaw ?? []) as any[]

  // 3. Find current month's period (case-insensitive — DB stores 'ABRIL', MESES has 'Abril')
  const mesActual = MESES[new Date().getMonth()].toUpperCase()
  const anioActual = new Date().getFullYear()

  const periodoActual = periodos.find(
    p => p.mes.toUpperCase() === mesActual && p.anio === anioActual
  ) ?? null

  // 4. Calculate contract progress
  let progreso: DashboardContratista['progreso'] = null
  if (contrato.fecha_inicio && contrato.fecha_fin) {
    const inicio = new Date(contrato.fecha_inicio).getTime()
    const fin = new Date(contrato.fecha_fin).getTime()
    const hoy = Date.now()
    const diasTotales = Math.round((fin - inicio) / 86_400_000)
    const diasTranscurridos = Math.max(0, Math.min(diasTotales, Math.round((hoy - inicio) / 86_400_000)))
    const porcentaje = diasTotales > 0 ? Math.round((diasTranscurridos / diasTotales) * 100) : 0

    progreso = {
      diasTranscurridos,
      diasTotales,
      porcentaje: Math.min(100, porcentaje),
      diasRestantes: Math.max(0, diasTotales - diasTranscurridos),
      fechaFin: contrato.fecha_fin,
    }
  }

  // 5. Por qué volvió el informe del mes — solo si volvió.
  //
  // Antes la tarjeta del panel enseñaba el motivo general y nada más, así que
  // una devolución hecha marcando obligaciones (hoy el caso normal: el motivo
  // general es opcional desde que existen los tres veredictos) llegaba como un
  // recuadro rojo sin una sola palabra sobre qué corregir.
  let devolucion: DevolucionPendiente | null = null
  if (periodoActual?.estado === 'rechazado') {
    const [
      { data: revisionesRaw },
      { data: obligacionesRaw },
      { data: otrosiesRaw },
      { data: eventoRaw },
    ] = await Promise.all([
      supabase
        .from('obligacion_revisiones')
        .select('obligacion_id, aprobada, nota, revisado_at')
        .eq('periodo_id', periodoActual.id),
      supabase
        .from('obligaciones')
        .select('id, descripcion, orden, otrosi_id')
        .eq('contrato_id', contrato.id)
        .order('orden'),
      supabase
        .from('otrosies')
        .select('id, fecha_inicio')
        .eq('contrato_id', contrato.id),
      supabase
        .from('historial_periodos')
        .select('created_at, usuario:usuarios!historial_periodos_usuario_id_fkey(nombre_completo, rol)')
        .eq('periodo_id', periodoActual.id)
        .eq('estado_nuevo', 'rechazado')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // Mismo recorte que la página del periodo: una obligación que llegó por
    // otrosí no existía en los periodos anteriores a ese otrosí, y numerarla
    // aquí correría la cuenta respecto al acordeón.
    const fechaOtrosi = new Map(
      ((otrosiesRaw ?? []) as { id: string; fecha_inicio: string }[]).map(o => [o.id, o.fecha_inicio]),
    )
    const vigentes = ((obligacionesRaw ?? []) as any[]).filter(obl => {
      if (!obl.otrosi_id) return true
      const desde = fechaOtrosi.get(obl.otrosi_id)
      return !desde || !periodoActual.fecha_fin || desde <= periodoActual.fecha_fin
    })

    const porObligacion = new Map(
      ((revisionesRaw ?? []) as any[]).map(r => [r.obligacion_id, r]),
    )

    // «Vigente» = revisada DESPUÉS del envío actual. Una marca del ciclo
    // anterior dice qué se pidió entonces, no qué está pendiente ahora.
    const vigenteAhora = (r: any): boolean => {
      if (!r) return false
      if (!periodoActual.fecha_envio) return true
      if (!r.revisado_at) return true
      return new Date(r.revisado_at) >= new Date(periodoActual.fecha_envio)
    }

    const correcciones: CorreccionPendiente[] = vigentes.flatMap((obl, i) => {
      const r = porObligacion.get(obl.id)
      if (!vigenteAhora(r) || r.aprobada !== false) return []
      return [{
        obligacionId: obl.id,
        numero: i + 1,
        descripcion: obl.descripcion as string,
        nota: (r.nota ?? '').trim(),
      }]
    })

    const evento = eventoRaw as any
    devolucion = {
      porNombre: evento?.usuario?.nombre_completo ?? null,
      porRol: evento?.usuario?.rol ?? null,
      fecha: evento?.created_at ?? null,
      motivoGeneral: periodoActual.motivo_rechazo?.trim() || null,
      correcciones,
      planillaDevuelta: periodoActual.planilla_estado === 'rechazada',
      planillaComentario: periodoActual.planilla_comentario?.trim() || null,
    }
  }

  // 6. Stats
  const stats = {
    totalPeriodos: periodos.length,
    aprobados: periodos.filter(p => p.estado === 'aprobado' || p.estado === 'radicado').length,
    pendientes: periodos.filter(p => ['enviado', 'revision'].includes(p.estado)).length,
    rechazados: periodos.filter(p => p.estado === 'rechazado').length,
    porCompletar: periodos.filter(p => p.estado === 'borrador').length,
  }

  return { contrato, periodos, periodoActual, devolucion, progreso, stats }
}
