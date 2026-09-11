'use client'

/**
 * Las tres propuestas para la sección «Cinco documentos», aisladas para
 * compararlas. Página de trabajo: no se enlaza desde ningún sitio y no se
 * indexa. Cuando se elija una, la ganadora se lleva a la propuesta y esta
 * carpeta se borra.
 *
 * LAS TRES PARTEN DE LA PIEZA REAL. El anillo, el logotipo, el cierre en
 * verde y el check que se dibuja son los de components/EnvioInforme.tsx —
 * mismo radio, mismo grosor, mismo arco del 28 %, misma vuelta de 1,1 s, y
 * las mismas clases de globals.css (`anillo-cierre`, `sello-entra`,
 * `check-trazo`). No es una imitación: es el mismo componente reconstruido
 * con los mismos valores, así que lo que ve el alcalde en la propuesta es
 * exactamente lo que verá su contratista al enviar.
 *
 * Lo que cambia entre las tres es lo que pasa DESPUÉS del cierre en verde:
 * cómo aparecen los cinco documentos.
 *
 * Las tres arrancan solas al entrar en pantalla: en una reunión nadie tiene
 * por qué saber que hay que tocar. Se repiten con el botón «Repetir».
 *
 * Con «reducir movimiento» ninguna anima: se muestra el estado final, que es
 * el que lleva la información.
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

const DOCS: [string, string][] = [
  ['Informe de actividades', 'Contratista'],
  ['Cuenta de cobro', 'Contratista'],
  ['Acta de supervisión', 'Supervisor'],
  ['Acta de pago', 'Secretaría'],
  ['Acta de terminación bilateral', 'Al cerrar el contrato'],
]

function quieto(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function useAlEntrar(fn: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const guardado = useRef(fn)
  guardado.current = fn
  useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof IntersectionObserver === 'undefined') { guardado.current(); return }
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      guardado.current()
    }, { threshold: 0.35 })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [])
  return ref
}

/**
 * El anillo con el logotipo, calcado de components/EnvioInforme.tsx.
 *
 * Gira en tinta de marca mientras dura; al terminar se cierra en verde y el
 * check firma en la esquina. El logotipo se queda: acompaña la confirmación.
 */
function AnilloEnvio({ sellado }: { sellado: boolean }) {
  return (
    <div className="relative w-24 h-24">
      <svg className="absolute inset-0 w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      </svg>

      <div className="absolute inset-0 -rotate-90">
        {sellado ? (
          <svg className="w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
            <circle
              cx="48" cy="48" r={R}
              fill="none" stroke={VERDE} strokeWidth="6" strokeLinecap="round"
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
                fill="none" stroke={MARCA} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${CIRCUNFERENCIA * 0.28} ${CIRCUNFERENCIA * 0.72}`}
              />
            </svg>
          </div>
        )}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`transition-transform duration-300 ${sellado ? 'scale-95' : 'scale-100'}`}>
          <LogoCD size={42} color={MARCA} />
        </div>
      </div>

      {sellado && (
        <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-md sello-entra">
          <Check tamano={18} />
        </div>
      )}
    </div>
  )
}

/** Check dibujado, igual que en el componente real. */
function Check({ tamano, color = '#FFFFFF' }: { tamano: number; color?: string }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5 L10 17.5 L19 7"
        stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="34" className="check-trazo"
      />
    </svg>
  )
}

/** Sellito de verificación de cada documento. */
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

/**
 * Motor común: gira, sella, y luego suelta los documentos de a uno.
 *
 * Los tiempos son los del componente real —1,1 s de mínimo en pantalla, 420 ms
 * de cierre, 380 ms del check— más una pausa para que el verde se lea antes de
 * que empiecen a salir los documentos. Si la confirmación y los papeles se
 * pisan, el cierre en verde deja de ser un momento.
 */
function useSecuencia(pasoDocMs = 150) {
  const [sellado, setSellado] = useState(false)
  const [salidos, setSalidos] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const correr = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (quieto()) { setSellado(true); setSalidos(DOCS.length); return }
    setSellado(false); setSalidos(0)
    timers.current.push(setTimeout(() => setSellado(true), 1700))
    DOCS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setSalidos(i + 1), 2500 + i * pasoDocMs))
    })
  }, [pasoDocMs])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return { sellado, salidos, correr }
}

/* ══ A · La capa tal cual ═══════════════════════════════════════════════════
   La ventana de envío exactamente como se ve en la aplicación, sobre su
   fondo oscuro. Al cerrarse en verde, la capa se desvanece y debajo queda el
   expediente con sus cinco documentos — que es lo que pasa de verdad.     */

export function VarianteA() {
  const { sellado, salidos, correr } = useSecuencia(150)
  const ref = useAlEntrar(correr)
  const capaFuera = salidos > 0

  return (
    <Marco titulo="A · La capa tal cual" nota="La ventana de envío como se ve en la app; al cerrarse, queda el expediente." alRepetir={correr}>
      <div ref={ref} className="relative overflow-hidden rounded-2xl border bg-white" style={{ borderColor: BORDE }}>
        {/* El expediente que queda debajo. */}
        <div className="p-5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Expediente de septiembre
          </p>
          {DOCS.map(([nombre, quien], i) => (
            <div
              key={nombre}
              className={`pb-cae flex items-center gap-3 rounded-xl border bg-[#F4FAF7] px-4 py-3 ${salidos > i ? 'dentro' : ''}`}
              style={{ borderColor: BORDE, color: ACENTO_OSCURO }}
            >
              <SelloQR className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">{nombre}</span>
              <span className="text-[11px] text-gray-400 shrink-0">{quien}</span>
            </div>
          ))}
        </div>

        {/* La capa, con el mismo fondo y la misma tarjeta de la aplicación. */}
        <div
          className={`pb-capa absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm ${capaFuera ? 'ida' : ''}`}
        >
          <div className="bg-white rounded-3xl px-10 py-8 flex flex-col items-center gap-5 shadow-2xl mx-6 w-full max-w-xs">
            <AnilloEnvio sellado={sellado} />
            <p className="text-sm font-medium text-gray-900 text-center">
              {sellado ? 'Informe enviado a revisión' : 'Enviando tu informe'}
            </p>
          </div>
        </div>
      </div>
    </Marco>
  )
}

/* ══ B · El anillo que reparte ══════════════════════════════════════════════
   Sin fondo oscuro ni ventana: el anillo es la pieza, en el centro. Al
   cerrarse en verde, los cinco documentos se escriben solos debajo y cada
   uno recibe su sello.                                                    */

export function VarianteB() {
  const { sellado, salidos, correr } = useSecuencia(260)
  const ref = useAlEntrar(correr)

  return (
    <Marco titulo="B · El anillo que reparte" nota="El anillo en el centro; al cerrarse, los documentos se escriben solos." alRepetir={correr}>
      <div ref={ref} className="flex flex-col items-center">
        <AnilloEnvio sellado={sellado} />
        <p className="mt-4 text-sm font-medium text-gray-900 text-center">
          {sellado ? 'Informe enviado a revisión' : 'Enviando tu informe'}
        </p>

        <div className="mt-7 w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
          {DOCS.map(([nombre, quien], i) => {
            const fuera = salidos > i
            return (
              <div
                key={nombre}
                className={`rounded-xl border bg-white p-3.5 transition-colors duration-300 ${fuera ? '' : 'border-dashed'}`}
                style={{ borderColor: fuera ? BORDE : '#DDE7E2' }}
              >
                <div className="space-y-1.5" aria-hidden="true">
                  {[92, 70, 48].map((ancho, j) => (
                    <span
                      key={j}
                      className="pb-linea block h-1.5 rounded-full bg-[#E1EFE9]"
                      style={{ width: fuera ? `${ancho}%` : '0%', transitionDelay: `${j * 80}ms` }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2">
                  <span className={`pb-sello shrink-0 ${fuera ? 'puesto' : ''}`} style={{ color: ACENTO_OSCURO }}>
                    <SelloQR className="w-4 h-4" />
                  </span>
                  <span className={`pb-rotulo min-w-0 ${fuera ? 'dentro' : ''}`}>
                    <span className="block text-xs font-semibold leading-snug text-gray-900">{nombre}</span>
                    <span className="block text-[10px] text-gray-400 mt-0.5">{quien}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Marco>
  )
}

/* ══ C · El abanico ═════════════════════════════════════════════════════════
   El anillo se cierra en verde y los cinco documentos salen repartidos desde
   él, como cartas. Lo más memorable; en 375 px se pisan y los rótulos
   girados cuestan leerse — la comparación está para ver si ese precio se
   paga.                                                                   */

export function VarianteC() {
  const { sellado, salidos, correr } = useSecuencia(95)
  const ref = useAlEntrar(correr)
  const centro = (DOCS.length - 1) / 2

  return (
    <Marco titulo="C · El abanico" nota="Los cinco salen repartidos desde el anillo, como cartas." alRepetir={correr}>
      <div ref={ref} className="relative h-[330px] sm:h-[300px] flex flex-col items-center justify-end">
        <div className="absolute inset-x-0 top-0 h-[212px] sm:h-[186px]">
          {DOCS.map(([nombre, quien], i) => {
            const desvio = i - centro
            return (
              <div
                key={nombre}
                className={`pb-carta absolute left-1/2 bottom-0 w-[42%] sm:w-[27%] ${salidos > i ? 'fuera' : ''}`}
                style={{
                  ['--giro' as string]: `${desvio * 13}deg`,
                  ['--x' as string]: `${desvio * 74}%`,
                  ['--y' as string]: `${-Math.pow(Math.abs(desvio), 1.6) * 9 - 20}px`,
                }}
              >
                <div className="rounded-xl border bg-white px-3 py-3.5 shadow-sm" style={{ borderColor: BORDE, color: ACENTO_OSCURO }}>
                  <SelloQR className="w-4 h-4" />
                  <span className="mt-2 block text-[11px] sm:text-xs font-semibold leading-snug text-gray-900">{nombre}</span>
                  <span className="mt-1 block text-[10px] text-gray-400">{quien}</span>
                </div>
              </div>
            )
          })}
        </div>
        <AnilloEnvio sellado={sellado} />
      </div>
    </Marco>
  )
}

/* ══ Marco común ═══════════════════════════════════════════════════════════ */

function Marco({
  titulo, nota, alRepetir, children,
}: { titulo: string; nota: string; alRepetir: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-[#F4FAF7] p-5 sm:p-7" style={{ borderColor: BORDE }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight" style={{ color: MARCA }}>{titulo}</h2>
          <p className="mt-1 text-sm text-gray-500 leading-snug">{nota}</p>
        </div>
        <button
          type="button"
          onClick={alRepetir}
          className="shrink-0 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#E7F3EE] transition-colors"
          style={{ borderColor: BORDE, color: ACENTO_OSCURO }}
        >
          Repetir
        </button>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

/** Prefijo pb- (pruebas) para no chocar con nada del sistema. */
export function EstilosPruebas() {
  return (
    <style>{`
      .pb-cae { opacity: 0; transform: translateY(10px);
        transition: opacity 420ms ease, transform 420ms cubic-bezier(0.2,0.8,0.3,1); }
      .pb-cae.dentro { opacity: 1; transform: none; }

      .pb-capa { transition: opacity 420ms ease, backdrop-filter 420ms ease; }
      .pb-capa.ida { opacity: 0; pointer-events: none; }

      .pb-linea { transition: width 320ms cubic-bezier(0.3,0.8,0.3,1); }

      .pb-rotulo { opacity: 0; transition: opacity 300ms ease 120ms; }
      .pb-rotulo.dentro { opacity: 1; }

      .pb-sello { opacity: 0; transform: scale(2.1) rotate(-14deg); display: inline-block; }
      .pb-sello.puesto { animation: pb-estampa 420ms cubic-bezier(0.2,1.3,0.4,1) forwards; }
      @keyframes pb-estampa {
        from { opacity: 0; transform: scale(2.1) rotate(-14deg); }
        to   { opacity: 1; transform: none; }
      }

      .pb-carta {
        transform: translateX(-50%) translateY(10px) scale(0.86);
        opacity: 0;
        transition: transform 620ms cubic-bezier(0.25,1.1,0.35,1), opacity 280ms ease;
      }
      .pb-carta.fuera {
        opacity: 1;
        transform: translateX(calc(-50% + var(--x))) translateY(var(--y)) rotate(var(--giro));
      }

      @media (prefers-reduced-motion: reduce) {
        .pb-cae, .pb-rotulo { opacity: 1 !important; transform: none !important; transition: none !important; }
        .pb-capa { opacity: 0 !important; }
        .pb-linea { transition: none !important; }
        .pb-sello { opacity: 1 !important; transform: none !important; animation: none !important; }
        .pb-carta { transition: none !important; }
      }
    `}</style>
  )
}
