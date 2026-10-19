'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Un número que CUENTA hasta su valor: la primera vez desde cero y, cuando el valor cambia (otro año, otra medida), desde donde
 * estaba. Sirve para que una cifra grande se sienta como una cantidad que crece y no como un número que aparece.
 *
 * Quien pide menos movimiento (`prefers-reduced-motion`), o una pestaña oculta (donde los temporizadores se frenan), recibe el
 * valor final sin animación. El último paso siempre deja el valor exacto: un contador nunca se queda a medias.
 */
export function useContador(objetivo: number, duracion = 800): number {
  const [valor, setValor] = useState(0)
  const desde = useRef(0)

  useEffect(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.visibilityState === 'hidden' || duracion <= 0
    if (quieto) {
      const id = setTimeout(() => { desde.current = objetivo; setValor(objetivo) }, 0)
      return () => clearTimeout(id)
    }
    const inicio = desde.current
    const t0 = performance.now()
    let id: ReturnType<typeof setTimeout>
    const paso = () => {
      const k = Math.min(1, (performance.now() - t0) / duracion)
      const v = k >= 1 ? objetivo : inicio + (objetivo - inicio) * (1 - Math.pow(1 - k, 3))
      desde.current = v
      setValor(v)
      if (k < 1) id = setTimeout(paso, 16)
    }
    id = setTimeout(paso, 0)
    // Red de seguridad: pase lo que pase con los temporizadores, el valor final es el exacto.
    const fin = setTimeout(() => { desde.current = objetivo; setValor(objetivo) }, duracion + 150)
    return () => { clearTimeout(id); clearTimeout(fin) }
  }, [objetivo, duracion])

  return valor
}
