/**
 * Service: Supervisor
 *
 * Rich data queries for the supervisor dashboard and approval queue.
 * Uses browser Supabase client — import only in 'use client' components.
 */

import { createClient } from '@/lib/supabase'

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
