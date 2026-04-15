// ─────────────────────────────────────────────
// Core domain types for DocGov
// ─────────────────────────────────────────────

export type Rol =
  | 'admin'
  | 'supervisor'   // Secretaria (Sara, Yorledy, Lucas, Ivan)
  | 'contratista'
  | 'asesor'       // Daniel Marín, Karen

export type EstadoPeriodo =
  | 'borrador'          // Contratista editing
  | 'enviado'           // Submitted — visible to asesores & secretaria
  | 'revision'          // Asesor has reviewed — waiting for secretary final approval
  | 'aprobado'          // Secretary approved → downloadable package
  | 'radicado'          // Physically filed (radicado)
  | 'rechazado'         // Rejected → back to contratista for edits

export type TipoCuenta = 'ahorros' | 'corriente'

// ─── Entities ───────────────────────────────

export interface Usuario {
  id: string
  nombre_completo: string
  cedula: string
  email: string
  telefono: string
  rol: Rol
  cargo?: string
  direccion?: string
  firma_url?: string  // URL to signature image
  foto_url?: string
  dependencia_id?: string
  dependencia?: Pick<Dependencia, 'nombre' | 'abreviatura'>
  banco?: string | null
  tipo_cuenta?: string | null
  numero_cuenta?: string | null
}

export interface Preaprobacion {
  id: string
  periodo_id: string
  asesor_id: string
  created_at: string
  // Joined
  asesor?: Pick<Usuario, 'id' | 'nombre_completo'>
}

export interface HistorialPeriodo {
  id: string
  periodo_id: string
  estado_anterior: EstadoPeriodo | null
  estado_nuevo: EstadoPeriodo | null
  usuario_id: string
  comentario: string | null
  created_at: string
  usuario?: { id: string; nombre_completo: string; rol?: string }
}

export interface Notificacion {
  id: string
  usuario_id: string
  tipo: string
  titulo: string
  mensaje: string | null
  leida: boolean
  periodo_id: string | null
  created_at: string
  periodo?: {
    id: string
    mes: string
    anio: number
    contrato?: { numero: string }
  }
}

export interface Municipio {
  id: string
  nombre: string
  departamento?: string
  nit?: string
  representante_legal?: string
  cedula_representante?: string
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
  plazo_meses: number   // kept for backwards compat (PDF generation)
  plazo_dias: number    // primary field — actual days from contract
  fecha_inicio: string  // ISO date YYYY-MM-DD
  fecha_fin: string
  banco: string
  tipo_cuenta: TipoCuenta
  numero_cuenta: string
  municipio_id: string
  cdp?: string          // Certificado de Disponibilidad Presupuestal
  crp?: string          // Certificado de Registro Presupuestal
  created_at: string
  // Joined relations (optional)
  contratista?: Pick<Usuario, 'id' | 'nombre_completo' | 'cedula' | 'email' | 'telefono' | 'cargo' | 'direccion' | 'firma_url'>
  supervisor?: Pick<Usuario, 'id' | 'nombre_completo' | 'cedula' | 'cargo' | 'firma_url'>
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
  planilla_ss_url: string | null    // Uploaded security social PDF
  numero_planilla: string | null     // Planilla number
  numero_radicado: string | null     // Radicado number assigned on filing
  // Joined
  contrato?: Pick<Contrato, 'id' | 'numero' | 'objeto' | 'contratista_id' | 'supervisor_id' | 'dependencia_id'> & {
    contratista?: Pick<Usuario, 'id' | 'nombre_completo' | 'cedula'>
    supervisor?: Pick<Usuario, 'id' | 'nombre_completo'>
    dependencia?: Pick<Dependencia, 'nombre' | 'abreviatura'>
  }
  planilla_estado?: 'pendiente' | 'aprobada' | 'rechazada' | null
  planilla_comentario?: string | null
  // Pre-approvals (joined)
  preaprobaciones?: Preaprobacion[]
  historial?: HistorialPeriodo[]
  // Historical immutability
  es_historico: boolean
  historico_marcado_por: string | null
  historico_marcado_at: string | null
  historico_nota: string | null
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
