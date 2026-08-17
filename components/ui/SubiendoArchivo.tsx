'use client'

/**
 * components/ui/SubiendoArchivo.tsx — El único indicador de subida de archivos.
 *
 * POR QUÉ EXISTE. La aplicación tiene DOCE puntos de carga —evidencias, foto,
 * planilla, factura, firmas, documentos del contrato, importación de Excel…— y
 * cada uno resolvía la espera a su manera: unos con esta capa, la mayoría con
 * un simple «Subiendo…», alguno con un spinner suelto. Subir un archivo se
 * sentía como doce productos distintos.
 *
 * El anillo de progreso venía del detalle del periodo, donde funcionaba bien.
 * Aquí se promueve a componente compartido y se le corrigen dos cosas que
 * contradecían el sistema de diseño:
 *
 *   · El arco era azul (#2563eb). La marca es #192031 y lib/iconos.ts es
 *     explícito: el color solo aparece cuando significa estado, nunca como
 *     decoración. Un archivo subiendo no es un estado de error ni de éxito.
 *
 *   · El icono del centro era un <svg> dibujado a mano dentro de la pantalla,
 *     justo lo que la regla 1 del catálogo prohíbe. Ahora se recibe del
 *     catálogo, y además cambia según QUÉ se está subiendo.
 *
 * SIN PORCENTAJE, A PROPÓSITO. Solo tres de los doce puntos conocen los bytes
 * —los que suben por XMLHttpRequest—, así que un diseño con número dejaba nueve
 * pantallas viéndose de segunda. Y un porcentaje que salta de 0 a 100 porque el
 * archivo era pequeño informa menos que un anillo girando: promete una
 * precisión que el sistema no tiene en la mayoría de los casos. Un solo
 * comportamiento para los doce es justamente lo que se venía a arreglar.
 */

import Icono from '@/components/ui/Icono'
import { MARCA, CLASES_MARCA } from '@/lib/marca'
import type { LucideIcon } from '@/lib/iconos'

const R = 40
const CIRCUNFERENCIA = 2 * Math.PI * R

export default function SubiendoArchivo({
  abierto,
  icono,
  etiqueta,
  detalle,
}: {
  abierto: boolean
  /** Icono del catálogo que representa lo que se sube. */
  icono: LucideIcon
  /** «Subiendo planilla», «Subiendo 3 imágenes»… sin puntos suspensivos. */
  etiqueta: string
  /** Segunda línea opcional, para advertencias como «No cierres esta página». */
  detalle?: string
}) {
  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm upload-overlay-enter"
      role="status"
      aria-live="polite"
      aria-label={etiqueta}
    >
      <div className="bg-white rounded-3xl px-10 py-8 flex flex-col items-center gap-5 shadow-2xl mx-6 w-full max-w-xs upload-card-enter">

        <div className="relative w-24 h-24">
          {/* Carril fijo */}
          <svg className="absolute inset-0 w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
            <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          </svg>

          {/* Arco que gira, igual en los doce puntos. */}
          <div className="absolute inset-0 -rotate-90">
            <div
              className="w-full h-full animate-spin motion-reduce:animate-none"
              style={{ animationDuration: '1.1s', animationTimingFunction: 'linear' }}
            >
              <svg className="w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
                <circle
                  cx="48" cy="48" r={R}
                  fill="none" stroke={MARCA} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${CIRCUNFERENCIA * 0.28} ${CIRCUNFERENCIA * 0.72}`}
                />
              </svg>
            </div>
          </div>

          {/* El icono dice QUÉ se sube, y no se va cuando hay porcentaje. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Icono glifo={icono} tamano="lg" className={CLASES_MARCA.texto} />
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">{etiqueta}</p>
          {detalle && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{detalle}</p>}
        </div>
      </div>
    </div>
  )
}
