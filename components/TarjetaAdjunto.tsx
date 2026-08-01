'use client'

import type { AdjuntoDTO } from '@/app/actions/adjuntos'

interface Props {
  adjunto: AdjuntoDTO
  /** El periodo admite cambios: se ofrece eliminar el documento. */
  editable: boolean
  onAbrir: () => void
  onEliminar: () => void
}

/**
 * Documento PDF dentro de la grilla de evidencias de una obligación.
 *
 * Comparte medidas (80×80) y comportamiento del botón de borrado con las
 * miniaturas de imagen para que la evidencia se lea como un único conjunto,
 * sin importar si el soporte es una foto o un documento.
 */
export default function TarjetaAdjunto({ adjunto, editable, onAbrir, onEliminar }: Props) {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onAbrir}
        title={adjunto.nombre_original}
        className="w-20 h-20 rounded-xl border border-gray-200 bg-white hover:border-red-300 hover:bg-red-50/40 transition-colors flex flex-col items-center justify-center gap-1 px-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
        aria-label={`Ver documento ${adjunto.nombre_original}`}
      >
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        {/* Mismo número que imprimirá el informe: el contratista puede
            comprobar la correspondencia antes de enviarlo. */}
        <span className="text-[9px] font-semibold text-red-600 leading-none">
          Anexo {adjunto.orden}
        </span>
        <span className="text-[8px] text-gray-500 leading-tight text-center line-clamp-1 break-all w-full">
          {adjunto.nombre_original.replace(/\.pdf$/i, '')}
        </span>
      </button>

      {/* Igual que en las imágenes: siempre visible en móvil, al pasar el
          cursor en escritorio. */}
      {editable && (
        <button
          onClick={(e) => { e.stopPropagation(); onEliminar() }}
          className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 active:bg-red-700 transition-opacity shadow-sm z-10"
          aria-label={`Eliminar documento ${adjunto.nombre_original}`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
