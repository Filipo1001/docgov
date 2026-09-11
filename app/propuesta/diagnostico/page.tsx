import type { Metadata } from 'next'
import Diagnostico from './Diagnostico'

/**
 * Qué dice ESTE teléfono. Página desechable.
 *
 * Se reportó que en un iPhone real no corre ninguna animación del folleto,
 * mientras que en el modo responsive del Mac sí. Ese contraste apunta a
 * `prefers-reduced-motion` —el modo responsive lo resuelve contra los ajustes
 * del Mac, no contra los del teléfono— pero ya di un diagnóstico sin prueba y
 * salió equivocado, así que esta vez pregunta el aparato en vez de yo suponer.
 *
 * Las dos cajas son el corazón de la prueba: la misma animación, una sin
 * condición y otra respetando «reducir movimiento» como hace el folleto. Si la
 * primera se mueve y la segunda no, la causa queda demostrada sin que nadie
 * tenga que rebuscar en los ajustes del sistema.
 */

export const metadata: Metadata = {
  title: 'Diagnóstico',
  robots: { index: false, follow: false },
}

export default function DiagnosticoPage() {
  return <Diagnostico />
}
