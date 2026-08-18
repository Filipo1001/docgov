'use client'

/**
 * Cifra que cuenta hasta su valor al entrar en pantalla.
 *
 * En una propuesta donde los números son el argumento, verlos subir hace que
 * se lean: un dato quieto se salta, uno que se mueve detiene el ojo el segundo
 * que hace falta para registrarlo.
 *
 * El valor final se escribe también en el DOM desde el primer render (en un
 * nodo accesible) para que un lector de pantalla —y un buscador, si algún día
 * la página se indexara— reciba la cifra real y no un cero animándose.
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
  const [n, setN] = useState(0)
  const [arrancado, setArrancado] = useState(false)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || arrancado) return

    // Sin observador, o con movimiento reducido, se muestra el valor final.
    // Se difiere un tick para no fijar estado de forma síncrona dentro del
    // efecto, que provoca un render en cascada.
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (typeof IntersectionObserver === 'undefined' || reducido) {
      const t = setTimeout(() => { setN(valor); setArrancado(true) }, 0)
      return () => clearTimeout(t)
    }

    let cuadro = 0
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        obs.disconnect()
        setArrancado(true)
        const inicio = performance.now()
        const paso = (ahora: number) => {
          const t = Math.min(1, (ahora - inicio) / MS_DURACION)
          setN(Math.round(valor * suavizar(t)))
          if (t < 1) cuadro = requestAnimationFrame(paso)
        }
        cuadro = requestAnimationFrame(paso)
      },
      { threshold: 0.4 },
    )
    obs.observe(nodo)

    // Red de seguridad: si el observador no llega a disparar —pestaña en
    // segundo plano al abrirse, navegador antiguo— la cifra se muestra igual.
    // Un número en cero delante de un secretario sería peor que no animarlo.
    const respaldo = setTimeout(() => {
      if (nodo.getBoundingClientRect().top < window.innerHeight) {
        obs.disconnect()
        setN(valor)
        setArrancado(true)
      }
    }, 2500)

    return () => {
      obs.disconnect()
      cancelAnimationFrame(cuadro)
      clearTimeout(respaldo)
    }
  }, [valor, arrancado])

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true" className="tabular-nums">{n.toLocaleString('es-CO')}</span>
      <span className="sr-only">{valor.toLocaleString('es-CO')}</span>
    </span>
  )
}
