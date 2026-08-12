/**
 * Catálogo del expediente documental del contrato.
 *
 * Vive fuera de las server actions porque un archivo 'use server' solo puede
 * exportar funciones async, y este catálogo lo necesitan por igual el servidor
 * (para validar el tipo recibido) y el cliente (para pintar las categorías).
 *
 * El orden es el del trámite real, para que la pantalla se lea como la carpeta
 * física que sustituye.
 *
 * REQUERIDOS vs. libre. `REQUERIDOS` son los seis soportes que la ley exige
 * para legalizar un contrato de prestación de servicios — no son una elección
 * de interfaz, son el trámite real, y por eso siguen siendo una lista fija con
 * hueco visible cuando falta uno. `otro` dejó de ser una categoría más: es la
 * puerta abierta para lo que no encaja ahí (un otrosí, un concepto jurídico,
 * una constancia) y no se pigeonholea en un tipo — el nombre del archivo hace
 * ese trabajo. Así "los tipos pueden variar según el contexto" sin que cada
 * documento nuevo exija tocar este catálogo.
 */

export const TIPOS_DOCUMENTO = [
  { id: 'contrato_firmado',       label: 'Contrato firmado' },
  { id: 'cdp',                    label: 'CDP' },
  { id: 'rp',                     label: 'RP' },
  { id: 'rut',                    label: 'RUT' },
  { id: 'certificacion_bancaria', label: 'Certificación bancaria' },
  { id: 'poliza',                 label: 'Póliza' },
  { id: 'otro',                   label: 'Otro documento' },
] as const

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]['id']

export const TIPOS_DOCUMENTO_IDS: ReadonlySet<string> = new Set(TIPOS_DOCUMENTO.map(t => t.id))

/** Los seis soportes legalmente exigidos, en el orden del trámite. */
export const REQUERIDOS = TIPOS_DOCUMENTO.filter(t => t.id !== 'otro')

export interface DocumentoContratoDTO {
  id: string
  nombre_original: string
  bytes: number
  paginas: number | null
  tipo_documento: TipoDocumento
  created_at: string
  subido_por_nombre: string | null
  urlFirmada?: string
}
