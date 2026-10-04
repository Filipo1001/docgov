'use client'

/**
 * Los avisos del módulo: lo que pasó, dicho sin mover la página.
 *
 * ── Qué reemplaza ────────────────────────────────────────────────────────
 *
 * El cartel verde que se insertaba en medio de la pantalla («Reporte enviado», «Asignado a…»). Aparecer ahí
 * EMPUJABA todo lo de debajo hacia abajo, y al cerrarse lo devolvía de golpe: un salto de contenido provocado
 * justo por la acción que la persona acababa de hacer. Un aviso que flota encima no mueve nada.
 *
 * ── Cómo se comporta ─────────────────────────────────────────────────────
 *
 *   · Flota abajo y al centro, sobre las ventanas (z-100). Máximo tres a la vez; el más viejo se va.
 *   · Se va solo, y tarda más cuanto más largo es el texto (se mide que se pueda leer). Quien lo tiene
 *     bajo el cursor o el foco lo detiene.
 *   · El mismo texto no se apila: se renueva (pulsar dos veces no pinta dos avisos iguales).
 *   · Se anuncia a lectores de pantalla (`role="status"`, en una región `aria-live` que existe antes del primer
 *     aviso: si se creara con él, algunos lectores no lo leerían).
 *   · El visto se dibuja, como en el resto de la aplicación.
 *
 * El color no es la voz: el texto lo dice todo. Un tono `mal` solo cambia el icono.
 */

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { CheckDibujado } from './Movimiento'

export type TonoAviso = 'bien' | 'nota' | 'mal'
type Avisar = (texto: string, tono?: TonoAviso) => void

interface Aviso { readonly id: number; readonly texto: string; readonly tono: TonoAviso; readonly saliendo: boolean }

const MAXIMO = 3
const MS_DESPEDIDA = 170
const MS_TRAS_PAUSA = 2000
/** Lo que se deja ver un aviso: lo justo para leerlo, y más cuanto más largo. */
export const duracionAviso = (texto: string) => Math.min(9000, 3800 + texto.length * 45)

/**
 * El almacén: la lista de avisos y sus relojes, fuera de React. Cada cambio reemplaza la lista por una nueva
 * (nunca la muta), que es lo que `useSyncExternalStore` necesita para saber que hay algo que pintar.
 */
export function crearAlmacenAvisos() {
  let lista: readonly Aviso[] = []
  let siguiente = 1
  const oyentes = new Set<() => void>()
  const relojes = new Map<number, ReturnType<typeof setTimeout>>()

  const poner = (nueva: readonly Aviso[]) => { lista = nueva; oyentes.forEach(o => o()) }
  const parar = (id: number) => { const r = relojes.get(id); if (r) { clearTimeout(r); relojes.delete(id) } }

  function retirar(id: number) {
    // Primero se mira el estado: si ya se está despidiendo, NO se toca su reloj (el que lo retirará). Cancelarlo dejaba un
    // aviso fantasma —invisible pero ocupando sitio— cuando se pulsaba dos veces la «×» o se pulsaba justo al irse solo.
    const a = lista.find(x => x.id === id)
    if (!a || a.saliendo) return
    parar(id)
    poner(lista.map(x => (x.id === id ? { ...x, saliendo: true } : x)))
    relojes.set(id, setTimeout(() => {
      relojes.delete(id)
      poner(lista.filter(x => x.id !== id))
    }, MS_DESPEDIDA))
  }

  function programar(id: number, ms: number) {
    parar(id)
    relojes.set(id, setTimeout(() => retirar(id), ms))
  }

  function avisar(texto: string, tono: TonoAviso = 'bien') {
    const t = texto.trim()
    if (!t) return
    // El mismo texto no se apila: se renueva.
    const igual = lista.find(a => a.texto === t && !a.saliendo)
    if (igual) { programar(igual.id, duracionAviso(t)); return }
    const a: Aviso = { id: siguiente++, texto: t, tono, saliendo: false }
    poner([...lista, a])
    // Más de tres a la vez: se despide el más viejo que no se esté despidiendo ya.
    const vivos = lista.filter(x => !x.saliendo)
    if (vivos.length > MAXIMO) retirar(vivos[0].id)
    programar(a.id, duracionAviso(t))
  }

  return {
    foto: () => lista,
    suscribir: (o: () => void) => { oyentes.add(o); return () => { oyentes.delete(o) } },
    avisar,
    retirar,
    /** El cursor o el foco están encima: no se va. */
    pausar: (id: number) => { if (lista.find(x => x.id === id && !x.saliendo)) parar(id) },
    /** Se fueron: se queda un poco más y se va. */
    reanudar: (id: number) => { if (lista.find(x => x.id === id && !x.saliendo)) programar(id, MS_TRAS_PAUSA) },
    limpiar: () => { relojes.forEach(clearTimeout); relojes.clear() },
  }
}

const VACIA: readonly Aviso[] = []
const Ctx = createContext<Avisar>(() => {})

/** `avisar('Reporte enviado.')`. Sin el proveedor no hace nada (las pantallas de prueba sin marco no se rompen). */
export const useAvisar = () => useContext(Ctx)

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [almacen] = useState(crearAlmacenAvisos)
  const avisos = useSyncExternalStore(almacen.suscribir, almacen.foto, () => VACIA)
  // `false` al pintar en el servidor y durante la hidratación, `true` después: el aviso flota en <body>, que allí no existe.
  const enNavegador = useSyncExternalStore(() => () => {}, () => true, () => false)
  useEffect(() => almacen.limpiar, [almacen])

  return (
    <Ctx.Provider value={almacen.avisar}>
      {children}
      {enNavegador && createPortal(
        <div
          role="status"
          aria-live="polite"
          aria-relevant="additions"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          {avisos.map(a => (
            <div
              key={a.id}
              onMouseEnter={() => almacen.pausar(a.id)}
              onMouseLeave={() => almacen.reanudar(a.id)}
              onFocus={() => almacen.pausar(a.id)}
              onBlur={() => almacen.reanudar(a.id)}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg bg-[#192031] py-3 pl-3.5 pr-2 text-sm text-white shadow-[0_12px_32px_-12px_rgba(25,32,49,0.6)] ring-1 ring-white/10 ${a.saliendo ? 'pdm-aviso-sale' : 'pdm-aviso-entra'}`}
            >
              <span className="mt-0.5 shrink-0">
                {a.tono === 'bien'
                  ? <CheckDibujado tamano={16} />
                  : <Icono glifo={a.tono === 'mal' ? Iconos.estado.advertencia : Iconos.estado.informacion} tamano="sm" className={a.tono === 'mal' ? 'text-[#F4A39B]' : ''} />}
              </span>
              <p className="min-w-0 flex-1 leading-snug">{a.texto}</p>
              <button
                onClick={() => almacen.retirar(a.id)}
                className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Cerrar aviso" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}
