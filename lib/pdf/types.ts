// Data shapes consumed by all PDF templates.
// Assembled once by the API route, passed into the component.

export interface PDFMunicipio {
  nombre: string
  departamento?: string
  nit?: string
  representante_legal?: string
  cedula_representante?: string
}

export interface PDFPartner {
  nombre_completo: string
  cedula: string
  cargo?: string
  telefono?: string
  direccion?: string
  firma_url?: string  // URL to signature image
}

export interface PDFPeriodo {
  numero: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
  estado: string          // e.g. 'borrador' | 'enviado' | 'aprobado' | 'radicado' …
  valor_letras?: string
  numero_planilla?: string
}

export interface PDFContrato {
  numero: string
  anio: number
  objeto: string
  modalidad_seleccion: string
  valor_total: number
  valor_letras_total?: string
  valor_mensual: number
  valor_letras_mensual: string
  plazo_meses?: number
  duracion_letras?: string
  banco: string
  tipo_cuenta: string
  numero_cuenta: string
  dependencia: string
  fecha_inicio_contrato?: string
  fecha_fin_contrato?: string
  cdp?: string
  crp?: string
  contratista: PDFPartner
  supervisor: PDFPartner
}

export interface PDFEvidencia {
  url: string
  nombre_archivo: string
}

export interface PDFActividad {
  descripcion: string
  cantidad: number
  evidencias: PDFEvidencia[]
}

export interface PDFObligacion {
  descripcion: string
  es_permanente: boolean
  actividades: PDFActividad[]
}

/** Payment history row for Acta de Pago */
export interface PDFPagoHistorial {
  acta_numero: number
  valor_contrato: number
  valor_pagado_acumulado: number
  valor_acta: number
  saldo_pendiente: number
}

export interface PDFData {
  municipio: PDFMunicipio
  contrato: PDFContrato
  periodo: PDFPeriodo
  obligaciones: PDFObligacion[]
  fechaGeneracion: string
  pagosHistorial?: PDFPagoHistorial[]  // For Acta de Pago
}
