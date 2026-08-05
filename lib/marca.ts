/**
 * Identidad visual de Contratista Digital.
 *
 * El color de marca sale del logotipo: #131B2B, un azul tan oscuro que lee
 * como grafito. Es una elección deliberadamente institucional — el público de
 * este producto son alcaldías y entes de control, no usuarios de una app de
 * consumo — y encaja con lo que la interfaz ya hacía: `gray-900` aparecía 58
 * veces frente a 11 del azul, así que la marca formaliza una dirección que el
 * sistema ya llevaba, en lugar de imponer uuna nueva.
 *
 * Se centraliza aquí para que el día que cambie un tono no haya que perseguirlo
 * por las pantallas.
 */

/** Tinta de la marca, muestreada del logotipo. */
export const MARCA = '#131B2B'

/** Un punto más claro, para superficies interactivas sobre la tinta. */
export const MARCA_CLARA = '#1E2A3F'

/** Fondo del logotipo original: prácticamente blanco. */
export const MARCA_FONDO = '#FDFDFE'

/**
 * Equivalentes en Tailwind, para no mezclar estilos en línea con clases.
 *
 * `gray-900` (#111827) está a un pelo de la tinta de marca, así que las
 * pantallas que ya lo usaban no necesitan tocarse: la diferencia no es
 * perceptible y repintarlas solo añadiría ruido al historial.
 */
export const CLASES_MARCA = {
  fondo: 'bg-[#131B2B]',
  fondoHover: 'hover:bg-[#1E2A3F]',
  texto: 'text-[#131B2B]',
  borde: 'border-[#131B2B]',
} as const
