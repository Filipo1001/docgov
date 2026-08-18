'use client'

/**
 * components/EnvioInforme.tsx — Confirmación del envío del informe.
 *
 * QUÉ SE APRENDIÓ DEL INTENTO ANTERIOR. La primera versión contaba demasiado:
 * tarjetas de documentos entrando a una carpeta, inventario con cifras, cuatro
 * piezas desfilando. Para una espera de dos segundos era ruido. Aquí solo hay
 * tres cosas: el logotipo, el anillo que ya se usa en las subidas de archivo, y
 * un check al terminar.
 *
 * SIN ICONOGRAFÍA, A PROPÓSITO. El único símbolo es el logotipo. No hay iconos
 * de documento ni de periodo: en una pantalla que dura dos segundos, cada
 * elemento extra compite con el que importa.
 *
 * EL ANILLO ES EL MISMO DE LAS SUBIDAS. Mismo radio, mismo grosor, mismo arco
 * del 28 %, misma vuelta de 1,1 s (ver components/ui/SubiendoArchivo.tsx). Que
 * esperar por un envío se parezca a esperar por un archivo no es pereza: es lo
 * que hace que la aplicación se sienta una sola.
 *
 * EL CHECK SE DIBUJA. Un glifo que aparece se lee como un estado más; un trazo
 * que se traza se lee como algo que acaba de suceder. Por eso no sale del
 * catálogo —Lucide no permite animar el trazo— y su keyframe vive en
 * globals.css, con el resto del sistema.
 */

import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'

const R = 40
const CIRCUNFERENCIA = 2 * Math.PI * R

export type VarianteEnvio = 'sello' | 'releva'

export default function EnvioInforme({
  abierto,
  completado,
  error,
  variante = 'sello',
  onCerrar,
}: {
  abierto: boolean
  /** true solo cuando el envío terminó de verdad. */
  completado: boolean
  error?: string | null
  /**
   * `sello`  — el logotipo se queda y el check lo firma en una esquina.
   * `releva` — el logotipo cede su sitio y el check ocupa el centro.
   */
  variante?: VarianteEnvio
  onCerrar: () => void
}) {
  if (!abierto) return null

  const listo = completado && !error

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm upload-overlay-enter"
      role="status"
      aria-live="polite"
      aria-label={error ? 'Error al enviar el informe' : listo ? 'Informe enviado' : 'Enviando el informe'}
    >
      <div className="bg-white rounded-3xl px-10 py-8 flex flex-col items-center gap-5 shadow-2xl mx-6 w-full max-w-xs upload-card-enter">

        <div className="relative w-24 h-24">
          {/* Carril fijo */}
          <svg className="absolute inset-0 w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
            <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          </svg>

          {/* Anillo: gira mientras dura; al terminar se cierra en verde. */}
          <div className="absolute inset-0 -rotate-90">
            {listo ? (
              <svg className="w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
                <circle
                  cx="48" cy="48" r={R}
                  fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={CIRCUNFERENCIA}
                  className="anillo-cierre"
                />
              </svg>
            ) : (
              <div
                className="w-full h-full animate-spin motion-reduce:animate-none"
                style={{ animationDuration: '1.1s', animationTimingFunction: 'linear' }}
              >
                <svg className="w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
                  <circle
                    cx="48" cy="48" r={R}
                    fill="none" stroke={error ? '#d1d5db' : MARCA} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${CIRCUNFERENCIA * 0.28} ${CIRCUNFERENCIA * 0.72}`}
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Centro */}
          <div className="absolute inset-0 flex items-center justify-center">
            {listo && variante === 'releva' ? (
              // Grande a propósito: en esta variante el check ES la
              // confirmación, no un adorno junto a ella.
              <Check tamano={54} />
            ) : (
              <div
                className={`transition-all duration-300 ${listo ? 'scale-95' : 'scale-100'}`}
                style={{ opacity: error ? 0.35 : 1 }}
              >
                <LogoCD size={42} color={MARCA} />
              </div>
            )}
          </div>

          {/* Sello en la esquina, solo en la variante que conserva el logotipo */}
          {listo && variante === 'sello' && (
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-md sello-entra">
              <Check tamano={18} color="#FFFFFF" />
            </div>
          )}
        </div>

        <div className="text-center">
          {error ? (
            <>
              <p className="text-sm font-medium text-gray-900">No se pudo enviar</p>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={onCerrar}
                className="mt-4 px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Cerrar
              </button>
            </>
          ) : (
            <p className="text-sm font-medium text-gray-900">
              {listo ? 'Informe enviado a revisión' : 'Enviando tu informe'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Check dibujado. Ver la nota del encabezado sobre por qué no es un icono. */
function Check({ tamano, color = '#10b981' }: { tamano: number; color?: string }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5 L10 17.5 L19 7"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="34"
        className="check-trazo"
      />
    </svg>
  )
}
