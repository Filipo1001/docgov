'use client'

/**
 * Barra de avance de lectura, fija arriba.
 *
 * La propuesta es larga y se abre desde un enlace: sin ninguna referencia, no
 * se sabe si quedan dos secciones o diez, y eso hace abandonar. Una línea de
 * dos píxeles lo resuelve sin ocupar sitio ni pedir atención.
 */

import { useEffect, useState } from 'react'

export default function ProgresoScroll({ color }: { color: string }) {
  const [pct, setPct] = useState(0)

  useEffect(() => {
    const calcular = () => {
      const alto = document.documentElement.scrollHeight - window.innerHeight
      setPct(alto > 0 ? Math.min(100, (window.scrollY / alto) * 100) : 0)
    }
    calcular()
    window.addEventListener('scroll', calcular, { passive: true })
    window.addEventListener('resize', calcular)
    return () => {
      window.removeEventListener('scroll', calcular)
      window.removeEventListener('resize', calcular)
    }
  }, [])

  return (
    <div className="progreso-scroll fixed top-0 left-0 right-0 h-0.5 z-50 bg-transparent" aria-hidden="true">
      <div
        className="h-full transition-[width] duration-150 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}
