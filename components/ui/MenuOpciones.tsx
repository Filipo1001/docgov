'use client'

/**
 * El botón de tres puntos con su menú de opciones.
 *
 * Accesible por teclado como un menú de verdad: el botón anuncia que abre un menú y si está abierto; al abrir, el foco va
 * a la primera opción; las flechas recorren las opciones (dando la vuelta), Inicio y Fin saltan a los extremos, Escape
 * cierra y devuelve el foco al botón, y tocar fuera también cierra.
 *
 * Una opción es un enlace (`href`), una acción (`onSelect`) o una lista desplegable (`submenu`): al tocarla, el menú muestra
 * esa lista en su lugar, con «Volver» arriba. `peligro` la pinta en rojo (devolver, por ejemplo) y va separada del resto
 * por una línea.
 */

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

export interface OpcionMenu {
  id: string
  etiqueta: string
  icono: LucideIcon
  href?: string
  onSelect?: () => void
  peligro?: boolean
  /** Abre en otra pestaña (descargas, por ejemplo). */
  nuevaPestana?: boolean
  /** Es un archivo para descargar: enlace simple con `download`. */
  descarga?: boolean
  /** Una lista que se despliega en el mismo menú (Descargar documentos → cada documento). */
  submenu?: OpcionMenu[]
}

export default function MenuOpciones({ opciones, etiqueta }: { opciones: OpcionMenu[]; etiqueta: string }) {
  const [abierto, setAbierto] = useState(false)
  // La lista desplegada (submenú), si la hay. Al cerrar el menú se vuelve a la principal.
  const [sub, setSub] = useState<OpcionMenu | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const idMenu = useId()

  // Al abrir, el foco va a la primera opción; tocar fuera o pulsar Escape cierra.
  useEffect(() => {
    if (!abierto) return
    // Al abrir o al cambiar de lista, el foco va a la primera opción.
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const fuera = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto, sub])

  function cerrar(volverAlBoton = true) {
    setAbierto(false)
    setSub(null)
    if (volverAlBoton) boton.current?.focus()
  }

  function teclado(e: React.KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') { e.preventDefault(); cerrar() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus() }
    else if (e.key === 'Tab') cerrar(false)
  }

  const lista = sub?.submenu ?? opciones
  const normales = lista.filter(o => !o.peligro)
  const peligrosas = lista.filter(o => o.peligro)
  const claseItem = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-gray-100 hover:bg-gray-100'

  const item = (o: OpcionMenu) => {
    const contenido = (
      <>
        <Icono glifo={o.icono} tamano="sm" className={o.peligro ? 'text-red-600' : 'text-gray-500'} />
        <span className="flex-1">{o.etiqueta}</span>
        {o.submenu && <Icono glifo={Iconos.accion.avanzar} tamano="sm" className="text-gray-400" />}
      </>
    )
    const color = o.peligro ? 'text-red-700' : 'text-gray-800'
    if (o.href && o.descarga) {
      return (
        <a
          key={o.id}
          href={o.href}
          download
          role="menuitem"
          tabIndex={-1}
          target="_blank"
          rel="noopener"
          className={`${claseItem} ${color}`}
          onClick={() => cerrar(false)}
        >
          {contenido}
        </a>
      )
    }
    return o.href ? (
      <Link
        key={o.id}
        href={o.href}
        role="menuitem"
        tabIndex={-1}
        target={o.nuevaPestana ? '_blank' : undefined}
        rel={o.nuevaPestana ? 'noopener' : undefined}
        className={`${claseItem} ${color}`}
        onClick={() => cerrar(false)}
      >
        {contenido}
      </Link>
    ) : (
      <button
        key={o.id}
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={`${claseItem} ${color}`}
        aria-haspopup={o.submenu ? 'menu' : undefined}
        onClick={() => {
          if (o.submenu) { setSub(o); return }
          cerrar(false)
          o.onSelect?.()
        }}
      >
        {contenido}
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => { setSub(null); setAbierto(a => !a) }}
        className={`flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 ${abierto ? 'bg-gray-100 text-gray-900' : ''}`}
      >
        <Icono glifo={Iconos.accion.mas} tamano="md" />
      </button>

      {abierto && (
        <div
          ref={menu}
          id={idMenu}
          role="menu"
          aria-label={etiqueta}
          onKeyDown={teclado}
          className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
        >
          {sub && (
            <>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setSub(null)}
                className={`${claseItem} font-semibold text-gray-900`}
              >
                <Icono glifo={Iconos.accion.retroceder} tamano="sm" className="text-gray-500" />
                <span>{sub.etiqueta}</span>
              </button>
              <div role="separator" className="my-1.5 border-t border-gray-100" />
            </>
          )}
          {normales.map(item)}
          {peligrosas.length > 0 && normales.length > 0 && <div role="separator" className="my-1.5 border-t border-gray-100" />}
          {peligrosas.map(item)}
        </div>
      )}
    </div>
  )
}
