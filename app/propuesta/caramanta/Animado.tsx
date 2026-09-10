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
 * Titular que se escribe solo, carácter a carácter, como en una máquina de
 * escribir.
 *
 * SIN RIESGO DE PANTALLA EN BLANCO. El texto completo está SIEMPRE en el DOM:
 * una capa invisible lo lleva entero —y de paso reserva el alto final, para
 * que el subtítulo no dé un salto cuando el titular pasa de una a dos líneas—
 * y la capa visible arranca mostrándolo entero también. Solo cuando el efecto
 * confirma que puede animar, la capa visible se vacía y lo teclea de nuevo. Si
 * el script no corre, o el sistema pide menos movimiento, el titular está ahí,
 * quieto y legible. Es el criterio de `Contador.tsx`: el estado por defecto es
 * el resultado final, nunca uno intermedio.
 *
 * El renderizado es una sola cadena que crece con `slice`, no un nodo por
 * letra: barato aunque corra en un teléfono.
 */

/** Ritmo del tecleo. 38 ms da ~2 s en un titular de medio centenar de letras:
 *  se lee como escritura real sin volverse lento. */
const MS_POR_LETRA = 38
/** Espera antes de empezar, para que el tecleo arranque cuando el bloque ya
 *  terminó de aparecer (Revelar dura ~460 ms en móvil). */
const ESPERA_INICIAL_MS = 340

export function TituloEscribe({ texto, className = '' }: { texto: string; className?: string }) {
  // `null` = quieto, con el texto completo. Cualquier número = tecleando.
  const [n, setN] = useState<number | null>(null)

  useEffect(() => {
    if (quiereQuieto()) return
    let id: ReturnType<typeof setInterval> | undefined
    const arranque = setTimeout(() => {
      let i = 0
      setN(0)
      id = setInterval(() => {
        i += 1
        setN(i)
        if (i >= texto.length && id) clearInterval(id)
      }, MS_POR_LETRA)
    }, ESPERA_INICIAL_MS)
    return () => { clearTimeout(arranque); if (id) clearInterval(id) }
  }, [texto])

  const tecleando = n !== null && n < texto.length
  const visible = n === null ? texto : texto.slice(0, n)

  return (
    <span className={`relative block ${className}`}>
      {/* Reserva el alto final. Sin esto, el subtítulo salta al pasar el
          titular de una línea a dos mientras se escribe. */}
      <span aria-hidden="true" className="invisible">{texto}</span>
      <span className="absolute inset-0" aria-label={texto}>
        {visible}
        {tecleando && <span aria-hidden="true" className="prop-cursor" style={{ color: '#8FD4C2' }} />}
      </span>
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

/**
 * Tarjeta de "señal" del diagnóstico: se voltea al tocarla.
 *
 * FRENTE — el problema en una línea. DORSO — la frase completa.
 *
 * DEGRADA POR CAPAS. El giro 3D entra por `@supports (transform-style:
 * preserve-3d)`; sin él, o con «reducir movimiento», el toque intercambia la
 * cara sin animación. Las dos caras están SIEMPRE en el DOM: sin JavaScript se
 * ve el frente y el dorso queda accesible, nunca una tarjeta vacía. El estado
 * por defecto —frente visible— es el que sale en el HTML del servidor.
 *
 * EL ROJO. La página es menta pastel; el rojo es su complementario y estas
 * seis son avisos. El frente lleva un velo rojo muy tenue, el número y la
 * pista en rojo; el dorso invierte a rojo pleno con texto blanco, que remata
 * el «esto es un problema». Nada estridente: ladrillo, no bombero.
 */
const ROJO = '#C84B4B'

export function TarjetaSenal({ frente, dorso }: { frente: string; dorso: string }) {
  const [volteada, setVolteada] = useState(false)

  return (
    <button
      type="button"
      onClick={() => setVolteada(v => !v)}
      aria-pressed={volteada}
      className="senal block w-full text-left"
    >
      <span className={`senal-giro ${volteada ? 'girado' : ''}`}>
        {/* Frente: solo el título. Sin número, sin icono, sin instrucción —
            el título es el protagonista. Un filete rojo corto lo encabeza,
            eco del de la portada, para que la tarjeta se lea como un aviso. */}
        <span className="senal-cara senal-cara--frente" aria-hidden={volteada}>
          <span className="block h-[3px] w-8 rounded-full" style={{ backgroundColor: ROJO }} />
          <span className="mt-auto mb-auto block text-xl sm:text-2xl font-bold leading-tight text-gray-900">
            {frente}
          </span>
        </span>

        {/* Dorso: la frase completa, rojo pleno. */}
        <span className="senal-cara senal-cara--dorso" aria-hidden={!volteada}>
          <span className="mt-auto mb-auto block text-[15px] sm:text-base leading-relaxed text-white">
            {dorso}
          </span>
        </span>
      </span>
    </button>
  )
}
