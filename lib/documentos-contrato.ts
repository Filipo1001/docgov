/**
 * Catálogo del expediente documental del contrato.
 *
 * Vive fuera de las server actions porque un archivo 'use server' solo puede
 * exportar funciones async, y este catálogo lo necesitan por igual el servidor
 * (para validar el tipo recibido) y el cliente (para pintar la pantalla).
 *
 * ── POR QUÉ HAY UN SOLO TIPO, Y NO SEIS ──────────────────────────────────
 *
 * Hasta septiembre de 2026 había seis casillas fijas —contrato firmado, CDP,
 * RP, RUT, certificación bancaria, póliza— porque son los soportes que la ley
 * pide para legalizar un contrato de prestación de servicios. El razonamiento
 * era correcto y la realidad lo desmintió entero: de los 42 documentos
 * adjuntos que había en producción, NINGUNO se subió en una de esas seis. Los
 * 42 estaban en «otro», y ningún contrato tenía más de uno.
 *
 * La razón es que la alcaldía no escanea los soportes por separado: escanea el
 * expediente de legalización completo, de una vez, y sube un solo PDF —mediana
 * de 104 páginas y 6,8 MB—. Las seis casillas no describían el trámite real,
 * describían cómo nos imaginábamos que sería. Mientras tanto la pantalla ponía
 * un «0 de 6» permanente encima de lo único que sí existía.
 *
 * ── LA REGLA PARA AÑADIR UN TIPO NUEVO ───────────────────────────────────
 *
 * `contrato` no está aquí por ser un documento importante: está porque tiene
 * una FUNCIÓN que el código necesita ejecutar — viaja dentro del paquete de
 * SECOP de la primera cuenta de cobro, y para eso hay que poder señalar cuál
 * de los archivos es. Esa es la prueba que debe pasar cualquier tipo futuro.
 *
 * La pregunta NO es «¿es un documento importante?». Es «¿a dónde viaja ese
 * documento?». Si la respuesta es «a ningún lado, solo se archiva», va en
 * `otro` y el nombre del archivo lo identifica. Volver a seis casillas es
 * volver al «0 de 6».
 */

export const TIPOS_DOCUMENTO = [
  { id: 'contrato', label: 'Contrato' },
  { id: 'otro',     label: 'Otro documento' },
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
