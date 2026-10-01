'use client'

/**
 * La ventana sobre la que se trabaja el reparto: encabezado, cuerpo que se
 * desplaza y un pie fijo para los botones.
 *
 * Se abre ENCIMA de la ficha de un indicador (que es otra ventana), así que tiene
 * dos cuidados: queda por delante (z-90 frente a z-80) y Escape cierra solo la de
 * arriba. El oyente va en la fase de captura de `window` y corta la propagación:
 * así la ficha de abajo, que escucha en `document`, no se entera y no se cierra
 * con la de encima.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

export default function Dialogo({ titulo, subtitulo, onCerrar, pie, ancho = 'sm:max-w-xl', children }: {
  titulo: string
  subtitulo?: string
  onCerrar: () => void
  pie?: ReactNode
  ancho?: string
  children: ReactNode
}) {
  const cerrarRef = useRef<HTMLButtonElement>(null)
  const cerrarFn = useRef(onCerrar)
  useEffect(() => { cerrarFn.current = onCerrar })

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarRef.current?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      cerrarFn.current()
    }
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('keydown', tecla, true)
      document.body.style.overflow = overflow
      previo?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl ${ancho}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-gray-100 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug tracking-tight text-[#192031]">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-sm leading-snug text-gray-500">{subtitulo}</p>}
          </div>
          <button
            ref={cerrarRef}
            onClick={onCerrar}
            className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <Icono glifo={Iconos.accion.cerrar} tamano="md" etiqueta="Cerrar" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {pie && <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-4 sm:px-6">{pie}</div>}
      </div>
    </div>,
    document.body,
  )
}
