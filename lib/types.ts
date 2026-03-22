// ─────────────────────────────────────────────
// Core domain types for DocGov
// All Supabase table shapes and role definitions
// ─────────────────────────────────────────────

export type Rol =
  | 'admin'
  | 'supervisor'
  | 'contratista'
  | 'asesor'
  | 'gobierno'
  | 'hacienda'

export type EstadoPeriodo =
  | 'borrador'
  | 'enviado'
  | 'revision_asesor'
  | 'revision_gobierno'
  | 'revision_hacienda'
  | 'aprobado'
  | 'rechazado'
  | 'pagado'

export type TipoCuenta = 'ahorros' | 'corriente'

// ─── Entities ───────────────────────────────

export interface Usuario {
  id: string
  nombre_completo: string
  cedula: string
  email: string
  telefono: string
  rol: Rol
}

export interface Municipio {
  id: string
  nombre: string
}

export interface Dependencia {
  id: string
  nombre: string
  abreviatura: string
}

export interface Contrato {
  id: string
  numero: string
  anio: number
  objeto: string
  modalidad_seleccion: string
  dependencia_id: string
  contratista_id: string
  supervisor_id: string
  valor_total: number
  valor_mensual: number
  valor_letras_total: string
  valor_letras_mensual: string
  plazo_meses: number
  fecha_inicio: string  // ISO date string YYYY-MM-DD
  fecha_fin: string
  banco: string
  tipo_cuenta: TipoCuenta
  numero_cuenta: string
  municipio_id: string
  created_at: string
  // Joined relations (optional — present when selected)
  contratista?: Pick<Usuario, 'id' | 'nombre_completo' | 'cedula' | 'email' | 'telefono'>
  supervisor?: Pick<Usuario, 'id' | 'nombre_completo' | 'cedula'>
  dependencia?: Pick<Dependencia, 'nombre' | 'abreviatura'>
}

export interface Obligacion {
  id: string
  contrato_id: string
  descripcion: string
  orden: number
  es_permanente: boolean
}

export interface Periodo {
  id: string
  contrato_id: string
  numero_periodo: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
  estado: EstadoPeriodo
  fecha_envio: string | null
  motivo_rechazo: string | null
  // Joined
  contrato?: Pick<Contrato, 'id' | 'numero' | 'objeto' | 'contratista_id' | 'supervisor_id'> & {
    contratista?: Pick<Usuario, 'nombre_completo' | 'cedula'>
    supervisor?: Pick<Usuario, 'id' | 'nombre_completo'>
    dependencia?: Pick<Dependencia, 'nombre' | 'abreviatura'>
  }
}

export interface Actividad {
  id: string
  periodo_id: string
  obligacion_id: string
  descripcion: string
  cantidad: number
  orden: number
  // Joined
  evidencias?: Evidencia[]
}

export interface Evidencia {
  id: string
  actividad_id: string
  url: string
  nombre_archivo: string
}

// ─── Action result types ─────────────────────

export interface ActionResult<T = void> {
  data?: T
  error?: string
}
