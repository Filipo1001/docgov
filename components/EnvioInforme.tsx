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
 * SIN ICONOGRAFÍA, A PROPÓSITO. El único símbolo es el logotipo.
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
 *
 * ── LOS TIEMPOS VIVEN AQUÍ DENTRO ────────────────────────────────────────
 *
 * El componente gestiona su propio ritmo y su propio cierre. Quien lo usa solo
 * dice qué está pasando —en curso, listo, falló— y no puede equivocarse con los
 * temporizadores. En la versión anterior esa lógica estaba repartida entre el
 * componente y la pantalla que lo llamaba, y de ahí salieron dos fallos reales:
 * un aviso de lentitud que se disparaba en envíos correctos, y temporizadores
 * que no se limpiaban porque su `return` estaba dentro de una callback.
 */

import { useEffect, useRef, useState } from 'react'
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'

const R = 40
const CIRCUNFERENCIA = 2 * Math.PI * R

/** Un destello se percibe peor que no mostrar nada. */
const MS_MINIMO = 1100
/** Margen para que el check se dibuje y se lea antes de cerrar. */
const MS_TRAS_CHECK = 1200
/**
 * Umbral del aviso de lentitud. Ocho segundos y no cinco: en móvil con señal
 * irregular —y en el último periodo, donde además se generó el PDF del acta de
 * terminación— pasar de cinco segundos es normal.
 */
const MS_AVISO_LENTITUD = 8000
/**
 * A partir de aquí se ofrece cerrar a mano.
 *
 * Red de seguridad, no un plazo esperado: una capa a pantalla completa que
 * depende de que alguien le diga que terminó puede quedarse puesta para
 * siempre si ese aviso no llega —ya pasó una vez, por una consulta del
 * navegador colgada—, y entonces la única salida era recargar. El envío en sí
 * no se cancela: ya viajó al servidor. Esto solo devuelve el control de la
 * pantalla.
 */
const MS_ESCAPE = 20000

export default function EnvioInforme({
  abierto,
  completado,
  error,
  onCerrar,
}: {
  abierto: boolean
  /** true SOLO cuando el servidor confirmó el envío. NO esperar a recargar
   *  la pantalla: atarlo a una consulta del navegador —que no tiene timeout—
   *  es lo que dejaba esta capa puesta indefinidamente. */
  completado: boolean
  error?: string | null
  onCerrar: () => void
}) {
  const [sellado, setSellado] = useState(false)
  const [lento, setLento] = useState(false)
  const [escape, setEscape] = useState(false)
  const abiertoDesde = useRef(0)

  // `onCerrar` llega como función anónima y cambia de identidad en cada render
  // del padre. Tenerla como dependencia reiniciaba el efecto sin parar y sus
  // temporizadores se cancelaban y recreaban indefinidamente.
  const cerrarRef = useRef(onCerrar)
  useEffect(() => { cerrarRef.current = onCerrar }, [onCerrar])

  // Reinicio al abrir o cerrar, ajustando el estado durante el render.
  //
  // Es el patrón que React documenta para «estado derivado de props», y no un
  // atajo: hacerlo dentro de un efecto provoca un render de más con los valores
  // viejos —el check del envío anterior alcanzaría a verse un instante al abrir
  // el siguiente— además de que el linter lo marca con razón.
  const [previoAbierto, setPrevioAbierto] = useState(abierto)
  if (abierto !== previoAbierto) {
    setPrevioAbierto(abierto)
    setSellado(false)
    setLento(false)
    setEscape(false)
  }

  // Marca de apertura y aviso de lentitud. El reloj se lee aquí y no en el
  // render: leer la hora durante el render es impuro y da un valor distinto en
  // cada pasada. Este efecto se declara ANTES que el de cierre, así que la
  // marca ya está puesta cuando aquel calcula cuánto falta para el mínimo.
  useEffect(() => {
    if (!abierto) return
    abiertoDesde.current = Date.now()
    const tLento = setTimeout(() => setLento(true), MS_AVISO_LENTITUD)
    const tEscape = setTimeout(() => setEscape(true), MS_ESCAPE)
    return () => { clearTimeout(tLento); clearTimeout(tEscape) }
  }, [abierto])

  // Cierre: solo con éxito real, respetando el tiempo mínimo en pantalla.
  useEffect(() => {
    if (!abierto || !completado || error) return

    // Se declaran fuera para que la limpieza del efecto los alcance. En la
    // versión anterior el segundo se creaba DENTRO de la callback del primero y
    // su `return` no limpiaba nada —era el retorno de la callback, no del
    // efecto—, así que quedaba suelto.
    let tCierre: ReturnType<typeof setTimeout> | undefined
    const espera = Math.max(0, MS_MINIMO - (Date.now() - abiertoDesde.current))

    const tEspera = setTimeout(() => {
      setLento(false)
      setSellado(true)
      tCierre = setTimeout(() => cerrarRef.current(), MS_TRAS_CHECK)
    }, espera)

    return () => {
      clearTimeout(tEspera)
      if (tCierre) clearTimeout(tCierre)
    }
  }, [abierto, completado, error])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm upload-overlay-enter"
      role="status"
      aria-live="polite"
      aria-label={error ? 'Error al enviar el informe' : sellado ? 'Informe enviado a revisión' : 'Enviando el informe'}
    >
      <div className="bg-white rounded-3xl px-10 py-8 flex flex-col items-center gap-5 shadow-2xl mx-6 w-full max-w-xs upload-card-enter">

        <div className="relative w-24 h-24">
          {/* Carril fijo */}
          <svg className="absolute inset-0 w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
            <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          </svg>

          {/* Anillo: gira mientras dura; al terminar se cierra en verde. */}
          <div className="absolute inset-0 -rotate-90">
            {sellado ? (
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

          {/* El logotipo se queda: acompaña la confirmación. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`transition-transform duration-300 ${sellado ? 'scale-95' : 'scale-100'}`}
              style={{ opacity: error ? 0.35 : 1 }}
            >
              <LogoCD size={42} color={MARCA} />
            </div>
          </div>

          {/* El check firma en la esquina */}
          {sellado && (
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
            <>
              <p className="text-sm font-medium text-gray-900">
                {sellado ? 'Informe enviado a revisión' : 'Enviando tu informe'}
              </p>
              {lento && !sellado && (
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Sigue en curso. No cierres esta página.
                </p>
              )}
              {escape && !sellado && (
                <>
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                    Tu informe ya fue enviado. Si esta ventana no se cierra sola,
                    puedes cerrarla y recargar para ver el estado.
                  </p>
                  <button
                    type="button"
                    onClick={onCerrar}
                    className="mt-3 px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
                  >
                    Cerrar
                  </button>
                </>
              )}
            </>
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
