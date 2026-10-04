'use client'

/**
 * La ventana del módulo: lo que tienen en común la ficha de un indicador y los diálogos.
 *
 * Antes cada una llevaba su propia copia del bloqueo del fondo, del Escape y del foco, y las copias
 * discrepaban. Esto las reúne y arregla de paso lo que las copias hacían mal:
 *
 *   · BLOQUEO DEL FONDO CONTADO. Cada ventana guardaba el `overflow` que encontraba y lo devolvía al
 *     cerrarse. Con dos abiertas (la ficha y, encima, el selector) la de arriba guardaba «hidden»; si se
 *     cerraban en otro orden, la página quedaba bloqueada para siempre. Ahora hay un contador: el primero
 *     en abrir guarda el estado original y solo el último en cerrar lo devuelve.
 *   · ESCAPE SOLO PARA LA DE ARRIBA, con una pila (no con trucos de fase de captura).
 *   · FOCO ATRAPADO. Con una ventana modal abierta, Tab no puede salir hacia la página de atrás.
 *   · EL VELO NO CIERRA POR ERROR. Seleccionar texto dentro de la ventana y soltar fuera cerraba todo: el
 *     clic cuenta solo si empezó y terminó en el velo.
 *   · ENTRA Y SALE. La salida es un cruce corto (más rápido que la entrada) y no un corte. Quien cierra por
 *     fuera (tras guardar, por ejemplo) lo hace con `Presencia`, que mantiene la ventana el instante que
 *     necesita para despedirse.
 *
 * El scroll se bloquea en `<html>`; `html[data-pdm]` reserva el carril de la barra de desplazamiento (ver
 * globals.css), así que la página no se corre al abrir ni al cerrar.
 */

import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

/** Cuánto dura la salida. Un poco más que la animación más larga (180 ms) para no cortarla. */
export const MS_SALIDA = 200

// ─── Bloqueo del scroll de la página: contado ──────────────────────────────

let bloqueos = 0
let overflowOriginal = ''

function bloquearScroll() {
  if (bloqueos === 0) {
    overflowOriginal = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
  bloqueos++
}

function liberarScroll() {
  bloqueos = Math.max(0, bloqueos - 1)
  if (bloqueos === 0) document.documentElement.style.overflow = overflowOriginal
}

// ─── Ventanas abiertas: solo la última recibe Escape y Tab ─────────────────

const pila: string[] = []

const ENFOCABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function enfocables(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(e => e.getClientRects().length > 0)
}

// ─── Contextos ─────────────────────────────────────────────────────────────

/** `null`: no hay `Presencia` (la ventana se despide sola). `boolean`: si `Presencia` la está despidiendo. */
const SalidaCtx = createContext<boolean | null>(null)

const VentanaCtx = createContext<{ cerrar: () => void }>({ cerrar: () => {} })
/** Cierra la ventana en la que está, con su despedida. Para los botones que cierran desde dentro. */
export const useVentana = () => useContext(VentanaCtx)

/**
 * Mantiene montada una ventana el instante que necesita para despedirse.
 *
 * Quien la usa dice solo si debe verse (`mostrar`). Al pasar a `false`, lo que se mostraba se queda
 * —congelado tal como estaba— mientras juega su salida, y luego se retira. Sin esto, cerrar desde el
 * padre (al terminar de guardar) era un corte.
 */
export function Presencia({ mostrar, children }: { mostrar: boolean; children: ReactNode }) {
  const [congelado, setCongelado] = useState<ReactNode>(children)
  // `true` cuando la despedida ya terminó (o nunca hubo nada que despedir): entonces no se pinta nada.
  const [terminado, setTerminado] = useState(!mostrar)
  // Mientras se muestra, se guarda lo último que llegó; al ocultarse, se conserva para la despedida.
  if (mostrar && congelado !== children) setCongelado(children)
  // Si vuelve a mostrarse (incluso en plena despedida), la despedida deja de contar.
  if (mostrar && terminado) setTerminado(false)

  useEffect(() => {
    if (mostrar) return
    const t = setTimeout(() => setTerminado(true), MS_SALIDA)
    return () => clearTimeout(t)
  }, [mostrar])

  if (!mostrar && terminado) return null
  return <SalidaCtx.Provider value={!mostrar}>{congelado}</SalidaCtx.Provider>
}

// ─── La ventana ────────────────────────────────────────────────────────────

export default function Ventana({ etiqueta, onCerrar, ancho = 'sm:max-w-xl', children }: {
  /** El nombre con que se anuncia la ventana. */
  etiqueta: string
  onCerrar: () => void
  /** Clases de ancho máximo en escritorio. */
  ancho?: string
  children: ReactNode
}) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const empezoEnElVelo = useRef(false)
  const dePresencia = useContext(SalidaCtx)
  const [despidiendose, setDespidiendose] = useState(false)
  const saliendo = dePresencia === true || despidiendose

  const cerrarFn = useRef(onCerrar)
  useEffect(() => { cerrarFn.current = onCerrar })

  // Con `Presencia` por encima, avisar al padre basta: ella conduce la salida. Sin ella, la ventana se despide y
  // luego avisa. Una sola vez, aunque se pida dos (doble clic, Escape y clic a la vez).
  const yaCierra = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(temporizador.current), [])
  const cerrar = useCallback(() => {
    if (dePresencia !== null) { cerrarFn.current(); return }
    if (yaCierra.current) return
    yaCierra.current = true
    setDespidiendose(true)
    temporizador.current = setTimeout(() => cerrarFn.current(), MS_SALIDA)
  }, [dePresencia])
  const cerrarRef = useRef(cerrar)
  useEffect(() => { cerrarRef.current = cerrar })
  const valor = useMemo(() => ({ cerrar }), [cerrar])

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    bloquearScroll()
    pila.push(id)

    const el = panel.current
    if (el) {
      const preferido = el.querySelector<HTMLElement>('[data-ventana-foco]')
      ;(preferido ?? enfocables(el)[0] ?? el).focus({ preventScroll: true })
    }

    const tecla = (e: KeyboardEvent) => {
      if (pila[pila.length - 1] !== id) return
      if (e.key === 'Escape') { e.stopPropagation(); cerrarRef.current(); return }
      if (e.key !== 'Tab' || !panel.current) return
      const lista = enfocables(panel.current)
      if (lista.length === 0) { e.preventDefault(); panel.current.focus(); return }
      const primero = lista[0], ultimo = lista[lista.length - 1]
      const activo = document.activeElement as HTMLElement | null
      const dentro = !!activo && panel.current.contains(activo)
      if (e.shiftKey && (activo === primero || !dentro)) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && (activo === ultimo || !dentro)) { e.preventDefault(); primero.focus() }
    }
    window.addEventListener('keydown', tecla, true)

    return () => {
      window.removeEventListener('keydown', tecla, true)
      const i = pila.lastIndexOf(id)
      if (i !== -1) pila.splice(i, 1)
      liberarScroll()
      // El foco vuelve a quien abrió la ventana, salvo que ya no exista (la lista cambió mientras tanto).
      if (previo && previo.isConnected) previo.focus({ preventScroll: true })
    }
  }, [id])

  return createPortal(
    <VentanaCtx.Provider value={valor}>
      {/* En pantallas grandes la ventana tiene el borde SUPERIOR fijo (no está centrada en vertical): si estuviera centrada,
          cualquier cambio de su altura —un aviso que aparece, un error en el pie— la movería la mitad de ese cambio. */}
      <div className={`fixed inset-0 z-[90] flex items-end justify-center sm:items-start sm:p-4 sm:pt-[7dvh] ${saliendo ? 'pointer-events-none' : ''}`}>
        <div
          aria-hidden
          className={`absolute inset-0 bg-[#192031]/55 ${saliendo ? 'pdm-velo-sale' : 'pdm-velo-entra'}`}
          onPointerDown={() => { empezoEnElVelo.current = true }}
          onClick={() => { if (empezoEnElVelo.current) cerrar(); empezoEnElVelo.current = false }}
        />
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={etiqueta}
          tabIndex={-1}
          // El clic que empieza en el panel (seleccionar texto, por ejemplo) nunca cuenta como «clic en el velo».
          onPointerDown={() => { empezoEnElVelo.current = false }}
          className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-xl outline-none sm:max-h-[calc(100dvh-7dvh-2rem)] sm:rounded-lg ${ancho} ${saliendo ? 'pdm-hoja-sale' : 'pdm-hoja-entra'}`}
        >
          {children}
        </div>
      </div>
    </VentanaCtx.Provider>,
    document.body,
  )
}

/** El botón de cerrar del encabezado de una ventana: recibe el foco al abrirse. */
export function BotonCerrarVentana() {
  const { cerrar } = useVentana()
  return (
    <button
      data-ventana-foco
      onClick={cerrar}
      className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#667085] transition-colors hover:bg-[#F4F5F8] hover:text-[#192031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031]"
    >
      <Icono glifo={Iconos.accion.cerrar} tamano="md" etiqueta="Cerrar" />
    </button>
  )
}
