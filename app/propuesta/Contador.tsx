'use client'

/**
 * Cifra que cuenta hasta su valor al entrar en pantalla.
 *
 * En una propuesta donde los números son el argumento, verlos subir hace que
 * se lean: un dato quieto se salta, uno que se mueve detiene el ojo el segundo
 * que hace falta para registrarlo.
 *
 * ── EL ESTADO ARRANCA EN EL VALOR FINAL, NO EN CERO ──────────────────────
 *
 * Esta es la decisión que gobierna el componente. La primera versión partía de
 * cero y contaba hacia arriba, de modo que CUALQUIER cosa que impidiera animar
 * dejaba un cero en pantalla — y pasó: un `useState` en las dependencias del
 * efecto lo reejecutaba al arrancar, su limpieza cancelaba el fotograma, y la
 * sección titulada «no es una promesa, son cifras» mostraba seis ceros.
 *
 * Ahora el número correcto está ahí desde el primer render, incluido el HTML
 * que llega del servidor. Solo se baja a cero dentro del primer fotograma de
 * la animación —es decir, cuando ya hay constancia de que se está pintando— y
 * con el bloque entrando en pantalla, todavía sin verse. Si el observador no
 * dispara, si el navegador es viejo, si la pestaña está en segundo plano y
 * `requestAnimationFrame` no corre: no pasa nada, la cifra ya era la buena.
 *
 * El fallo por defecto pasa de «un cero» a «un número sin animar», que en un
 * documento comercial no es un fallo en absoluto.
 */

import { useEffect, useRef, useState } from 'react'

const MS_DURACION = 1100

/** Suaviza el final: rápido al principio, se posa en el valor. */
function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export default function Contador({
  valor,
  className = '',
}: {
  /** Valor final. Se formatea con separador de miles en español. */
  valor: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // Referencia y no estado: fijar estado aquí reejecutaría el efecto, y su
  // limpieza cancelaría la animación que acaba de empezar.
  const usado = useRef(false)
  const [n, setN] = useState(valor)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return

    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducido || typeof IntersectionObserver === 'undefined') return

    // Si el bloque ya está a la vista al cargar, no se anima: bajarlo a cero
    // delante de alguien que lo está mirando se vería como un parpadeo.
    if (nodo.getBoundingClientRect().top < window.innerHeight) return

    let cuadro = 0
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || usado.current) return
        usado.current = true
        obs.disconnect()

        // El cero vive dentro del primer fotograma, no antes de pedirlo. Así,
        // si `requestAnimationFrame` no llega a correr —pestaña en segundo
        // plano, que es justo donde no corre— la cifra nunca se baja a cero:
        // se queda en su valor y sencillamente no se anima.
        let inicio = 0
        const paso = (ahora: number) => {
          if (!inicio) inicio = ahora
          const t = Math.min(1, (ahora - inicio) / MS_DURACION)
          setN(Math.round(valor * suavizar(t)))
          if (t < 1) cuadro = requestAnimationFrame(paso)
        }
        cuadro = requestAnimationFrame(paso)
      },
      { threshold: 0.4 },
    )
    obs.observe(nodo)

    return () => {
      obs.disconnect()
      cancelAnimationFrame(cuadro)
      // Si se desmonta a mitad de la cuenta, queda el valor bueno.
      setN(valor)
    }
  }, [valor])

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {n.toLocaleString('es-CO')}
    </span>
  )
}
