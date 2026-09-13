'use client'

/**
 * La sección «Cinco documentos», contada con la animación real del envío.
 *
 * Reemplaza dos bloques que sumaban unas 150 palabras. La razón no es que
 * sobrara texto: es que el argumento —«el sistema escribe los documentos»— se
 * demuestra en dos segundos y se lee en treinta.
 *
 * EL ANILLO ES EL DE LA APLICACIÓN, no una imitación. Mismos valores que
 * components/EnvioInforme.tsx —radio 40, grosor 6, arco del 28 %, vuelta de
 * 1,1 s, logotipo de 42, cierre por cruce de opacidad— y las mismas clases de
 * globals.css: `sello-entra`, `check-trazo`. Que la propuesta y el producto
 * compartan la pieza es el punto: el alcalde ve exactamente lo que verá su
 * contratista, y en la demostración no hay nada que desmentir.
 *
 * ── LA PLANILLA NO SE GENERA ─────────────────────────────────────────────
 *
 * Los cinco documentos los escribe el sistema. La Planilla Integrada de
 * Liquidación de Aportes la expide el operador de seguridad social y la
 * adjunta el contratista; el sistema la verifica y sin ella válida —y del mes
 * que corresponde— no deja enviar el informe (Decreto 1273 de 2018).
 *
 * Por eso va en la rejilla pero con otro trato: no se escribe sola como las
 * otras —llega ya escrita—, su sello es un visto de verificación y no el QR
 * de un documento emitido por la plataforma, y su rótulo dice quién la pone.
 * Presentarla como un sexto documento generado sería más cómodo y se caería
 * en la primera demostración, que es justo donde una propuesta no se puede
 * caer. La distinción se sostiene sola en la tarjeta: el párrafo que la
 * explicaba se quitó por ruido, no por dejar de ser cierta.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'

const ACENTO_OSCURO = '#2F7A68'
const BORDE = '#D5E8DF'
const VERDE = '#10b981'

/** Los mismos valores del componente real. No tocar sin tocar aquel. */
const R = 40
const CIRCUNFERENCIA = 2 * Math.PI * R

type Pieza = { nombre: string; quien: string; generado: boolean }

const PIEZAS: Pieza[] = [
  { nombre: 'Informe de actividades', quien: 'Contratista', generado: true },
  { nombre: 'Cuenta de cobro', quien: 'Contratista', generado: true },
  { nombre: 'Acta de supervisión', quien: 'Supervisor', generado: true },
  { nombre: 'Acta de pago', quien: 'Secretaría', generado: true },
  { nombre: 'Acta de terminación bilateral', quien: 'Al cerrar el contrato', generado: true },
  { nombre: 'Planilla de seguridad social (PILA)', quien: 'La adjunta el contratista · la verifica el sistema', generado: false },
]

function quieto(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Sello de verificación de los documentos que emite la plataforma. */
function SelloQR({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="1" y="14" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="4" width="3" height="3" fill="currentColor" />
      <rect x="17" y="4" width="3" height="3" fill="currentColor" />
      <rect x="4" y="17" width="3" height="3" fill="currentColor" />
      <rect x="14" y="14" width="3.5" height="3.5" fill="currentColor" />
      <rect x="19.5" y="19.5" width="3.5" height="3.5" fill="currentColor" />
    </svg>
  )
}

/** Visto de verificación: la planilla se comprueba, no se emite. */
function VistoBueno({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M7.5 12.4 L10.6 15.5 L16.5 9" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function EnvioAnimado() {
  const [sellado, setSellado] = useState(false)
  const [salidos, setSalidos] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const correr = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (quieto()) { setSellado(true); setSalidos(PIEZAS.length); return }
    setSellado(false)
    setSalidos(0)
    timers.current.push(setTimeout(() => setSellado(true), 1700))
    // Los documentos salen 800 ms DESPUÉS del cierre en verde, no a la vez: si
    // la confirmación y los papeles se pisan, el verde deja de ser un momento.
    PIEZAS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setSalidos(i + 1), 2500 + i * 260))
    })
  }, [])

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof IntersectionObserver === 'undefined') { correr(); return }
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      correr()
    }, { threshold: 0.3 })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [correr])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <div ref={ref}>
      {/* ── El anillo ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-center">
        <div className="relative w-24 h-24">
          <svg className="absolute inset-0 w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
            <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          </svg>

          {/* Ni el arco ni el anillo se desmontan al sellar: los dos están
              montados desde el principio, superpuestos, y solo cambia cuál
              es visible. La versión anterior REEMPLAZABA el arco por un
              <svg> distinto que "dibujaba" el cierre animando
              `stroke-dashoffset` — en Safari/iOS esa propiedad no la compone
              la GPU, y se veía a tirones. Ver la nota completa en
              components/EnvioInforme.tsx, de donde se calca esta pieza. */}
          <div className="absolute inset-0 -rotate-90">
            <div
              className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
                sellado ? 'opacity-0' : 'opacity-100'
              } ${sellado ? '' : 'animate-spin motion-reduce:animate-none'}`}
              style={sellado ? undefined : { animationDuration: '1.1s', animationTimingFunction: 'linear' }}
            >
              <svg className="w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
                <circle
                  cx="48" cy="48" r={R}
                  fill="none" stroke={MARCA} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${CIRCUNFERENCIA * 0.28} ${CIRCUNFERENCIA * 0.72}`}
                />
              </svg>
            </div>
            <svg
              className={`absolute inset-0 w-24 h-24 transition-opacity duration-[420ms] ease-out ${sellado ? 'opacity-100' : 'opacity-0'}`}
              viewBox="0 0 96 96" aria-hidden="true"
            >
              <circle cx="48" cy="48" r={R} fill="none" stroke={VERDE} strokeWidth="6" strokeLinecap="round" />
            </svg>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`transition-transform duration-300 ${sellado ? 'scale-95' : 'scale-100'}`}>
              <LogoCD size={42} color={MARCA} />
            </div>
          </div>

          {sellado && (
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-md sello-entra">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12.5 L10 17.5 L19 7" stroke="#FFFFFF" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" strokeDasharray="34" className="check-trazo" />
              </svg>
            </div>
          )}
        </div>

        <p className="mt-4 text-sm font-medium text-gray-900 text-center" aria-live="polite">
          {sellado ? 'Informe enviado a revisión' : 'Enviando tu informe'}
        </p>
      </div>

      {/* ── Lo que queda armado ───────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PIEZAS.map((p, i) => {
          const fuera = salidos > i
          return (
            <div
              key={p.nombre}
              className={`rounded-xl border bg-white p-3.5 transition-colors duration-300 ${fuera ? '' : 'border-dashed'}`}
              style={{ borderColor: fuera ? (p.generado ? BORDE : '#BFE3D3') : '#DDE7E2' }}
            >
              {/* La planilla llega ya escrita: sus líneas no crecen, aparecen. */}
              <div className="space-y-1.5" aria-hidden="true">
                {[92, 70, 48].map((ancho, j) => (
                  <span
                    key={j}
                    className={`${p.generado ? 'prop-linea' : 'prop-linea prop-linea--fija'} block h-1.5 rounded-full`}
                    style={{
                      width: fuera ? `${ancho}%` : p.generado ? '0%' : `${ancho}%`,
                      opacity: fuera ? 1 : p.generado ? 1 : 0,
                      backgroundColor: p.generado ? '#E1EFE9' : '#DCEFE4',
                      transitionDelay: `${j * 80}ms`,
                    }}
                  />
                ))}
              </div>

              <div className="mt-3 flex items-start gap-2">
                <span
                  className={`prop-sello shrink-0 ${fuera ? 'puesto' : ''}`}
                  style={{ color: p.generado ? ACENTO_OSCURO : VERDE }}
                >
                  {p.generado ? <SelloQR className="w-4 h-4" /> : <VistoBueno className="w-4 h-4" />}
                </span>
                <span className={`prop-rotulo min-w-0 ${fuera ? 'dentro' : ''}`}>
                  <span className="block text-xs font-semibold leading-snug text-gray-900">{p.nombre}</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5 leading-snug">{p.quien}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
