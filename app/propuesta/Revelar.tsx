'use client'

/**
 * Revelado al entrar en pantalla.
 *
 * Un IntersectionObserver y una clase; nada de librerías de animación para
 * esto. Si el JavaScript no carga, el contenido se ve igual —la clase base
 * solo lo desplaza y lo atenúa, y el fallback lo restaura— porque una
 * propuesta comercial que no se lee por un script que falló sería un mal
 * negocio.
 */

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

    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisible(true)
          obs.disconnect() // una sola vez: reaparecer al subir marea
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
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
  }, [])

  return (
    <div
      ref={ref}
      className={`${base} ${visible ? 'visible' : ''} ${className}`}
      style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}
    >
      {children}
    </div>
  )
}
