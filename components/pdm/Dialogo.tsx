'use client'

/**
 * El diálogo sobre el que se trabaja el reparto y los grupos: encabezado, cuerpo que se desplaza y un pie fijo
 * para los botones.
 *
 * El marco (velo, entrada y salida, bloqueo del fondo, Escape, foco) es `Ventana`, que comparte con la ficha de
 * un indicador: ver su nota. Esto solo pone el contenido. Se abre ENCIMA de la ficha, así que sale después en
 * el documento y queda por delante; Escape cierra solo la de arriba.
 */

import type { ReactNode } from 'react'
import Ventana, { BotonCerrarVentana } from './Ventana'

export default function Dialogo({ titulo, subtitulo, onCerrar, pie, ancho = 'sm:max-w-xl', children }: {
  titulo: string
  subtitulo?: string
  onCerrar: () => void
  pie?: ReactNode
  ancho?: string
  children: ReactNode
}) {
  return (
    <Ventana etiqueta={titulo} onCerrar={onCerrar} ancho={ancho}>
      <div className="flex shrink-0 items-start gap-3 border-b border-[#E6E9EF] px-5 pb-4 pt-5 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-[#192031] [overflow-wrap:anywhere]">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-[#556072] [overflow-wrap:anywhere]" title={subtitulo}>{subtitulo}</p>}
        </div>
        <BotonCerrarVentana />
      </div>
      {/* `relative`: lo escondido con `sr-only` (posición absoluta) se ancla a ESTE cuerpo y se desplaza con él, no al panel. */}
      <div className="relative flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
      {pie && <div className="shrink-0 border-t border-[#E6E9EF] bg-white px-5 py-4 sm:px-6">{pie}</div>}
    </Ventana>
  )
}
