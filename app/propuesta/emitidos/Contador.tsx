'use client'

import { useEffect, useState } from 'react'

/**
 * La cifra, viva.
 *
 * Arranca con el número que ya trajo el servidor —así no hay un cero de
 * relleno ni un salto al hidratar— y se refresca sola cada quince segundos.
 * Cuando sube, la cifra destella: es el remate de escanear el código en una
 * reunión y ver que el número se mueve.
 *
 * Deja de consultar si la pestaña pasa a segundo plano. Quince segundos son
 * generosos para algo que cambia unas pocas veces al día, pero dejarlo
 * corriendo en una pestaña olvidada sería consultar la base para nadie.
 */
export default function Contador({ inicial }: { inicial: number }) {
  const [n, setN] = useState(inicial)
  const [subio, setSubio] = useState(false)

  useEffect(() => {
    let vivo = true
    const traer = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await fetch('/propuesta/emitidos/cuenta', { cache: 'no-store' })
        if (!r.ok || !vivo) return
        const { emitidos } = await r.json()
        if (typeof emitidos !== 'number' || !vivo) return
        setN(previo => {
          if (emitidos > previo) {
            setSubio(true)
            setTimeout(() => vivo && setSubio(false), 2000)
          }
          return emitidos
        })
      } catch {
        // Un fallo de red deja la cifra anterior en pantalla. Es preferible a
        // un guion: el número que ya se mostró sigue siendo cierto.
      }
    }
    const id = setInterval(traer, 15000)
    return () => { vivo = false; clearInterval(id) }
  }, [])

  return (
    <p
      className="text-6xl sm:text-8xl font-bold tracking-tight tabular-nums transition-colors duration-500"
      style={{ color: subio ? '#10b981' : '#FFFFFF' }}
    >
      {n.toLocaleString('es-CO')}
    </p>
  )
}
