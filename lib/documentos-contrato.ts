/**
 * Catálogo del expediente documental del contrato.
 *
 * Vive fuera de las server actions porque un archivo 'use server' solo puede
 * exportar funciones async, y este catálogo lo necesitan por igual el servidor
 * (para validar el tipo recibido) y el cliente (para pintar las categorías).
 *
 * El orden es el del trámite real, para que la pantalla se lea como la carpeta
 * física que sustituye.
 */

export const TIPOS_DOCUMENTO = [
  { id: 'contrato_firmado',       label: 'Contrato firmado',        icono: '📄' },
  { id: 'cdp',                    label: 'CDP',                     icono: '💰' },
  { id: 'rp',                     label: 'RP',                      icono: '🧾' },
  { id: 'rut',                    label: 'RUT',                     icono: '🏛️' },
  { id: 'certificacion_bancaria', label: 'Certificación bancaria',  icono: '🏦' },
  { id: 'poliza',                 label: 'Póliza',                  icono: '🛡️' },
  { id: 'otro',                   label: 'Otro documento',          icono: '📎' },
] as const

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]['id']

export const TIPOS_DOCUMENTO_IDS: ReadonlySet<string> = new Set(TIPOS_DOCUMENTO.map(t => t.id))

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
