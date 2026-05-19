/**
 * Service: Supervisor
 *
 * Rich data queries for the supervisor dashboard and approval queue.
 * Uses browser Supabase client — import only in 'use client' components.
 */

import { createClient } from '@/lib/supabase'
import { getMesActual, MESES } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────

export interface PeriodoPendienteSupervisor {
  id: string
  contrato_id: string
  numero_periodo: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
  estado: string
  fecha_envio: string | null
  /** Calendar days since fecha_envio */
  dias_espera: number
  num_actividades: number
  num_evidencias: number
  contrato: {
    id: string
    numero: string
    objeto: string
    valor_total: number
    valor_mensual: number
    contratista: {
      id: string
      nombre_completo: string
      cedula: string
      foto_url?: string | null
      telefono?: string | null
    }
    supervisor: { id: string; nombre_completo: string }
    dependencia: { nombre: string; abreviatura: string }
  }
}

export interface StatsSupervisor {
  totalContratos: number
  porRevisar: number
  aprobadosMes: number
  totalAprobados: number
  valorPendiente: number
}

export interface ContratoSupervisor {
  id: string
  numero: string
  objeto: string
  valor_total: number
  valor_mensual: number
  fecha_inicio: string
  fecha_fin: string
  contratista: {
    id: string
    nombre_completo: string
    cedula: string
    foto_url?: string | null
    telefono?: string | null
  }
  dependencia: { nombre: string; abreviatura: string }
  resumen: {
    total: number
    aprobados: number
    rechazados: number
    pendientes: number
    borrador: number
  }
}

// ─── Colaboradores (people-centric) ──────────────────────────

export interface ColaboradorListItem {
  importado_id: number
  nombre_completo: string
  cedula: string | null
  cargo: string
  secretaria: string | null
  activado: boolean
  usuario_id: string | null
  foto_url: string | null
  tiene_contrato: boolean
  contrato_activo: {
    id: string
    numero: string
    fecha_inicio: string
    fecha_fin: string
    valor_mensual: number
    resumen: { total: number; aprobados: number; pendientes: number }
  } | null
  num_contratos: number
}

export interface PersonaDetalle {
  persona: {
    importado_id: number
    nombre_completo: string
    cedula: string | null
    cargo: string
    secretaria: string | null
    activado: boolean
  }
  usuario: {
    id: string
    nombre_completo: string
    cedula: string
    email: string
    telefono: string | null
    foto_url: string | null
    cargo: string | null
    direccion: string | null
  } | null
  contratos: ContratoConPeriodos[]
}

export interface ContratoConPeriodos {
  id: string
  numero: string
  objeto: string
  valor_total: number
  valor_mensual: number
  fecha_inicio: string
  fecha_fin: string
  plazo_meses: number
  activo: boolean
  dependencia: { nombre: string; abreviatura: string } | null
  periodos: PeriodoColaborador[]
}

export interface PeriodoColaborador {
  id: string
  contrato_id: string
  numero_periodo: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
  estado: string
  fecha_envio: string | null
  motivo_rechazo: string | null
}

// ─── Helpers ─────────────────────────────────────────────────

/** Normalize department name for fuzzy matching (accents, prefixes) */
function normalizeDept(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/secretaria\s+de\s+/gi, '')
    .replace(/secretaria\s+/gi, '')
    .replace(/,.*$/, '') // strip everything after comma
    .trim()
}

function isContratoActivo(inicio: string, fin: string): boolean {
  const now = new Date().toISOString().slice(0, 10)
  return inicio <= now && fin >= now
}

// ─── Queries ──────────────────────────────────────────────────

/** Pending periods (estado = 'enviado') for a supervisor, with rich metadata */
export async function getPeriodosPendientesSupervisor(
  supervisorId: string
): Promise<PeriodoPendienteSupervisor[]> {
  const supabase = createClient()

  const { data: contratos } = await supabase
    .from('contratos')
    .select('id')
    .eq('supervisor_id', supervisorId)

  const ids = contratos?.map((c) => c.id) ?? []
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('periodos')
    .select(`
      id, contrato_id, numero_periodo, mes, anio,
      fecha_inicio, fecha_fin, valor_cobro, estado, fecha_envio,
      contrato:contratos(
        id, numero, objeto, valor_total, valor_mensual,
        contratista:usuarios!contratos_contratista_id_fkey(
          id, nombre_completo, cedula, foto_url, telefono
        ),
        supervisor:usuarios!contratos_supervisor_id_fkey(id, nombre_completo),
        dependencia:dependencias(nombre, abreviatura)
      ),
      actividades(id, evidencias(id))
    `)
    .in('contrato_id', ids)
    .eq('estado', 'enviado')
    .eq('es_historico', false)
    .order('fecha_envio', { ascending: true })

  const now = Date.now()

  return ((data ?? []) as any[]).map((p) => ({
    ...p,
    dias_espera: p.fecha_envio
      ? Math.floor((now - new Date(p.fecha_envio).getTime()) / 86_400_000)
      : 0,
    num_actividades: p.actividades?.length ?? 0,
    num_evidencias:
      p.actividades?.reduce(
        (sum: number, a: any) => sum + (a.evidencias?.length ?? 0),
        0
      ) ?? 0,
  })) as PeriodoPendienteSupervisor[]
}

/** Dashboard stats for supervisor home */
export async function getStatsSupervisor(supervisorId: string): Promise<StatsSupervisor> {
  const supabase = createClient()

  const { data: contratos } = await supabase
    .from('contratos')
    .select('id')
    .eq('supervisor_id', supervisorId)

  const ids = contratos?.map((c) => c.id) ?? []

  if (ids.length === 0) {
    return { totalContratos: 0, porRevisar: 0, aprobadosMes: 0, totalAprobados: 0, valorPendiente: 0 }
  }

  const now = new Date()
  const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { count: porRevisar },
    { count: aprobadosMes },
    { count: totalAprobados },
    { data: pendientesValor },
  ] = await Promise.all([
    supabase
      .from('periodos')
      .select('id', { count: 'exact', head: true })
      .in('contrato_id', ids)
      .eq('estado', 'enviado'),
    supabase
      .from('periodos')
      .select('id', { count: 'exact', head: true })
      .in('contrato_id', ids)
      .eq('estado', 'aprobado')
      .gte('updated_at', inicioMes),
    supabase
      .from('periodos')
      .select('id', { count: 'exact', head: true })
      .in('contrato_id', ids)
      .eq('estado', 'aprobado'),
    supabase
      .from('periodos')
      .select('valor_cobro')
      .in('contrato_id', ids)
      .eq('estado', 'enviado'),
  ])

  return {
    totalContratos: ids.length,
    porRevisar: porRevisar ?? 0,
    aprobadosMes: aprobadosMes ?? 0,
    totalAprobados: totalAprobados ?? 0,
    valorPendiente: pendientesValor?.reduce((s, p) => s + (p.valor_cobro ?? 0), 0) ?? 0,
  }
}

/** All contracts supervised by this user, with period summary */
export async function getContratosSupervisor(supervisorId: string): Promise<ContratoSupervisor[]> {
  const supabase = createClient()

  const { data: contratos } = await supabase
    .from('contratos')
    .select(`
      id, numero, objeto, valor_total, valor_mensual, fecha_inicio, fecha_fin,
      contratista:usuarios!contratos_contratista_id_fkey(
        id, nombre_completo, cedula, foto_url, telefono
      ),
      dependencia:dependencias(nombre, abreviatura),
      periodos(estado)
    `)
    .eq('supervisor_id', supervisorId)
    .order('created_at', { ascending: false })

  return ((contratos ?? []) as any[]).map((c) => {
    const periodos: { estado: string }[] = c.periodos ?? []
    return {
      ...c,
      resumen: {
        total: periodos.length,
        aprobados: periodos.filter((p) => p.estado === 'aprobado').length,
        rechazados: periodos.filter((p) => p.estado === 'rechazado').length,
        pendientes: periodos.filter((p) =>
          ['enviado', 'revision_asesor', 'revision_gobierno', 'revision_hacienda'].includes(p.estado)
        ).length,
        borrador: periodos.filter((p) => p.estado === 'borrador').length,
      },
    } as ContratoSupervisor
  })
}

// ─── Mis Colaboradores (people-centric) ──────────────────────

/**
 * Get ALL contratistas that have contracts supervised by this supervisor.
 * Source of truth: contratos table (supervisor_id = supervisorId).
 * Groups by contratista so a person with 2 contracts appears once.
 */
export async function getColaboradoresSupervisor(
  supervisorId: string
): Promise<ColaboradorListItem[]> {
  const supabase = createClient()

  // Query all contracts for this supervisor with contratista info and periods
  const { data: contratos } = await supabase
    .from('contratos')
    .select(`
      id, numero, contratista_id, valor_mensual, fecha_inicio, fecha_fin,
      contratista:usuarios!contratos_contratista_id_fkey(
        id, nombre_completo, cedula, email, foto_url, cargo
      ),
      dependencia:dependencias(nombre, abreviatura),
      periodos(estado)
    `)
    .eq('supervisor_id', supervisorId)
    .order('created_at', { ascending: false })

  if (!contratos?.length) return []

  const now = new Date().toISOString().slice(0, 10)

  // Group by contratista_id (one person can have multiple contracts)
  const map = new Map<string, ColaboradorListItem>()

  for (const c of contratos as any[]) {
    const cont = c.contratista
    if (!cont) continue

    const isActivo = c.fecha_inicio <= now && c.fecha_fin >= now
    const periodos: { estado: string }[] = c.periodos ?? []

    const existing = map.get(cont.id)

    const contratoInfo = {
      id: c.id,
      numero: c.numero,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      valor_mensual: c.valor_mensual,
      resumen: {
        total: periodos.length,
        aprobados: periodos.filter(p => p.estado === 'aprobado' || p.estado === 'radicado').length,
        pendientes: periodos.filter(p => p.estado === 'enviado').length,
      },
    }

    if (!existing) {
      map.set(cont.id, {
        importado_id: 0, // no longer used from importados
        nombre_completo: cont.nombre_completo,
        cedula: cont.cedula ?? null,
        cargo: cont.cargo ?? '',
        secretaria: (c.dependencia as any)?.nombre ?? null,
        activado: true,
        usuario_id: cont.id,
        foto_url: cont.foto_url ?? null,
        tiene_contrato: true,
        contrato_activo: isActivo ? contratoInfo : null,
        num_contratos: 1,
      })
    } else {
      existing.num_contratos++
      // Prefer active contract
      if (isActivo && !existing.contrato_activo) {
        existing.contrato_activo = contratoInfo
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aPend = a.contrato_activo?.resumen.pendientes ?? 0
    const bPend = b.contrato_activo?.resumen.pendientes ?? 0
    if (aPend > 0 && bPend === 0) return -1
    if (aPend === 0 && bPend > 0) return 1
    return a.nombre_completo.localeCompare(b.nombre_completo)
  })
}

// ─── Supervisor Dashboard ─────────────────────────────────────

export interface MesPerformance {
  mes: string
  anio: number
  estado: string  // 'aprobado' | 'radicado' | 'enviado' | 'revision' | 'rechazado' | 'borrador' | 'sin_periodo'
}

export interface DesempenoContratista {
  contrato_id: string
  contratista_nombre: string
  contrato_numero: string
  valor_mensual: number
  historial: MesPerformance[]  // 5 months, oldest → newest
  consistente: boolean         // >= 4 of 5 months aprobado/radicado
}

export interface TendenciaMes {
  mes: string
  anio: number
  aprobados: number
  rechazados: number
  enviados: number
  total: number
}

export interface ActividadSupervisorItem {
  id: string
  tipo: string
  contratista_nombre: string
  contrato_numero: string
  mes: string
  anio: number
  fecha: string
}

export interface SupervisorDashboard {
  valorBajoGestion: number
  pctCumplimiento: number
  porAprobar: number
  totalContratos: number
  pipeline: {
    sinEnviar: number
    enviado: number
    revision: number
    aprobado: number
    rechazado: number
    total: number
  }
  alertasTardios: Array<{ contrato_id: string; contratista_nombre: string; contrato_numero: string }>
  alertasRechazados: Array<{ periodo_id: string; contrato_id: string; contratista_nombre: string; contrato_numero: string; dias: number }>
  pendientes: PeriodoPendienteSupervisor[]
  desempeno: DesempenoContratista[]
  tendencia: TendenciaMes[]
  actividad: ActividadSupervisorItem[]
}

export async function getSupervisorDashboard(
  supervisorId: string,
): Promise<SupervisorDashboard> {
  const supabase = createClient()
  const now = new Date()
  const hoy = now.toISOString().slice(0, 10)
  const { mes: mesCurrent, anio: anioCurrent } = getMesActual()
  const diasEnMes = now.getDate()

  // Last 5 months (oldest → newest, current last)
  const ultimos5: { mes: string; anio: number }[] = []
  for (let i = 4; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    ultimos5.push({ mes: (MESES as readonly string[])[d.getMonth()], anio: d.getFullYear() })
  }
  const inicioVentana = new Date(now.getFullYear(), now.getMonth() - 4, 1)
    .toISOString()
    .slice(0, 10)

  const empty: SupervisorDashboard = {
    valorBajoGestion: 0, pctCumplimiento: 0, porAprobar: 0, totalContratos: 0,
    pipeline: { sinEnviar: 0, enviado: 0, revision: 0, aprobado: 0, rechazado: 0, total: 0 },
    alertasTardios: [], alertasRechazados: [],
    pendientes: [], desempeno: [], tendencia: [], actividad: [],
  }

  // 1. All contracts for this supervisor
  const { data: contratosData } = await supabase
    .from('contratos')
    .select(`
      id, numero, valor_mensual, fecha_inicio, fecha_fin,
      contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)
    `)
    .eq('supervisor_id', supervisorId)

  const contratos = (contratosData ?? []) as any[]
  const contratoIds = contratos.map(c => c.id)
  if (contratoIds.length === 0) return empty

  const contratosActivos = contratos.filter(c => c.fecha_fin >= hoy)
  const valorBajoGestion = contratosActivos.reduce((s: number, c: any) => s + (c.valor_mensual ?? 0), 0)

  // 2. Parallel queries
  const [periodos5MesesRes, historialRes, pendientes] = await Promise.all([
    supabase
      .from('periodos')
      .select('id, contrato_id, mes, anio, estado, fecha_envio, fecha_inicio')
      .in('contrato_id', contratoIds)
      .eq('es_historico', false)
      .gte('fecha_inicio', inicioVentana)
      .order('fecha_inicio', { ascending: true }),
    supabase
      .from('historial_periodos')
      .select(`
        id, estado_nuevo, created_at,
        periodo:periodos(
          id, mes, anio, contrato_id,
          contrato:contratos(
            numero,
            contratista:usuarios!contratos_contratista_id_fkey(nombre_completo)
          )
        )
      `)
      .in('estado_nuevo', ['enviado', 'aprobado', 'rechazado', 'radicado'])
      .order('created_at', { ascending: false })
      .limit(20),
    getPeriodosPendientesSupervisor(supervisorId),
  ])

  const periodos5Meses = (periodos5MesesRes.data ?? []) as any[]
  const historialRaw = (historialRes.data ?? []) as any[]

  // 3. Pipeline — current month only
  const periodosActuales = periodos5Meses.filter(
    p => p.mes === mesCurrent && p.anio === anioCurrent,
  )
  const estadoPorContrato = new Map<string, string>(
    periodosActuales.map(p => [p.contrato_id, p.estado]),
  )

  const pipeline = { sinEnviar: 0, enviado: 0, revision: 0, aprobado: 0, rechazado: 0, total: contratosActivos.length }
  for (const c of contratosActivos) {
    const e = estadoPorContrato.get(c.id)
    if (!e || e === 'borrador') pipeline.sinEnviar++
    else if (e === 'enviado') pipeline.enviado++
    else if (e === 'revision') pipeline.revision++
    else if (e === 'aprobado' || e === 'radicado') pipeline.aprobado++
    else if (e === 'rechazado') pipeline.rechazado++
  }

  const pctCumplimiento = pipeline.total > 0
    ? Math.round((pipeline.aprobado / pipeline.total) * 100)
    : 0

  // 4. Alerts
  const alertasTardios = diasEnMes >= 8
    ? contratosActivos
        .filter(c => { const e = estadoPorContrato.get(c.id); return !e || e === 'borrador' })
        .slice(0, 10)
        .map(c => ({
          contrato_id: c.id,
          contratista_nombre: c.contratista?.nombre_completo ?? '',
          contrato_numero: c.numero,
        }))
    : []

  const alertasRechazados = periodosActuales
    .filter(p => p.estado === 'rechazado')
    .map(p => {
      const c = contratos.find((x: any) => x.id === p.contrato_id)
      return {
        periodo_id: p.id,
        contrato_id: p.contrato_id,
        contratista_nombre: c?.contratista?.nombre_completo ?? '',
        contrato_numero: c?.numero ?? '',
        dias: p.fecha_envio
          ? Math.floor((Date.now() - new Date(p.fecha_envio).getTime()) / 86_400_000)
          : 0,
      }
    })

  // 5. Performance per contractor (active contracts, last 5 months)
  const periodosPorContrato = new Map<string, any[]>()
  for (const p of periodos5Meses) {
    const list = periodosPorContrato.get(p.contrato_id) ?? []
    list.push(p)
    periodosPorContrato.set(p.contrato_id, list)
  }

  const desempeno: DesempenoContratista[] = contratosActivos.map(c => {
    const periods = periodosPorContrato.get(c.id) ?? []
    const byMes = new Map<string, string>(periods.map((p: any) => [`${p.mes}-${p.anio}`, p.estado]))
    const historial: MesPerformance[] = ultimos5.map(({ mes, anio }) => ({
      mes,
      anio,
      estado: byMes.get(`${mes}-${anio}`) ?? 'sin_periodo',
    }))
    const aprobCount = historial.filter(h => h.estado === 'aprobado' || h.estado === 'radicado').length
    return {
      contrato_id: c.id,
      contratista_nombre: c.contratista?.nombre_completo ?? '',
      contrato_numero: c.numero,
      valor_mensual: c.valor_mensual ?? 0,
      historial,
      consistente: aprobCount >= 4,
    }
  })
  desempeno.sort((a, b) => (a.consistente === b.consistente ? 0 : a.consistente ? -1 : 1))

  // 6. Monthly trend
  const tendencia: TendenciaMes[] = ultimos5.map(({ mes, anio }) => {
    const mesIdx = (MESES as readonly string[]).findIndex(m => m === mes)
    const mesStr = new Date(anio, mesIdx, 1).toISOString().slice(0, 10)
    const activosMes = contratos.filter(
      (c: any) => c.fecha_inicio <= mesStr && c.fecha_fin >= mesStr,
    ).length
    const mPeriods = periodos5Meses.filter((p: any) => p.mes === mes && p.anio === anio)
    return {
      mes, anio,
      aprobados: mPeriods.filter((p: any) => p.estado === 'aprobado' || p.estado === 'radicado').length,
      rechazados: mPeriods.filter((p: any) => p.estado === 'rechazado').length,
      enviados: mPeriods.filter((p: any) => p.estado === 'enviado').length,
      total: Math.max(activosMes, mPeriods.length, 1),
    }
  })

  // 7. Recent activity (filter to supervisor's contracts)
  const actividad: ActividadSupervisorItem[] = historialRaw
    .filter(h => {
      const p = h.periodo
      if (!p?.contrato) return false
      return contratoIds.includes(p.contrato_id)
    })
    .slice(0, 8)
    .map(h => {
      const p = h.periodo
      const c = p.contrato
      return {
        id: h.id,
        tipo: h.estado_nuevo,
        contratista_nombre: c.contratista?.nombre_completo ?? '',
        contrato_numero: c.numero,
        mes: p.mes,
        anio: p.anio,
        fecha: h.created_at,
      }
    })

  return {
    valorBajoGestion,
    pctCumplimiento,
    porAprobar: pipeline.enviado,
    totalContratos: contratos.length,
    pipeline,
    alertasTardios,
    alertasRechazados,
    pendientes,
    desempeno,
    tendencia,
    actividad,
  }
}

// ─────────────────────────────────────────────────────────────

/**
 * Full detail for a person: info + all contracts + periods.
 * Uses usuario_id directly (no longer depends on contratistas_importados).
 */
export async function getPersonaDetalle(
  usuarioId: string,
  supervisorId: string
): Promise<PersonaDetalle | null> {
  const supabase = createClient()

  // 1. Get user profile
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre_completo, cedula, email, telefono, foto_url, cargo, direccion')
    .eq('id', usuarioId)
    .single()

  if (!usuario) return null

  // 2. Get all contracts for this person supervised by this supervisor
  const { data: contratos } = await supabase
    .from('contratos')
    .select(`
      id, numero, objeto, valor_total, valor_mensual,
      fecha_inicio, fecha_fin, plazo_meses,
      dependencia:dependencias(nombre, abreviatura),
      periodos(id, contrato_id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado, fecha_envio, motivo_rechazo)
    `)
    .eq('contratista_id', usuarioId)
    .eq('supervisor_id', supervisorId)
    .order('fecha_inicio', { ascending: false })

  return {
    persona: {
      importado_id: 0,
      nombre_completo: usuario.nombre_completo,
      cedula: usuario.cedula,
      cargo: usuario.cargo ?? '',
      secretaria: null,
      activado: true,
    },
    usuario,
    contratos: (contratos ?? []).map((c: any) => ({
      id: c.id,
      numero: c.numero,
      objeto: c.objeto,
      valor_total: c.valor_total,
      valor_mensual: c.valor_mensual,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      plazo_meses: c.plazo_meses,
      activo: isContratoActivo(c.fecha_inicio, c.fecha_fin),
      dependencia: c.dependencia as any,
      periodos: ((c.periodos ?? []) as PeriodoColaborador[]).sort(
        (a: any, b: any) => a.numero_periodo - b.numero_periodo
      ),
    })),
  }
}
