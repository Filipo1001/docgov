'use client'

/**
 * Revelado al entrar en pantalla.
 *
 * Un IntersectionObserver y una clase; nada de librerías de animación para
 * esto. Si el JavaScript no carga, el contenido se ve igual —la clase base
 * solo lo desplaza y lo atenúa, y el fallback lo restaura— porque una
 * propuesta comercial que no se lee por un script que falló sería un mal
 * negocio.
 *
 * ── En el teléfono la animación se perdía ────────────────────────────────
 *
 * Reportado: «en móvil no es tan marcada». Medido sobre la propuesta real a
 * 375×812: 68 bloques, con una altura mediana de 117 px.
 *
 * Con el ajuste de escritorio —umbral 0,15 y un margen inferior de −60 px— un
 * bloque de esa altura no dispara hasta que su borde superior está a unos
 * 78 px del fondo de la pantalla. A partir de ahí corre una transición de
 * 700 ms. Un desplazamiento con el dedo en un teléfono va a 1.000-1.500 px/s,
 * o sea 700-1.050 px en esos 700 ms: MÁS QUE EL ALTO DE LA PANTALLA. El bloque
 * se sale por arriba antes de terminar de entrar, y lo que el ojo alcanza a
 * ver es un parpadeo a media altura.
 *
 * Por eso en pantallas pequeñas cambia el ajuste: dispara en cuanto el bloque
 * toca el borde inferior —sin margen negativo y con umbral casi cero— y la
 * transición se acorta a 460 ms (en globals.css), con un recorrido mayor. Más
 * corta y más amplia se percibe más, no menos: le da tiempo a completarse
 * mientras el bloque sigue a la vista.
 *
 * El escalonado también se comprime. En escritorio una fila de seis tarjetas
 * entra en cascada; en el teléfono esa misma fila es una columna, y 80 ms por
 * elemento dejaban al último medio segundo tarde —cuando ya nadie lo mira.
 */

/** Ancho a partir del cual se considera escritorio. Coincide con `md:` de Tailwind. */
const CORTE_MOVIL = 768

import { useEffect, useRef, useState, type ReactNode } from 'react'

export default function Revelar({
  children,
  retraso = 0,
  desde = 'abajo',
  className = '',
}: {
  children: ReactNode
  /** Milisegundos de retardo, para escalonar elementos de una misma fila. */
  retraso?: number
  /** Dirección de entrada. Variar el gesto evita que 70 bloques se sientan iguales. */
  desde?: 'abajo' | 'izquierda' | 'zoom'
  className?: string
}) {
  const base = desde === 'izquierda' ? 'revelar-izq' : desde === 'zoom' ? 'revelar-zoom' : 'revelar'
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return

    // Sin soporte, se muestra sin más. Se difiere un tick para no fijar estado
    // de forma síncrona dentro del efecto, que provoca un render en cascada.
    if (typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setVisible(true), 0)
      return () => clearTimeout(t)
    }

    const esMovil = window.innerWidth < CORTE_MOVIL

    // El retardo se escribe en el nodo, no en el estado. Guardarlo en estado
    // obligaría a fijarlo de forma síncrona dentro del efecto —un render en
    // cascada— y además llegaría tarde: tiene que estar puesto ANTES de que la
    // clase `visible` dispare la transición, y aquí eso está garantizado
    // porque el observador todavía no ha llamado a nadie.
    if (retraso) {
      nodo.style.transitionDelay = `${esMovil ? Math.round(retraso * 0.4) : retraso}ms`
    }

    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisible(true)
          obs.disconnect() // una sola vez: reaparecer al subir marea
        }
      },
      esMovil
        // Dispara en cuanto asoma: el recorrido tiene que empezar mientras el
        // bloque todavía tiene pantalla por delante.
        ? { threshold: 0.01, rootMargin: '0px 0px 0px 0px' }
        : { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    )
    obs.observe(nodo)

    // Red de seguridad. Esto es una propuesta comercial que se abre desde el
    // enlace que alguien reenvió: si el observador no llega a disparar —pestaña
    // en segundo plano al abrirse, navegador antiguo, cualquier rareza— el
    // contenido se quedaría invisible, y un documento en blanco delante de un
    // secretario de despacho es mucho peor que perder una animación.
    //
    // Solo alcanza a lo que ya está a la altura de la pantalla: lo que queda
    // más abajo conserva su entrada cuando el lector llegue.
    const respaldo = setTimeout(() => {
      const caja = nodo.getBoundingClientRect()
      if (caja.top < window.innerHeight) {
        setVisible(true)
        obs.disconnect()
      }
    }, 2500)

    return () => { obs.disconnect(); clearTimeout(respaldo) }
  }, [retraso])

  return (
    <div
      ref={ref}
      className={`${base} ${visible ? 'visible' : ''} ${className}`}
      /* El retardo lo escribe el efecto sobre el nodo — ver arriba. Aquí se
         deja el de escritorio como valor inicial para que el HTML del servidor
         ya lo lleve y no haya un salto si el JS tarda en arrancar. */
      style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}
    >
      {children}
    </div>
  )
}
