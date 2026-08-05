/**
 * Logotipo de Contratista Digital, redibujado como SVG.
 *
 * El archivo de marca llegó en PNG con fondo blanco. Servía para verlo, pero no
 * para la interfaz: sobre cualquier superficie que no sea blanca aparece un
 * recuadro, y al escalarlo a 24 px se ve sucio. Redibujarlo en vectores resuelve
 * las dos cosas y de paso da la versión monocromática y la transparente sin
 * pedir archivos nuevos.
 *
 * La forma es una carpeta con la pestaña arriba a la izquierda —el objeto que
 * este producto sustituye— con las iniciales dentro.
 *
 * `color="currentColor"` permite invertirlo: sobre la barra lateral oscura se
 * pinta en blanco heredando el color del contenedor, sin un segundo archivo.
 */

import { MARCA } from '@/lib/marca'

interface Props {
  /** Lado del cuadrado, en píxeles. */
  size?: number
  /** Tinta de la carpeta. 'currentColor' hereda del contenedor. */
  color?: string
  /** Color de las iniciales. Por defecto, blanco. */
  colorTexto?: string
  className?: string
}

/** Isotipo: solo la carpeta con las iniciales. */
export function LogoCD({ size = 32, color = MARCA, colorTexto = '#FFFFFF', className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Contratista Digital"
    >
      <path
        d="M22 14 L36 14 L46 24 L78 24 A14 14 0 0 1 92 38 L92 78 A14 14 0 0 1 78 92 L22 92 A14 14 0 0 1 8 78 L8 28 A14 14 0 0 1 22 14 Z"
        fill={color}
      />
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fill={colorTexto}
        fontSize="30"
        fontWeight="700"
        letterSpacing="-1"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
      >
        CD
      </text>
    </svg>
  )
}

/**
 * Versión horizontal: isotipo + nombre.
 *
 * Para cabeceras donde el logo va acompañado del nombre escrito, de modo que
 * ambos compartan alineación y proporción en vez de montarse a ojo cada vez.
 */
export function LogoHorizontal({
  size = 36,
  color = MARCA,
  colorTexto = '#FFFFFF',
  colorNombre,
  subtitulo,
  className,
}: Props & { colorNombre?: string; subtitulo?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <LogoCD size={size} color={color} colorTexto={colorTexto} />
      <div className="min-w-0 leading-tight">
        <p
          className="font-bold tracking-tight truncate"
          style={{ color: colorNombre ?? MARCA, fontSize: size * 0.44 }}
        >
          Contratista Digital
        </p>
        {subtitulo && (
          <p className="text-xs text-gray-500 truncate">{subtitulo}</p>
        )}
      </div>
    </div>
  )
}
