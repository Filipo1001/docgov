'use client'

/**
 * Botón de contacto que registra el clic.
 *
 * Es el único punto de conversión del sitio: la distancia entre "visitas" y
 * "clics" es el número que dice si la página convence o solo se ve bien. Sin
 * esto, medir el tráfico no sirve para decidir nada.
 *
 * `origen` distingue desde qué bloque se pulsó, para saber si convence la
 * portada o hay que leer hasta el cierre.
 */

import { track } from '@vercel/analytics'

interface Props {
  href: string
  origen: 'portada' | 'cierre' | 'pie'
  className: string
  children: React.ReactNode
}

export default function BotonContacto({ href, origen, className, children }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => track('contacto_whatsapp', { origen })}
    >
      {children}
    </a>
  )
}
