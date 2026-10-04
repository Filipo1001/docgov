import { Iconos } from '@/lib/iconos'
import type { CategoriaTipo } from '@/lib/pdm/evidencias-armar'

/** El icono de cada clase de archivo admitido como evidencia: el mismo en «Evidencias» y en el formulario de reporte. */
export const GLIFO_DE_CATEGORIA: Record<CategoriaTipo, typeof Iconos.documentos.adjunto> = {
  pdf: Iconos.documentos.archivoPdf,
  word: Iconos.documentos.archivoWord,
  imagen: Iconos.documentos.archivoImagen,
  excel: Iconos.documentos.archivoHoja,
}
