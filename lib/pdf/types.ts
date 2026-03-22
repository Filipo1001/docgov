// Data shapes consumed by both PDF templates.
// Deliberately flat — assembled once by the API route, passed into the component.

export interface PDFPartner {
  nombre_completo: string
  cedula: string
}

export interface PDFPeriodo {
  numero: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
}

export interface PDFContrato {
  numero: string
  anio: number
  objeto: string
  modalidad_seleccion: string
  valor_total: number
  valor_mensual: number
  valor_letras_mensual: string
  banco: string
  tipo_cuenta: string
  numero_cuenta: string
  dependencia: string
  contratista: PDFPartner
  supervisor: PDFPartner
}

export interface PDFActividad {
  descripcion: string
  cantidad: number
}

export interface PDFObligacion {
  descripcion: string
  es_permanente: boolean
  actividades: PDFActividad[]
}

export interface PDFData {
  municipio: string
  contrato: PDFContrato
  periodo: PDFPeriodo
  obligaciones: PDFObligacion[]
  fechaGeneracion: string // DD/MM/YYYY
}
