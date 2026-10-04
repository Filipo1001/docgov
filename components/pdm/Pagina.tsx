import type { ReactNode } from 'react'

/**
 * La raíz de cada pantalla del módulo: el ancho, el ritmo vertical y la ENTRADA.
 *
 * El contenido de una pantalla llega con un cruce corto y un asomo de subida (`pdm-entra`). Va aquí, en la
 * pantalla, y no en el marco: así la barra de arriba no se mueve NUNCA al navegar, y la entrada ocurre cuando
 * llegan los datos (justo después del esqueleto) y no cuando se pulsó el enlace.
 *
 * Es de presentación pura: sirve igual desde el servidor que desde el navegador.
 */
export default function Pagina({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`pdm-entra mx-auto max-w-7xl space-y-5 ${className}`}>{children}</div>
}
