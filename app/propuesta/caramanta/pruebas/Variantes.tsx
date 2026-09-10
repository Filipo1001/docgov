'use client'

/**
 * Las tres propuestas para la sección «Cinco documentos», aisladas para
 * compararlas. Página de trabajo: no se enlaza desde ningún sitio y no se
 * indexa. Cuando se elija una, la ganadora se lleva a la propuesta y esta
 * carpeta se borra.
 *
 * Las tres reproducen el MISMO momento real del producto. Los textos de fase
 * y el rótulo del botón salen literales de la app —ver PeriodoDetalleClient,
 * estados `verificando` / `enviando` / `actualizando`—; no se inventó ninguno,
 * porque el argumento de la propuesta es que esto ya existe.
 *
 * Las tres arrancan solas al entrar en pantalla: en una reunión nadie tiene
 * por qué saber que hay que tocar. Se repiten con el botón «Repetir».
 *
 * Con «reducir movimiento» ninguna anima: se muestra el estado final, que es
 * el que lleva la información. Mismo criterio que el resto de la propuesta.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const MARCA = '#192031'
const ACENTO_OSCURO = '#2F7A68'
const BORDE = '#D5E8DF'

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

/** Arranca `fn` una vez cuando el nodo entra en pantalla. Devuelve el ref. */
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

/** Sellito de verificación. Un QR de adorno sería mentira; este es el gesto. */
function Sello({ className = '' }: { className?: string }) {
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
      <rect x="14" y="20" width="3" height="3" fill="currentColor" />
    </svg>
  )
}

/** El botón real de la app, con su rótulo y su color. */
function BotonEnviar({ fase, grande = false }: { fase: string | null; grande?: boolean }) {
  const rotulo = fase === 'verificando' ? 'Verificando…'
    : fase === 'enviando' ? 'Enviando…'
      : fase === 'actualizando' ? 'Actualizando…'
        : 'Enviar a revisión'
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-xl font-medium text-white bg-blue-600 shrink-0 ${
        grande ? 'px-8 py-4 text-lg' : 'px-6 py-3'
      } ${fase ? 'opacity-90' : ''}`}
    >
      {fase && (
        <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {rotulo}
    </span>
  )
}

/* ══ A · La pantalla real ═══════════════════════════════════════════════════
   Reproduce el panel de envío tal cual, con sus tres fases y sus textos. Al
   terminar, los cinco documentos caen en cascada. Máxima credibilidad; el
   premio tarda ~2,7 s en llegar.                                           */

const FASES: [string, string, number][] = [
  ['verificando', 'Verificando los requisitos del informe…', 900],
  ['enviando', 'Enviando el informe. No cierres esta página.', 1100],
  ['actualizando', 'Listo. Actualizando tu expediente…', 700],
]

export function VarianteA() {
  const [fase, setFase] = useState<string | null>(null)
  const [salidos, setSalidos] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const correr = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (quieto()) { setFase(null); setSalidos(DOCS.length); return }
    setFase(null); setSalidos(0)
    let t = 0
    FASES.forEach(([clave, , dura]) => {
      timers.current.push(setTimeout(() => setFase(clave), t))
      t += dura
    })
    timers.current.push(setTimeout(() => setFase(null), t))
    DOCS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setSalidos(i + 1), t + 120 + i * 150))
    })
  }, [])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const ref = useAlEntrar(correr)
  const texto = FASES.find(f => f[0] === fase)?.[1]
    ?? 'Los asesores y la secretaria recibirán este informe para revisión.'

  return (
    <Marco titulo="A · La pantalla real" nota="El panel de envío tal cual, con sus tres fases reales." alRepetir={correr}>
      <div ref={ref} className="rounded-2xl border bg-white p-5 sm:p-6" style={{ borderColor: BORDE }}>
        <div className="flex items-center justify-between gap-4 pt-1">
          <p className="text-sm text-gray-400" aria-live="polite">{texto}</p>
          <BotonEnviar fase={fase} />
        </div>

        <div className="mt-6 space-y-2">
          {DOCS.map(([nombre, quien], i) => (
            <div
              key={nombre}
              className={`pb-cae flex items-center gap-3 rounded-xl border bg-[#F4FAF7] px-4 py-3 ${salidos > i ? 'dentro' : ''}`}
              style={{ borderColor: BORDE }}
            >
              <Sello className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">{nombre}</span>
              <span className="text-[11px] text-gray-400 shrink-0">{quien}</span>
            </div>
          ))}
        </div>
      </div>
    </Marco>
  )
}

/* ══ B · La línea de producción ═════════════════════════════════════════════
   Sin fases. Cada documento se escribe solo —las líneas crecen— y recibe su
   sello. Lo más legible en 375 px y lo que mejor cuenta «cinco».           */

export function VarianteB() {
  const [paso, setPaso] = useState(0)
  const id = useRef<ReturnType<typeof setInterval>>(undefined)

  const correr = useCallback(() => {
    if (id.current) clearInterval(id.current)
    if (quieto()) { setPaso(DOCS.length * 2); return }
    setPaso(0)
    let p = 0
    id.current = setInterval(() => {
      p += 1
      setPaso(p)
      if (p >= DOCS.length * 2 && id.current) clearInterval(id.current)
    }, 340)
  }, [])

  useEffect(() => () => { if (id.current) clearInterval(id.current) }, [])
  const ref = useAlEntrar(correr)
  const total = DOCS.length * 2

  return (
    <Marco titulo="B · La línea de producción" nota="Cada documento se escribe solo y recibe su sello." alRepetir={correr}>
      <div ref={ref}>
        <div className="h-[3px] w-full rounded-full bg-[#E7F3EE] overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-linear"
            style={{ width: `${(paso / total) * 100}%`, backgroundColor: ACENTO_OSCURO }}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {DOCS.map(([nombre, quien], i) => {
            const escribiendo = paso >= i * 2 + 1
            const sellado = paso >= i * 2 + 2
            return (
              <div
                key={nombre}
                className={`rounded-xl border bg-white p-3.5 transition-colors duration-300 ${sellado ? '' : 'border-dashed'}`}
                style={{ borderColor: sellado ? BORDE : '#DDE7E2' }}
              >
                <div className="space-y-1.5" aria-hidden="true">
                  {[92, 70, 48].map((ancho, j) => (
                    <span
                      key={j}
                      className="pb-linea block h-1.5 rounded-full bg-[#E1EFE9]"
                      style={{ width: escribiendo ? `${ancho}%` : '0%', transitionDelay: `${j * 90}ms` }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2">
                  <span className={`pb-sello shrink-0 ${sellado ? 'puesto' : ''}`} style={{ color: ACENTO_OSCURO }}>
                    <Sello className="w-4 h-4" />
                  </span>
                  <span className={`pb-rotulo min-w-0 ${escribiendo ? 'dentro' : ''}`}>
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
   Un toque y cinco papeles salen repartidos desde el botón. El más
   memorable; en 375 px las tarjetas se pisan y los rótulos girados cuestan
   leerse — la comparación está para ver si ese precio se paga.            */

export function VarianteC() {
  const [abierto, setAbierto] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)

  const correr = useCallback(() => {
    if (t.current) clearTimeout(t.current)
    if (quieto()) { setAbierto(true); return }
    setAbierto(false)
    t.current = setTimeout(() => setAbierto(true), 420)
  }, [])

  useEffect(() => () => { if (t.current) clearTimeout(t.current) }, [])
  const ref = useAlEntrar(correr)
  const centro = (DOCS.length - 1) / 2

  return (
    <Marco titulo="C · El abanico" nota="Un toque, y los cinco salen repartidos desde el botón." alRepetir={correr}>
      <div ref={ref} className="relative h-[340px] sm:h-[300px] flex flex-col items-center justify-end pb-2">
        <div className="absolute inset-x-0 top-0 h-[248px] sm:h-[210px]">
          {DOCS.map(([nombre, quien], i) => {
            const desvio = i - centro
            return (
              <div
                key={nombre}
                className={`pb-carta absolute left-1/2 bottom-0 w-[42%] sm:w-[27%] ${abierto ? 'fuera' : ''}`}
                style={{
                  transitionDelay: abierto ? `${i * 85}ms` : '0ms',
                  ['--giro' as string]: `${desvio * 13}deg`,
                  ['--x' as string]: `${desvio * 74}%`,
                  ['--y' as string]: `${-Math.pow(Math.abs(desvio), 1.6) * 9 - 24}px`,
                }}
              >
                <div className="rounded-xl border bg-white px-3 py-3.5 shadow-sm h-full" style={{ borderColor: BORDE }}>
                  <Sello className="w-4 h-4" />
                  <span className="mt-2 block text-[11px] sm:text-xs font-semibold leading-snug text-gray-900">{nombre}</span>
                  <span className="mt-1 block text-[10px] text-gray-400">{quien}</span>
                </div>
              </div>
            )
          })}
        </div>
        <BotonEnviar fase={null} grande />
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

/** Las animaciones. Prefijo pb- (pruebas) para no chocar con nada. */
export function EstilosPruebas() {
  return (
    <style>{`
      .pb-cae { opacity: 0; transform: translateY(10px);
        transition: opacity 420ms ease, transform 420ms cubic-bezier(0.2,0.8,0.3,1); }
      .pb-cae.dentro { opacity: 1; transform: none; }

      .pb-linea { transition: width 320ms cubic-bezier(0.3,0.8,0.3,1); }

      .pb-rotulo { opacity: 0; transition: opacity 300ms ease 120ms; }
      .pb-rotulo.dentro { opacity: 1; }

      /* El sello no aparece: cae. Llega grande y girado, y se asienta. */
      .pb-sello { opacity: 0; transform: scale(2.1) rotate(-14deg); }
      .pb-sello.puesto { animation: pb-estampa 420ms cubic-bezier(0.2,1.3,0.4,1) forwards; }
      @keyframes pb-estampa {
        from { opacity: 0; transform: scale(2.1) rotate(-14deg); }
        to   { opacity: 1; transform: none; }
      }

      .pb-carta {
        transform: translateX(-50%) translateY(6px) scale(0.9);
        opacity: 0;
        transition: transform 640ms cubic-bezier(0.25,1.1,0.35,1), opacity 300ms ease;
      }
      .pb-carta.fuera {
        opacity: 1;
        transform: translateX(calc(-50% + var(--x))) translateY(var(--y)) rotate(var(--giro));
      }

      @media (prefers-reduced-motion: reduce) {
        .pb-cae, .pb-rotulo { opacity: 1 !important; transform: none !important; transition: none !important; }
        .pb-linea { transition: none !important; }
        .pb-sello { opacity: 1 !important; transform: none !important; animation: none !important; }
        .pb-carta { transition: none !important; }
      }
    `}</style>
  )
}
