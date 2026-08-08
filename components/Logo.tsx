/**
 * Logotipo de Contratista Digital.
 *
 * Los trazados son los del archivo vectorial oficial (`public/marca/logo.svg`),
 * no un redibujo. Antes este componente aproximaba la forma a mano y ponía las
 * iniciales con un elemento <text>, lo que las dejaba a merced de la fuente
 * disponible en cada equipo: en un Windows sin la tipografía del sistema
 * previsto, el logo salía con otra letra. Ahora las letras son contornos y se
 * ven idénticas en todas partes.
 *
 * La forma es una carpeta con la pestaña arriba a la izquierda —el objeto que
 * este producto sustituye— con las iniciales caladas.
 *
 * INVERSIÓN. Los dos trazados se pintan del mismo color a propósito. El primero
 * dibuja la carpeta y descuenta la C y la silueta de la D; el segundo rellena
 * el ojo de la D, que debe ser del color de la carpeta y no del fondo. Como
 * ambos siguen a `color`, pasar blanco sobre una superficie oscura invierte el
 * logo correctamente, sin necesidad de un segundo archivo.
 */

import { MARCA } from '@/lib/marca'

/** Proporción del original: 865.92 × 898.2. El alto manda. */
const RELACION = 865.92 / 898.2

/** Carpeta exterior, con la C y la silueta de la D descontadas. */
const TRAZO_CARPETA =
  'M815.85,832.56c-33.67,39-82.15,65.21-134.04,65.25l-493.66.39c-62.42.05-120.87-35.18-154.36-87.12C12.67,778.34.11,739.6.1,699.96L0,134.27c0-25.19,9.92-48.75,24.97-68.04,15.54-19.92,33.11-36.88,53.4-51.57C91.66,5.02,106.39-.02,123.04,0l181.72.19c14.88.02,27.94,5.44,39.7,13.31l41.74,37.32c5.71,5.1,13.84,7.58,21.91,7.58l318.95.25c30.18.02,58.74,11.88,82.2,30.02,36.94,28.57,56.69,72.99,56.66,119.56l-.37,492.78c-.04,48.12-18.18,95.04-49.7,131.54ZM319.91,528.58c-25.71.42-47.1-16.01-53.41-41.35-6.09-24.47-6-50.78.08-75.25,6.2-24.95,27.05-40.95,52.35-41.26,13.49-.54,26.11,3.34,36.22,12.14,7.7,7.35,12.36,16.78,14.74,26.93l46.01-10.67c-6.59-28.84-26.12-52.04-54.26-61.8-30.87-10.71-65.47-8.69-94.16,7.38-48.84,27.35-59.68,90.09-49.21,141.97,6.11,30.28,24.64,55.7,51.71,70.25,15.24,8.19,31.65,11.29,48.92,11.36,52.33.2,83.07-23.98,97.49-74.09l-45.32-13.67c-6.1,28.41-21.99,47.83-51.16,48.06ZM648.46,413.52c-7.65-38.67-31.57-69.61-71.48-76.57-12.44-2.01-24.33-2.03-37.15-2.03l-82.41-.02.03,229.83,101.41-.33c18.74-.06,35.95-5.09,51.45-14.85,40.59-28.46,47.2-90.25,38.15-136.03Z'

/** Ojo de la D: se rellena del color de la carpeta para abrir el contorno. */
const TRAZO_OJO_D =
  'M600.04,413.13c6.6,29.26,8.18,85.21-16.84,104.26-9.24,5.69-19.55,8.23-30.56,8.3l-48.87.32-.06-151.95,46.07.24c12,.06,23.13,3.24,32.89,10.06,8.84,7.33,14.75,17.1,17.38,28.77Z'

interface Props {
  /** Alto en píxeles. El ancho se deduce de la proporción original. */
  size?: number
  /** Tinta del logotipo. 'currentColor' hereda del contenedor. */
  color?: string
  className?: string
}

/** Isotipo: la carpeta con las iniciales. */
export function LogoCD({ size = 32, color = MARCA, className }: Props) {
  return (
    <svg
      width={Math.round(size * RELACION)}
      height={size}
      viewBox="0 0 865.92 898.2"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Contratista Digital"
    >
      <path d={TRAZO_CARPETA} fill={color} />
      <path d={TRAZO_OJO_D} fill={color} />
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
  colorNombre,
  subtitulo,
  className,
}: Props & { colorNombre?: string; subtitulo?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <LogoCD size={size} color={color} />
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
