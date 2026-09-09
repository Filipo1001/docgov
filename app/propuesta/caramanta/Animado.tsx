'use client'

/**
 * Animaciones propias de la propuesta de Caramanta.
 *
 * Se pidió «muy rica en animaciones para teléfono», sabiendo que el alcalde la
 * abre en un iPhone. Esto se suma a lo que ya traen `Revelar`, `Contador` y
 * `ProgresoScroll`; no los reemplaza.
 *
 * ── Dos reglas que gobiernan el archivo ──────────────────────────────────
 *
 * 1. TODO ES PROGRESIVO. Cada efecto entra por `@supports` o por comprobación
 *    en tiempo de ejecución. En un navegador que no lo soporte la página
 *    queda como las demás propuestas, que ya funcionan bien. Una propuesta
 *    comercial que no se lee porque un efecto falló sería un mal negocio, y
 *    ese criterio ya está escrito en `Revelar.tsx`.
 *
 * 2. SE ANIMA LO QUE SE QUIERE QUE SE LEA, no lo que se puede animar. El
 *    titular, las cifras y el precio: los tres sitios donde el ojo tiene que
 *    detenerse. El resto de la página se queda quieta a propósito — setenta
 *    bloques moviéndose es ruido, no riqueza.
 *
 * `prefers-reduced-motion` manda por encima de todo: quien pidió menos
 * movimiento no lo recibe por la puerta de atrás.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Coincide con `md:` de Tailwind y con el corte que ya usa Revelar.tsx. */
const CORTE_MOVIL = 768

function quiereQuieto(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Titular que entra palabra por palabra.
 *
 * Es el efecto más caro de la página y por eso está solo en la portada: es el
 * único sitio donde el lector todavía no ha decidido si sigue leyendo.
 *
 * El texto va SIEMPRE en el HTML, con cada palabra en su `<span>`. Si el
 * JavaScript no corre, se ve el titular completo y quieto — nunca a medias.
 */
export function TituloPalabras({ texto, className = '' }: { texto: string; className?: string }) {
  const [listo, setListo] = useState(false)
  useEffect(() => {
    if (quiereQuieto()) { setListo(true); return }
    const t = setTimeout(() => setListo(true), 60)
    return () => clearTimeout(t)
  }, [])

  const palabras = texto.split(' ')
  return (
    <span className={className}>
      {palabras.map((palabra, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom">
          <span
            className="inline-block will-change-transform"
            style={{
              transform: listo ? 'none' : 'translateY(0.9em)',
              opacity: listo ? 1 : 0,
              transition: 'transform 620ms cubic-bezier(0.16,1,0.3,1), opacity 620ms cubic-bezier(0.16,1,0.3,1)',
              // Escalonado corto: con más de 60 ms por palabra un titular de
              // ocho se siente lento, y el lector ya está desplazando.
              transitionDelay: `${i * 55}ms`,
            }}
          >
            {palabra}
          </span>
          {i < palabras.length - 1 && ' '}
        </span>
      ))}
    </span>
  )
}

/**
 * Barrido de luz sobre una cifra, al entrar en pantalla.
 *
 * Va solo en los dos precios. Es el gesto que dice «mira esto» sin escribirlo,
 * y en una propuesta la cifra es justo donde el ojo tiene que parar.
 */
export function Destello({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visto, setVisto] = useState(false)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || quiereQuieto()) return
    if (typeof IntersectionObserver === 'undefined') return

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisto(true); obs.disconnect() }
    }, { threshold: 0.5 })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [])

  return (
    <span ref={ref} className={`prop-destello ${visto ? 'activo' : ''} ${className}`}>
      {children}
    </span>
  )
}

/**
 * Desplazamiento suave del escudo con el recorrido de la página.
 *
 * Muy corto —doce píxeles— y solo en teléfono. Un parallax marcado en una
 * propuesta institucional se siente a novedad; uno apenas perceptible da
 * profundidad sin llamar la atención sobre sí mismo.
 *
 * Usa `scroll()` de CSS cuando existe, que corre fuera del hilo principal. Si
 * no existe, no hay respaldo en JavaScript a propósito: escuchar el scroll
 * para mover un elemento es justo lo que hace que un teléfono se sienta lento.
 */
export function Flotante({ children }: { children: ReactNode }) {
  const [activo, setActivo] = useState(false)
  useEffect(() => {
    if (quiereQuieto() || window.innerWidth >= CORTE_MOVIL) return
    if (!CSS.supports?.('animation-timeline', 'scroll()')) return
    setActivo(true)
  }, [])
  return <span className={activo ? 'prop-flota' : undefined}>{children}</span>
}

/**
 * Contenedor que escalona a sus hijos directos al entrar en pantalla.
 *
 * Existe para las listas largas de la propuesta: sin escalonar, doce viñetas
 * apareciendo a la vez es un parpadeo; escalonadas, el ojo las recorre.
 */
export function Cascada({
  children,
  paso = 70,
  className = '',
}: { children: ReactNode; paso?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dentro, setDentro] = useState(false)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    if (quiereQuieto() || typeof IntersectionObserver === 'undefined') { setDentro(true); return }

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setDentro(true); obs.disconnect() }
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' })
    obs.observe(nodo)

    // Misma red de seguridad que Revelar: si el observador no dispara, el
    // contenido aparece igual.
    const respaldo = setTimeout(() => setDentro(true), 2500)
    return () => { obs.disconnect(); clearTimeout(respaldo) }
  }, [])

  // El escalonado se comprime en teléfono: ahí la fila es una columna y el
  // último elemento llegaría demasiado tarde. Mismo criterio que Revelar.tsx.
  const movil = typeof window !== 'undefined' && window.innerWidth < CORTE_MOVIL
  const salto = movil ? Math.round(paso * 0.5) : paso

  return (
    <div ref={ref} className={className}>
      {Array.isArray(children)
        ? children.map((hijo, i) => (
            <div
              key={i}
              className={`prop-cascada ${dentro ? 'dentro' : ''}`}
              style={{ transitionDelay: `${i * salto}ms` }}
            >
              {hijo}
            </div>
          ))
        : children}
    </div>
  )
}
