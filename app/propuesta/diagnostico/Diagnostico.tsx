'use client'

import { useEffect, useRef, useState } from 'react'
import css from './diag.module.css'

/**
 * Todo lo que se mide aquí se mide EN EL APARATO, no en mi cabeza.
 *
 * El estado inicial de cada fila es «desconocido», nunca un valor optimista:
 * si algo no llega a ejecutarse, tiene que verse que no llegó, no un falso
 * negativo que parezca una respuesta.
 */
export default function Diagnostico() {
  const [js, setJs] = useState(false)
  const [menosMovimiento, setMenosMovimiento] = useState<boolean | null>(null)
  const [observador, setObservador] = useState<'esperando' | 'dispara' | 'no dispara'>('esperando')
  const [oculto, setOculto] = useState<string>('—')
  const [navegador, setNavegador] = useState('—')
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setJs(true)
    setMenosMovimiento(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? null)
    setOculto(document.visibilityState)
    const ua = navigator.userAgent
    setNavegador(
      /CriOS/.test(ua) ? 'Chrome en iOS (motor WebKit)'
      : /FxiOS/.test(ua) ? 'Firefox en iOS (motor WebKit)'
      : /iPhone|iPad/.test(ua) ? 'Safari en iOS'
      : 'otro',
    )

    const nodo = caja.current
    if (!nodo || typeof IntersectionObserver === 'undefined') { setObservador('no dispara'); return }
    let respondio = false
    const obs = new IntersectionObserver(() => { respondio = true; setObservador('dispara') }, { threshold: 0.3 })
    obs.observe(nodo)
    const t = setTimeout(() => { if (!respondio) setObservador('no dispara') }, 2500)
    return () => { obs.disconnect(); clearTimeout(t) }
  }, [])

  const Fila = ({ que, valor, malo }: { que: string; valor: string; malo?: boolean }) => (
    <div className="flex items-baseline justify-between gap-4 py-3 border-b border-gray-200">
      <span className="text-gray-600">{que}</span>
      <span className="font-bold text-right" style={{ color: malo ? '#D92D20' : '#0B7A5C' }}>{valor}</span>
    </div>
  )

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">Diagnóstico</h1>
        <p className="mt-2 text-gray-500 text-sm">
          Abra esto en el teléfono donde no se ven las animaciones.
        </p>

        <div ref={caja} className="mt-8">
          <Fila que="JavaScript corre" valor={js ? 'SÍ' : 'NO'} malo={!js} />
          <Fila
            que="«Reducir movimiento»"
            valor={menosMovimiento === null ? 'desconocido' : menosMovimiento ? 'ACTIVADO' : 'desactivado'}
            malo={menosMovimiento === true}
          />
          <Fila que="Detector de visibilidad" valor={observador} malo={observador === 'no dispara'} />
          <Fila que="Estado de la pestaña" valor={oculto} malo={oculto === 'hidden'} />
          <Fila que="Navegador" valor={navegador} />
        </div>

        {/* ── La prueba de verdad ─────────────────────────────────────── */}
        <div className="mt-10">
          <p className="font-semibold text-gray-900">La prueba</p>
          <p className="mt-1 text-sm text-gray-500">
            Los dos cuadros llevan la misma animación. El segundo respeta
            «reducir movimiento»; el primero no lo respeta a propósito.
          </p>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              A · debe moverse siempre
            </p>
            <div className="mt-2 h-14 rounded-lg bg-gray-100 flex items-center px-2">
              <span className={`${css.siempre} block w-10 h-10 rounded-md`} style={{ backgroundColor: '#192031' }} />
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              B · como el folleto
            </p>
            <div className="mt-2 h-14 rounded-lg bg-gray-100 flex items-center px-2">
              <span className={`${css.condicionado} block w-10 h-10 rounded-md`} style={{ backgroundColor: '#10b981' }} />
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-xl bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
          <p className="font-semibold text-gray-900">Cómo se lee</p>
          <p className="mt-2">
            <strong>A se mueve y B no</strong> — el teléfono tiene «reducir
            movimiento» activado. Es la causa, y se arregla desde el código.
          </p>
          <p className="mt-2">
            <strong>Ninguno de los dos se mueve</strong> — el problema no es ese
            ajuste, sino algo que afecta a todas las animaciones del aparato.
          </p>
          <p className="mt-2">
            <strong>Los dos se mueven</strong> — el fallo está en mi código del
            folleto y no en el teléfono.
          </p>
        </div>
      </div>
    </main>
  )
}
