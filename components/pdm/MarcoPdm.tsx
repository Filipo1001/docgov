'use client'

/**
 * El marco del módulo Plan de Desarrollo: lo que rodea a sus pantallas.
 *
 * ── Por qué no lleva la barra lateral de contratos ───────────────────────
 *
 * Esa barra es el menú de la gestión contractual: contratos, informes,
 * firmas. Mientras se trabaja en el plan no se usa nada de eso, y ocupa 256 px
 * de ancho que las tablas de indicadores sí aprovechan. Se sustituye, no se
 * quita: hace falta una salida a la vista de siempre y saber en qué módulo se
 * está.
 *
 * ── El menú propio ────────────────────────────────────────────────────────
 *
 * Son pestañas bajo la barra y no una barra lateral: con tres o cuatro
 * secciones una barra lateral le vuelve a quitar al contenido el ancho que se
 * acaba de ganar. Si un día son siete, este es el sitio donde cambiarlo. Cada
 * pestaña es una ruta real, así que el botón «atrás», recargar y compartir un
 * enlace funcionan como se espera.
 *
 * ── Identidad ────────────────────────────────────────────────────────────
 *
 * Es Contratista Digital —misma tinta, misma tipografía, mismos iconos— pero se
 * lee como un módulo aparte: un solo acento propio (el verde azulado del
 * botón que lo abre) y el nombre del plan compuesto con tipografía, igual que
 * lo hace `AlcaldeHome`. Sin escudo ni imagen.
 *
 * ── Qué NO hace, a propósito ─────────────────────────────────────────────
 *
 * No cierra sesión. La salida de `Sidebar` lleva una defensa contra un cuelgue
 * real del navegador (el bloqueo interno de `signOut`); copiarla aquí sería
 * mantener dos versiones de algo delicado. Se cierra desde el panel, a un clic
 * de «Contratista Digital».
 *
 * Vive DENTRO del layout del panel, así que hereda la sesión, el caché de
 * datos y la redirección por sesión vencida: no hay un segundo login.
 *
 * ── Quién pinta qué (y por qué la barra ya no depende del navegador) ─────
 *
 * El layout del panel decide si una ruta usa este marco y pinta SOLO su cascarón (`MarcoPdm`: el fondo).
 * La barra la pinta el layout propio del módulo (`app/dashboard/plan-desarrollo/layout.tsx`), en el
 * servidor, con las pestañas que le tocan a quien mira YA CALCULADAS. Antes las pestañas salían de una
 * consulta del navegador que, si fallaba un instante, devolvía «sin nivel» y quedaba guardada como si fuera
 * la verdad: la barra perdía pestañas, o no estaba cuando se pintaba, y se corría todo al llegar la respuesta.
 * Ahora llega en el primer byte, no se corre nada y un fallo pasajero no la toca.
 *
 * Como ese layout envuelve a las pantallas y su error (`error.tsx`), si una pantalla falla la barra sigue ahí.
 *
 * ── Cómo se siente ───────────────────────────────────────────────────────
 *
 *   · La pestaña que se pulsa se marca AL INSTANTE (no cuando llega la pantalla) y el subrayado se desliza
 *     hasta ella: es el mismo objeto que viaja, no uno que desaparece y otro que aparece.
 *   · Si la navegación tarda, un hilo fino de luz recorre el borde inferior de la barra. Aparece con retardo:
 *     las navegaciones rápidas no lo muestran.
 *   · El ancho de cada pestaña es siempre el de su letra en negrita, así que al cambiar de activa ninguna
 *     vecina se mueve ni un píxel.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { LogoCD } from '@/components/Logo'
import { Avatar } from './PersonaVista'
import { useUsuario } from '@/lib/user-context'
import { PLAN, VISTA_PREVIA } from '@/lib/pdm/identidad'
import { useQuery } from '@tanstack/react-query'
import { nivelPdm } from '@/app/actions/pdm'
import { SECCIONES_PDM, seccionActiva, seccionesPara, type SeccionPdm } from '@/lib/pdm/menu'
import type { NivelPdm } from '@/lib/pdm/niveles'

/**
 * La barra superior: salida, identidad, secciones y persona.
 * Recibe todo por props —no sabe de dónde salen— y por eso se puede mirar sola.
 *
 * Es una banda de tinta (`#192031`, el grafito del logotipo) con el isotipo oficial en blanco: lo
 * primero que se ve es que esto es Contratista Digital. El nombre del plan va debajo del de la
 * plataforma, compuesto con tipografía —rótulo en mayúscula espaciada y el nombre del plan en
 * grueso—, como el membrete de un formato oficial. Las pestañas viven en la misma banda: un solo
 * bloque de navegación, no dos.
 */
export function BarraPdm({
  usuario,
  ruta,
  secciones = SECCIONES_PDM,
}: {
  usuario: { nombre_completo: string; foto_url?: string | null } | null
  ruta: string | null
  /** Las pestañas que le tocan a quien mira (ver `seccionesPara`). */
  secciones?: SeccionPdm[]
}) {
  const activaReal = seccionActiva(ruta)

  // La pestaña pulsada se marca al instante; `desde` recuerda en qué ruta se pulsó, así que en cuanto la ruta
  // cambia el pedido deja de contar solo, sin un efecto que lo limpie.
  const [pedido, setPedido] = useState<{ href: string; desde: string | null } | null>(null)
  const yendoA = pedido !== null && pedido.desde === ruta ? pedido.href : null
  const activa = yendoA ?? activaReal
  const navegando = yendoA !== null && yendoA !== activaReal
  // Si la navegación nunca llega (un error), la marca no se queda para siempre.
  useEffect(() => {
    if (!navegando) return
    const t = setTimeout(() => setPedido(null), 12_000)
    return () => clearTimeout(t)
  }, [navegando])

  // El subrayado es UN elemento que se desliza hasta la pestaña activa (solo `transform`). Mientras no se ha
  // medido (el servidor, el primer pintado) la pestaña activa lleva su propio borde: el cambio es invisible.
  const lista = useRef<HTMLUListElement>(null)
  const enlaces = useRef(new Map<string, HTMLAnchorElement>())
  const [medida, setMedida] = useState<{ x: number; w: number } | null>(null)
  const [deslizar, setDeslizar] = useState(false)
  // Si hay más pestañas de las que caben, el borde por el que siguen se difumina: se nota que hay más sin una barra de desplazamiento.
  const [bordes, setBordes] = useState({ izq: false, der: false })
  const medirBordes = useCallback(() => {
    const ul = lista.current
    if (!ul) return
    const izq = ul.scrollLeft > 1
    const der = ul.scrollLeft + ul.clientWidth < ul.scrollWidth - 1
    setBordes(p => (p.izq === izq && p.der === der ? p : { izq, der }))
  }, [])

  const medir = useCallback(() => {
    const a = activa ? enlaces.current.get(activa) : undefined
    if (!a) { setMedida(null); return }
    setMedida(prev => (prev && prev.x === a.offsetLeft && prev.w === a.offsetWidth ? prev : { x: a.offsetLeft, w: a.offsetWidth }))
  }, [activa])
  // Se mide un fotograma después de cada cambio (activa o pestañas), y cada vez que la barra cambia de tamaño.
  // Entre tanto la pestaña activa lleva su propio borde, así que no hay hueco visible.
  useEffect(() => {
    const id = requestAnimationFrame(medir)
    return () => cancelAnimationFrame(id)
  }, [medir, secciones])
  useEffect(() => {
    const ul = lista.current
    if (!ul || typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(() => { medir(); medirBordes() })
    o.observe(ul)
    return () => o.disconnect()
  }, [medir, medirBordes])
  // Que no «viaje» desde cero al entrar: la transición se enciende un fotograma después de la primera medida.
  useEffect(() => {
    if (!medida || deslizar) return
    const id = requestAnimationFrame(() => setDeslizar(true))
    return () => cancelAnimationFrame(id)
  }, [medida, deslizar])

  // En un teléfono las pestañas no caben y la barra se desliza: la activa tiene que quedar a la vista.
  // Se mueve la barra (no la página, que es lo que haría `scrollIntoView`).
  useEffect(() => {
    const ul = lista.current
    const a = activa ? enlaces.current.get(activa) : undefined
    if (!ul || !a) return
    const visibleDesde = ul.scrollLeft
    const visibleHasta = visibleDesde + ul.clientWidth
    if (a.offsetLeft < visibleDesde || a.offsetLeft + a.offsetWidth > visibleHasta) {
      ul.scrollTo({ left: Math.max(0, a.offsetLeft + a.offsetWidth - ul.clientWidth + 16), behavior: 'smooth' })
    }
  }, [activa, secciones.length])

  return (
    <header className="sticky top-0 z-30 bg-[#192031] text-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-8">
        <Link
          href="/dashboard"
          className="-ml-2 flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Icono glifo={Iconos.accion.retroceder} tamano="sm" />
          <span className="hidden sm:inline">Contratista Digital</span>
          <span className="sm:hidden">Panel</span>
        </Link>

        <span aria-hidden className="h-7 w-px shrink-0 bg-white/20" />

        <div className="flex min-w-0 items-center gap-3">
          <LogoCD size={30} color="#FFFFFF" className="shrink-0" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[10px] font-semibold uppercase text-white/60" style={{ letterSpacing: '0.2em' }}>
              {PLAN.nombre}
            </p>
            <p className="truncate text-[15px] font-semibold tracking-tight">
              {PLAN.denominacion}
              <span className="hidden font-normal text-white/55 sm:inline"> · {PLAN.periodo}</span>
            </p>
          </div>
        </div>

        {/* El sitio de la persona está siempre reservado: al llegar su foto no se mueve nada. */}
        <div className="ml-auto flex h-10 shrink-0 items-center">
          {usuario ? (
            <Link
              href="/dashboard/perfil"
              aria-label="Mi perfil"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:pr-3"
            >
              <Avatar nombre={usuario.nombre_completo} fotoUrl={usuario.foto_url} tamano="sm" colores="bg-white/15 text-white" className="ring-1 ring-white/25" />
              <span className="hidden text-sm font-medium text-white/85 sm:inline">
                {usuario.nombre_completo.split(' ')[0]}
              </span>
            </Link>
          ) : (
            <span aria-hidden className="m-1 h-8 w-8 rounded-full bg-white/10" />
          )}
        </div>
      </div>

      <nav aria-label="Secciones del plan" aria-busy={navegando || undefined} className="mx-auto max-w-7xl px-4 md:px-8">
        <ul
          ref={lista}
          onScroll={medirBordes}
          style={bordes.izq || bordes.der ? (() => {
            const mascara = `linear-gradient(to right, ${bordes.izq ? 'transparent 0, #000 20px' : '#000 0'}, ${bordes.der ? '#000 calc(100% - 20px), transparent 100%' : '#000 100%'})`
            return { WebkitMaskImage: mascara, maskImage: mascara }
          })() : undefined}
          // Sin barra de desplazamiento visible (en una ventana estrecha de escritorio se pegaba al borde inferior de las pestañas).
          className="relative flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {secciones.map(s => {
            const esta = s.href === activa
            return (
              <li key={s.href} className="shrink-0">
                <Link
                  ref={el => { if (el) enlaces.current.set(s.href, el); else enlaces.current.delete(s.href) }}
                  href={s.href}
                  aria-current={s.href === activaReal ? 'page' : undefined}
                  onClick={e => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                    setPedido({ href: s.href, desde: ruta })
                  }}
                  className={`block border-b-2 px-3.5 py-2.5 text-sm transition-colors focus-visible:bg-white/10 focus-visible:outline-none ${
                    esta
                      ? `${medida === null ? 'border-white' : 'border-transparent'} text-white`
                      : 'border-transparent text-white/60 hover:text-white'
                  }`}
                >
                  {/* La letra en negrita ocupa su sitio siempre (invisible): activa o no, la pestaña mide lo mismo. */}
                  <span className="grid">
                    <span className={`col-start-1 row-start-1 ${esta ? 'font-semibold' : 'font-medium'}`}>{s.rotulo}</span>
                    <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">{s.rotulo}</span>
                  </span>
                </Link>
              </li>
            )
          })}
          {medida !== null && (
            <li
              role="presentation"
              aria-hidden
              className={`pointer-events-none absolute bottom-0 left-0 h-0.5 w-[100px] origin-left bg-white ${deslizar ? 'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none' : ''}`}
              style={{ transform: `translateX(${medida.x}px) scaleX(${medida.w / 100})` }}
            />
          )}
        </ul>
      </nav>

      {navegando && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
          <div className="pdm-hilo h-full w-2/5 bg-white/80" />
        </div>
      )}
    </header>
  )
}

/**
 * El aviso de la vista previa: una línea, sin ocupar una tarjeta (ver `VISTA_PREVIA`). El layout del módulo no lo pinta
 * en producción.
 */
export function AvisoVistaPrevia() {
  if (!VISTA_PREVIA.activa) return null
  return (
    <div className="border-b border-[#DCE0E8] bg-white">
      <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-xs text-[#556072] md:px-8">
        <span className="font-semibold uppercase text-[#192031]" style={{ letterSpacing: '0.14em' }}>Vista previa</span>
        <span>{VISTA_PREVIA.texto}</span>
      </p>
    </div>
  )
}

/**
 * La barra del módulo, conectada a quién mira y a dónde está. La pinta el layout propio del módulo
 * (en el servidor) con `nivel` ya resuelto: `null` es «sin acceso» (las pantallas lo mandarán a otro lado),
 * `undefined` es «no se pudo comprobar» y solo entonces se pregunta desde el navegador, sin dar pestañas
 * de más mientras llega la respuesta.
 */
export function BarraPdmConectada({ nivel }: { nivel?: NivelPdm | null }) {
  const { usuario } = useUsuario()
  const ruta = usePathname()
  const sinSaber = nivel === undefined
  // La misma respuesta del servidor que usa la barra lateral (clave compartida): no es una petición más.
  const { data: leido } = useQuery({
    queryKey: ['pdm-acceso'],
    queryFn: () => nivelPdm(),
    enabled: sinSaber,
    staleTime: Infinity,
    retry: 1,
  })
  return <BarraPdm usuario={usuario} ruta={ruta} secciones={seccionesPara(sinSaber ? leido : nivel)} />
}

/**
 * El cascarón del módulo: el fondo, y reservar el carril de la barra de desplazamiento para que la página no se
 * corra al abrir o cerrar una ventana (ver `html[data-pdm]` en globals.css). La barra y el contenido los pone el
 * layout del módulo, dentro de esto.
 */
export default function MarcoPdm({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-pdm', '')
    return () => document.documentElement.removeAttribute('data-pdm')
  }, [])
  return <div className="min-h-dvh bg-[#F4F5F8]">{children}</div>
}
