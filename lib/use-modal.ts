'use client'

/**
 * Lo que un modal accesible necesita y un `<div>` con fondo oscuro no trae: Escape lo cierra, el foco entra al abrir y
 * vuelve a donde estaba al cerrar, Tab no se sale de él y el fondo no se desplaza.
 *
 * Es el mismo comportamiento que ya tiene `components/ui/Dialogo.tsx` (el molde de los modales de edición), sacado a un
 * gancho para los modales que tienen su propio diseño —la tarjeta del contratista, la descarga del mes, la radicación
 * rápida— y no caben en ese molde. Uso: `const panel = useRef<HTMLDivElement>(null); useModalAccesible(panel, onClose)`,
 * y en el panel `ref={panel} role="dialog" aria-modal="true" aria-labelledby={…}`.
 */

import { useEffect, type RefObject } from 'react'

const USABLES =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalAccesible(panel: RefObject<HTMLElement | null>, onCerrar: () => void, ocupado = false): void {
  // El foco entra al abrir y vuelve al cerrar.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    const inicial = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(USABLES)
    inicial?.focus()
    return () => { antes?.focus?.() }
    // Solo al montar y desmontar: el foco no debe saltar cada vez que cambie una propiedad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El fondo no se desplaza.
  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previo }
  }, [])

  // Escape cierra, esté donde esté el foco; y Tab da la vuelta dentro del modal.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ocupado) { e.stopPropagation(); onCerrar(); return }
      if (e.key !== 'Tab' || !panel.current) return
      const usables = [...panel.current.querySelectorAll<HTMLElement>(USABLES)].filter(el => el.offsetParent !== null)
      if (usables.length === 0) return
      const primero = usables[0]
      const ultimo = usables[usables.length - 1]
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [panel, ocupado, onCerrar])
}
