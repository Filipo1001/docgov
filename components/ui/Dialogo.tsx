'use client'

/**
 * components/ui/Dialogo.tsx — El molde de un modal de edición pequeño.
 *
 * Mismo aspecto que los modales que ya tiene la aplicación (fondo oscuro con desenfoque, tarjeta `rounded-2xl`, título y
 * subtítulo pequeños), con lo que a esos les falta:
 *
 *   · Se monta en `document.body` (portal). Un modal que vive dentro del desplegable de la planilla heredaba su
 *     `overflow-hidden` y cualquier contención del contenedor; en el portal no depende de nada de lo que lo rodea.
 *   · En un teléfono es una HOJA que sube desde abajo (el pulgar llega mejor y el teclado no la tapa); desde `sm`, una
 *     tarjeta centrada.
 *   · Teclado y lectores de pantalla: Escape cierra; Tab no se sale del modal; al abrir, el foco va al elemento marcado
 *     `data-autofocus` (o al primero que se pueda usar); al cerrar, vuelve a donde estaba (la ficha que lo abrió).
 *   · El fondo no se desplaza mientras está abierto.
 *   · Mientras guarda (`ocupado`) no se cierra por accidente.
 *
 * Se monta cuando hay que mostrarlo: `{abierto && <Dialogo …>}`.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

const USABLES =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface Props {
  titulo: string
  descripcion?: ReactNode
  icono?: LucideIcon
  onCerrar: () => void
  /** Guardando: no se cierra con Escape ni tocando fuera. */
  ocupado?: boolean
  /** La capa (z-index) de Tailwind. Por defecto z-50; la revisión en pantalla completa lo abre por encima de ella. */
  capa?: string
  children: ReactNode
  /** Los botones de abajo. */
  pie: ReactNode
}

export default function Dialogo({ titulo, descripcion, icono, onCerrar, ocupado = false, capa = 'z-50', children, pie }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const idDescripcion = useId()
  const [entrado, setEntrado] = useState(false)

  // La entrada: un fotograma después de montar, para que la transición parta del estado oculto.
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntrado(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // El foco: entra al abrir y vuelve a donde estaba al cerrar.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    const inicial = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(USABLES)
    inicial?.focus()
    return () => { antes?.focus?.() }
  }, [])

  // El fondo no se desplaza.
  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previo }
  }, [])

  // Escape cierra, esté donde esté el foco.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ocupado) { e.stopPropagation(); onCerrar() }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [ocupado, onCerrar])

  // Tab da la vuelta dentro del modal.
  const atraparTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return
    const usables = [...panel.current.querySelectorAll<HTMLElement>(USABLES)].filter((el) => el.offsetParent !== null)
    if (usables.length === 0) return
    const primero = usables[0]
    const ultimo = usables[usables.length - 1]
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
  }

  return createPortal(
    <div
      className={`fixed inset-0 ${capa} flex items-end justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none sm:items-center sm:p-4 ${
        entrado ? 'opacity-100' : 'opacity-0'
      }`}
      onPointerDown={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar() }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descripcion ? idDescripcion : undefined}
        onKeyDown={atraparTab}
        className={`max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-2xl transition-all duration-200 motion-reduce:transition-none sm:rounded-2xl ${
          entrado ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        {/* El asa de la hoja: solo en el teléfono, donde el modal sube desde abajo. */}
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-gray-200 sm:hidden" />

        <div className="flex items-start gap-3 px-5 pt-4 sm:pt-5">
          {icono && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600">
              <Icono glifo={icono} tamano="md" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 id={idTitulo} className="text-base font-semibold leading-tight text-gray-900">{titulo}</h3>
            {descripcion && <p id={idDescripcion} className="mt-1 text-sm leading-snug text-gray-500">{descripcion}</p>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={ocupado}
            aria-label="Cerrar"
            className="-mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-40"
          >
            <Icono glifo={Iconos.accion.cerrar} tamano="sm" />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {pie}
        </div>
      </div>
    </div>,
    document.body,
  )
}
