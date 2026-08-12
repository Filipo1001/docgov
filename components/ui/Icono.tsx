/**
 * components/ui/Icono.tsx — El único componente que pinta un icono.
 *
 * Envuelve a Lucide para que la escala y el grosor no sean decisiones que se
 * tomen pantalla por pantalla. Se le pasa un tamaño del sistema (`sm`, `md`,
 * `lg`) y él resuelve píxeles y trazo.
 *
 * ACCESIBILIDAD. Por defecto el icono es decorativo: se marca `aria-hidden` y
 * el lector de pantalla lo ignora, porque el significado lo lleva la etiqueta
 * de al lado. Cuando el icono va solo —un botón que solo muestra una papelera—
 * hay que pasarle `etiqueta`, y entonces sí se anuncia. Es deliberado que
 * cueste lo mismo hacerlo bien que hacerlo mal.
 */

import { TAMANOS, type TamanoIcono, type LucideIcon } from '@/lib/iconos'

interface Props {
  /** Icono del catálogo: `Iconos.navegacion.contratos`. */
  glifo: LucideIcon
  /** sm = 16 · md = 20 · lg = 24. Por defecto md. */
  tamano?: TamanoIcono
  /**
   * Nombre accesible. Solo cuando el icono va SIN etiqueta visible; si hay
   * texto al lado, omitirlo — repetirlo duplica el anuncio.
   */
  etiqueta?: string
  className?: string
}

export default function Icono({ glifo: Glifo, tamano = 'md', etiqueta, className }: Props) {
  const { size, strokeWidth } = TAMANOS[tamano]
  return (
    <Glifo
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={etiqueta ? undefined : true}
      aria-label={etiqueta}
      role={etiqueta ? 'img' : undefined}
    />
  )
}
