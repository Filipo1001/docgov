'use client'

/**
 * Las escenas animadas del folleto.
 *
 * NINGUNA ES DECORATIVA. Se pidió que las ventajas no fueran «palabras ni
 * emojis, sino animaciones», y el criterio es más estrecho todavía: cada
 * tesela anima EXACTAMENTE el argumento que tiene que dejar creído, y solo
 * ese. Si una se puede contar con una frase, no lleva animación.
 *
 * ── LAS SIETE ACTÚAN EN SECUENCIA ────────────────────────────────────────
 *
 * No en bucles paralelos: por turnos, de izquierda a derecha, cada una
 * arrancando cuando la anterior termina. Eso lo gobierna `Secuencia` con un
 * único reloj — ver su comentario. Una tesela que ya actuó se queda resuelta
 * mientras las demás actúan, así que ninguna necesita reposo propio: su
 * reposo es el turno de las otras.
 *
 * Fuera de la rejilla, `ExpedienteCrece` y `CodigoQR` conservan su bucle
 * independiente: están solos en su sección y no tienen con quién turnarse.
 *
 * Nada corre fuera de pantalla. La página entera moviéndose sin que nadie la
 * mire es batería del teléfono de un secretario gastada en nada.
 *
 * React lleva el compás y el CSS hace la música: las teselas alternan una
 * clase y toda la coreografía cuelga de retardos en brochure.module.css.
 *
 * Sin JavaScript, o con «reducir movimiento», cada escena se queda en su
 * estado final, quieta y legible — misma regla que Revelar.tsx y Contador.tsx.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
import css from './brochure.module.css'

const VERDE = '#10b981'
const AMBAR = '#D98324'
const ROJO = '#E0574F'

function quieto(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Ciclo perpetuo mientras la tesela está a la vista.
 *
 * `duracion` es lo que dura la vuelta COMPLETA: la coreografía más el reposo
 * en que el resultado se queda quieto para poder leerse. El rebobinado son
 * 200 ms a propósito, mucho más rápido que la ida: lo que importa es ver
 * cómo se construye, no cómo se deshace.
 */
function useCiclo<T extends HTMLElement>(duracion: number, umbral = 0.4) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  const [fase, setFase] = useState<'quieto' | 'dormido' | 'armado'>('quieto')

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || quieto() || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: umbral })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [umbral])

  useEffect(() => {
    if (!visible) { setFase('quieto'); return }
    let vivo = true
    const relojes: ReturnType<typeof setTimeout>[] = []
    const vuelta = () => {
      if (!vivo) return
      setFase('dormido')
      relojes.push(setTimeout(() => {
        if (!vivo) return
        setFase('armado')
        relojes.push(setTimeout(vuelta, duracion))
      }, 200))
    }
    vuelta()
    return () => { vivo = false; relojes.forEach(clearTimeout) }
  }, [visible, duracion])

  const clase = fase === 'dormido' ? css.dormido : fase === 'armado' ? css.armado : ''
  return { ref, clase, armado: fase === 'armado', ciclando: fase !== 'quieto' }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EL DIRECTOR DE ORQUESTA
   ═══════════════════════════════════════════════════════════════════════════

   Se pidió que las teselas no corrieran cada una por su cuenta, sino en
   secuencia: de izquierda a derecha, y que cada una arranque cuando la
   anterior termina. Eso exige un único reloj para las siete — con relojes
   independientes la sincronía se pierde a los pocos segundos por mucho que
   se afinen las duraciones.

   LO QUE LA SECUENCIA REGALA: una tesela que ya actuó SE QUEDA en su estado
   resuelto mientras las demás actúan. La rejilla se va llenando de resultados
   en vez de parpadear entera, y por eso ninguna necesita reposo propio: su
   reposo es el turno de las otras. La vuelta completa dura unos 22 s.

   El orden de los turnos es el orden del DOM, que en esta rejilla coincide
   con el de lectura —izquierda a derecha, arriba abajo— en las tres anchuras.

   `-1` significa que nadie actúa: fuera de pantalla, sin JavaScript o con
   «reducir movimiento», y ahí cada tesela muestra su estado final.
*/

/** Lo que dura cada turno, en el orden de la rejilla. Incluye los 200 ms de
 *  rebobinado del principio. */
const TURNOS = [4000, 2800, 2600, 2400, 3400, 4000, 2600] as const

const Turno = createContext<number>(-1)

export function Secuencia({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [turno, setTurno] = useState(-1)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || quieto() || typeof IntersectionObserver === 'undefined') return
    // Umbral bajo y deliberado: basta con que asome un borde de la rejilla
    // para que la secuencia arranque, de modo que la primera tesela ya esté
    // actuando cuando el lector termine de bajar hasta ella.
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) { setTurno(-1); return }
    let vivo = true
    const relojes: ReturnType<typeof setTimeout>[] = []
    const paso = (i: number) => {
      if (!vivo) return
      setTurno(i)
      relojes.push(setTimeout(() => paso((i + 1) % TURNOS.length), TURNOS[i]))
    }
    paso(0)
    return () => { vivo = false; relojes.forEach(clearTimeout) }
  }, [visible])

  return (
    <Turno.Provider value={turno}>
      <div ref={ref} className={className}>{children}</div>
    </Turno.Provider>
  )
}

/**
 * El turno de una tesela.
 *
 * Cuando le toca, rebobina 200 ms y actúa. Cuando NO le toca no se toca nada:
 * se queda exactamente como la dejó su actuación —resuelta— y esa quietud es
 * su reposo.
 */
function useTurno(indice: number) {
  const turno = useContext(Turno)
  const [fase, setFase] = useState<'quieto' | 'dormido' | 'armado'>('quieto')

  useEffect(() => {
    if (turno === -1) { setFase('quieto'); return }
    if (turno !== indice) return
    setFase('dormido')
    const t = setTimeout(() => setFase('armado'), 200)
    return () => clearTimeout(t)
  }, [turno, indice])

  const clase = fase === 'dormido' ? css.dormido : fase === 'armado' ? css.armado : ''
  return { clase, armado: fase === 'armado', ciclando: fase !== 'quieto', miTurno: turno === indice }
}

/** Cuenta compases dentro de una vuelta. Los tiempos van como constante de
 *  módulo: un arreglo nuevo en cada render reiniciaría el efecto sin parar. */
function usePasos(activo: boolean, tiempos: readonly number[]): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!activo) { setN(0); return }
    const relojes = tiempos.map((t, i) => setTimeout(() => setN(i + 1), t))
    return () => relojes.forEach(clearTimeout)
  }, [activo, tiempos])
  return n
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTO 1 · El expediente que crece
   ═══════════════════════════════════════════════════════════════════════════ */

export function ExpedienteCrece() {
  const { ref, clase } = useCiclo<HTMLDivElement>(5800, 0.2)
  return (
    <div ref={ref} className={`${clase} relative mx-auto`} style={{ width: 210, height: 150 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className={`${css.hoja} absolute rounded-lg border`}
          style={{
            width: 118, height: 88, left: 46 + (i - 2) * 15, top: 52 - i * 11,
            borderColor: 'rgba(255,255,255,.22)',
            backgroundColor: `rgba(255,255,255,${0.05 + i * 0.035})`,
            transform: `rotate(${(i - 2) * 2.4}deg)`,
            transitionDelay: `${i * 130}ms`,
            backdropFilter: 'blur(2px)',
          }}>
          <div className="p-3 space-y-1.5">
            {[80, 58, 40].map((w, j) => (
              <span key={j} className="block h-1 rounded-full"
                style={{ width: `${w}%`, backgroundColor: 'rgba(255,255,255,.3)' }} />
            ))}
          </div>
          {i === 4 && (
            <span className="absolute bottom-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: VERDE }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5 L10 17.5 L19 7" stroke="#fff" strokeWidth="3.2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTO 2 · El anillo y los cinco documentos
   Valores calcados de components/EnvioInforme.tsx: radio 40, grosor 6, arco
   del 28 %, vuelta de 1,1 s, logotipo de 42. No tocar sin tocar aquel.
   ═══════════════════════════════════════════════════════════════════════════ */

const R = 40
const CIRC = 2 * Math.PI * R

const PIEZAS = [
  { n: 'Informe de actividades', q: 'Contratista' },
  { n: 'Cuenta de cobro', q: 'Contratista' },
  { n: 'Acta de supervisión', q: 'Supervisor' },
  { n: 'Acta de pago', q: 'Secretaría' },
  { n: 'Acta de terminación', q: 'Al cerrar el contrato' },
]

export function ElMomento() {
  // Arrancan en el RESULTADO, no en el proceso: sin JavaScript la escena tiene
  // que mostrar los cinco documentos hechos, no cinco recuadros vacíos.
  const [sellado, setSellado] = useState(true)
  const [salidos, setSalidos] = useState(PIEZAS.length)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    if (quieto() || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let vivo = true
    const relojes: ReturnType<typeof setTimeout>[] = []
    const vuelta = () => {
      if (!vivo) return
      setSellado(false); setSalidos(0)
      relojes.push(setTimeout(() => setSellado(true), 1700))
      // 800 ms después del cierre, no a la vez: si la confirmación y los
      // papeles se pisan, el verde deja de ser un momento.
      PIEZAS.forEach((_, i) =>
        relojes.push(setTimeout(() => setSalidos(i + 1), 2500 + i * 240)))
      relojes.push(setTimeout(vuelta, 7200))
    }
    vuelta()
    return () => { vivo = false; relojes.forEach(clearTimeout) }
  }, [visible])

  return (
    <div ref={ref}>
      <div className="flex flex-col items-center">
        <div className="relative w-24 h-24">
          <svg className="absolute inset-0 w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
            <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          </svg>
          <div className="absolute inset-0 -rotate-90">
            {sellado ? (
              <svg className="w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
                <circle cx="48" cy="48" r={R} fill="none" stroke={VERDE} strokeWidth="6"
                  strokeLinecap="round" strokeDasharray={CIRC} className={css.anilloCierre} />
              </svg>
            ) : (
              <div className="w-full h-full animate-spin motion-reduce:animate-none"
                style={{ animationDuration: '1.1s', animationTimingFunction: 'linear' }}>
                <svg className="w-24 h-24" viewBox="0 0 96 96" aria-hidden="true">
                  <circle cx="48" cy="48" r={R} fill="none" stroke={MARCA} strokeWidth="6"
                    strokeLinecap="round" strokeDasharray={`${CIRC * 0.28} ${CIRC * 0.72}`} />
                </svg>
              </div>
            )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`transition-transform duration-300 ${sellado ? 'scale-95' : ''}`}>
              <LogoCD size={42} color={MARCA} />
            </div>
          </div>
          {sellado && (
            <div className={`${css.selloEntra} absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow-md`}
              style={{ backgroundColor: VERDE }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5 L10 17.5 L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"
                  strokeLinejoin="round" strokeDasharray="34" className={css.checkTrazo} />
              </svg>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm font-medium text-gray-900" aria-live="polite">
          {sellado ? 'Informe enviado a revisión' : 'Enviando tu informe'}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {PIEZAS.map((p, i) => {
          const fuera = salidos > i
          return (
            <div key={p.n}
              className={`rounded-xl border bg-white p-3.5 transition-colors duration-300 ${fuera ? '' : 'border-dashed'}`}
              style={{ borderColor: fuera ? '#D9E4EC' : '#E4EAEF' }}>
              <div className="space-y-1.5" aria-hidden="true">
                {[92, 70, 48].map((w, j) => (
                  <span key={j} className={`${css.renglon} block h-1.5 rounded-full`}
                    style={{ width: fuera ? `${w}%` : '0%', backgroundColor: '#E6EDF2',
                             transitionDelay: `${j * 80}ms` }} />
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2">
                <span className={`shrink-0 ${fuera ? css.estampa : 'opacity-0'}`} style={{ color: MARCA }}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <rect x="1" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <rect x="14" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <rect x="1" y="14" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <rect x="4" y="4" width="3" height="3" fill="currentColor" />
                    <rect x="17" y="4" width="3" height="3" fill="currentColor" />
                    <rect x="4" y="17" width="3" height="3" fill="currentColor" />
                    <rect x="14" y="14" width="3.5" height="3.5" fill="currentColor" />
                  </svg>
                </span>
                <span className={`min-w-0 transition-opacity duration-300 ${fuera ? 'opacity-100' : 'opacity-0'}`}>
                  <span className="block text-xs font-semibold leading-snug text-gray-900">{p.n}</span>
                  <span className="block text-[10px] text-gray-400 mt-0.5">{p.q}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTO 3 · Las siete teselas
   ═══════════════════════════════════════════════════════════════════════════ */

function Tesela({ titulo, cuerpo, children, ancha = false }: {
  titulo: string; cuerpo: string; children: ReactNode; ancha?: boolean
}) {
  return (
    <div className={`rounded-2xl border border-[#E4EAEF] bg-white p-5 sm:p-6 flex flex-col ${ancha ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <div className="flex-1 flex items-center justify-center min-h-[132px] py-2 overflow-hidden">{children}</div>
      <p className="mt-4 font-semibold text-gray-900 text-[15px] leading-snug">{titulo}</p>
      <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">{cuerpo}</p>
    </div>
  )
}
export { Tesela }

/* ── 1 · Evidencias repetidas ────────────────────────────────────────────
   Cuatro tiempos. La foto de abril se deforma A LA VISTA —se acerca, se gira,
   se aclara— porque lo increíble no es que reconozca una copia: es que
   reconozca una copia disfrazada. Si la deformación viene de fábrica, el
   argumento no se ve ocurrir. El recorte sale solo: la escena crece dentro de
   un marco que no crece. */

/** Escena de obra: cielo, suelo, un poste con travesaño. Sin degradados ni
 *  `id`, que con dos copias en pantalla chocarían entre sí. */
function Foto({ deformada = false }: { deformada?: boolean }) {
  return (
    <span className="block rounded-lg overflow-hidden shrink-0" style={{ width: 66, height: 66 }}>
      <svg viewBox="0 0 66 66" width="66" height="66" className={deformada ? css.gemela : undefined}
        style={{ display: 'block' }} aria-hidden="true">
        <rect width="66" height="66" fill="#A9C9DD" />
        <circle cx="50" cy="15" r="7" fill="#F2E2B8" />
        <rect y="44" width="66" height="22" fill="#7E9B72" />
        <rect y="44" width="66" height="4" fill="#6C8862" />
        <rect x="30" y="16" width="5" height="30" fill="#5A4B3F" />
        <rect x="19" y="21" width="27" height="4" rx="1" fill="#5A4B3F" />
        <rect x="8" y="50" width="18" height="9" rx="1.5" fill="#C4B49B" />
      </svg>
    </span>
  )
}

export function TeselaDuplicados({ indice }: { indice: number }) {
  const { clase } = useTurno(indice)
  return (
    <div className={`${clase} relative w-full flex items-center justify-center gap-9`}>
      <div className="flex flex-col items-center gap-2">
        <Foto />
        <span className="text-[10px] text-gray-400">marzo</span>
      </div>

      {/* El lazo se tensa una vez que el barrido ya pasó por las dos. */}
      <svg className="absolute pointer-events-none" width="132" height="44" viewBox="0 0 132 44"
        style={{ top: 6 }} aria-hidden="true">
        <path d="M16 26 C 46 6, 86 6, 116 26" fill="none" stroke={AMBAR} strokeWidth="2"
          strokeLinecap="round" className={css.lazo} />
      </svg>

      {/* El barrido: el sistema mirando. */}
      <span className={`${css.barrido} absolute pointer-events-none`}
        style={{
          width: 22, height: 78, top: 2,
          background: `linear-gradient(90deg, transparent, ${VERDE}44 45%, ${VERDE}77 50%, ${VERDE}44 55%, transparent)`,
        }} />

      <div className="flex flex-col items-center gap-2">
        <Foto deformada />
        <span className="text-[10px] text-gray-400">abril</span>
      </div>

      <span className={`${css.alerta} absolute px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap`}
        style={{ bottom: -6, backgroundColor: '#FBF0E2', color: AMBAR }}>
        Ya se usó en marzo
      </span>
    </div>
  )
}

/* ── 2 · La huella ───────────────────────────────────────────────────────
   Causa y efecto, en ese orden: el dígito alterado destella primero y la
   huella entra en remolino después. El revuelto va en React porque el azar no
   se escribe en CSS, y los caracteres se van fijando de izquierda a derecha
   para que la avalancha se vea PROPAGARSE y no aparecer de golpe. */
const HEX = '0123456789abcdef'
const HUELLA_LIMPIA = 'a7f3c2e9b4d18056'
const HUELLA_SUCIA = '3b91e08d7c6a24f5'

export function TeselaHuella({ indice }: { indice: number }) {
  const { clase, armado, ciclando } = useTurno(indice)
  const [huella, setHuella] = useState(HUELLA_SUCIA)

  useEffect(() => {
    // Sin ciclo —sin JavaScript útil o con «reducir movimiento»— la tesela se
    // queda en su estado final, que es la huella ya alterada.
    if (!ciclando) { setHuella(HUELLA_SUCIA); return }
    if (!armado) { setHuella(HUELLA_LIMPIA); return }

    let fijos = 0
    let revuelve: ReturnType<typeof setInterval> | undefined
    let asienta: ReturnType<typeof setInterval> | undefined

    // El remolino arranca 900 ms después del destello: primero la causa
    // —el dígito alterado— y solo entonces el efecto.
    const arranque = setTimeout(() => {
      revuelve = setInterval(() => {
        setHuella(HUELLA_SUCIA.split('').map((c, i) =>
          i < fijos ? c : HEX[Math.floor(Math.random() * 16)]).join(''))
      }, 45)
      // Los caracteres se fijan de izquierda a derecha para que la avalancha
      // se vea PROPAGARSE y no aparecer de golpe.
      asienta = setInterval(() => {
        fijos += 1
        if (fijos > HUELLA_SUCIA.length) {
          if (revuelve) clearInterval(revuelve)
          if (asienta) clearInterval(asienta)
          setHuella(HUELLA_SUCIA)
        }
      }, 85)
    }, 900)

    return () => {
      clearTimeout(arranque)
      if (revuelve) clearInterval(revuelve)
      if (asienta) clearInterval(asienta)
    }
  }, [armado, ciclando])

  return (
    <div className={`${clase} w-full`}>
      <div className="rounded-lg border border-[#E4EAEF] bg-[#FAFBFC] px-3 py-2.5">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Valor del contrato:{' '}
          <span className={`${css.letraMala} rounded px-1 font-semibold`}
            style={{ color: '#374151' }}>
            {armado ? '$2.460.000' : '$2.450.000'}
          </span>
        </p>
      </div>
      <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
        {huella.split('').map((c, i) => (
          <span key={i} className={`${css.cifra} font-mono text-[13px] w-[15px] text-center`}
            style={{ color: armado ? ROJO : '#6B7280' }}>
            {c}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-gray-400 font-mono">SHA-256</p>
    </div>
  )
}

/* ── 3 · Infraestructura ─────────────────────────────────────────────────
   El contorno se traza y SOLO ENTONCES aparece el visto: dentro de algo que
   ya existe. Los sellos no se deslizan —se estampan—, que es lo que hace un
   sello. El peso lo cargan los nombres de las normas, concretos y
   verificables; el dibujo solo les da dónde aterrizar.

   LA LÍNEA QUE NO SE CRUZA: certificada está la INFRAESTRUCTURA, no el
   producto. Afirmar lo contrario ante una entidad pública es falso y
   comprobable — el rótulo de la tesela y su cuerpo lo dicen así. */
const NORMAS = ['ISO 27001', 'ISO 27017', 'ISO 27018', 'SOC 2'] as const

export function TeselaInfraestructura({ indice }: { indice: number }) {
  const { clase } = useTurno(indice)
  return (
    <div className={`${clase} w-full flex items-center justify-center gap-5`}>
      <svg width="54" height="62" viewBox="0 0 54 62" fill="none" aria-hidden="true" className="shrink-0">
        <path d="M27 3 L50 12 V30 C50 44 40 54 27 59 C14 54 4 44 4 30 V12 Z"
          stroke={MARCA} strokeWidth="2.4" strokeLinejoin="round" className={css.escudo} />
        <path d="M18 30.5 L24.5 37 L36 25" stroke={VERDE} strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round" className={css.visto} />
      </svg>
      <div className="flex flex-col gap-1.5">
        {NORMAS.map((n, i) => (
          <span key={n}
            className={`${css.selloNorma} rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide text-center`}
            style={{ backgroundColor: '#EEF2F5', color: MARCA, animationDelay: `${1500 + i * 150}ms` }}>
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── 4 · Trazabilidad y correo ───────────────────────────────────────────
   El renglón aterriza, su punto se SELLA —el candado de antes, vuelto gesto—
   y el sobre SALE VOLANDO. Que el sobre estuviera ahí no era lo mismo que
   haberse enviado, y lo que se vende es justamente el envío. */
const CADENA = [
  ['Enviado', '21 · 14:32'],
  ['En revisión', '22 · 09:15'],
  ['Aprobado', '22 · 16:40'],
] as const

export function TeselaTrazabilidad({ indice }: { indice: number }) {
  const { clase } = useTurno(indice)
  return (
    <div className={`${clase} w-full relative`}>
      {/* La línea que hace de esto una cadena y no una lista. */}
      <span className={`${css.cadena} absolute block`}
        style={{ left: 2.5, top: 10, width: 2, height: 52, backgroundColor: '#DCE4EA' }} />
      <div className="space-y-3 relative">
        {CADENA.map(([q, cuando], i) => (
          <div key={q} className={`${css.eslabon} flex items-center gap-2.5`}
            style={{ transitionDelay: `${i * 340}ms` }}>
            <span className={`${css.punto} w-[7px] h-[7px] rounded-full shrink-0 relative z-10`}
              style={{
                backgroundColor: i === CADENA.length - 1 ? VERDE : '#9FB2BF',
                transitionDelay: `${i * 340 + 220}ms`,
              }} />
            <span className="text-[12px] font-medium text-gray-700 flex-1">{q}</span>
            <span className="text-[10px] text-gray-400 font-mono">{cuando}</span>
            <span className={`${css.sobre} shrink-0`} style={{ animationDelay: `${i * 340 + 380}ms` }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2" y="5" width="20" height="14" rx="2.5" stroke={VERDE} strokeWidth="2.2" />
                <path d="M3 7 L12 13.5 L21 7" stroke={VERDE} strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 5 · El bloqueo ──────────────────────────────────────────────────────
   EL TEMBLOR ES LA TESELA. Alguien intenta enviar, el sistema se niega, y
   solo entonces llega lo que faltaba. Sin ese rechazo en pantalla, la tarjeta
   solo enseña una lista que se pone verde — y lo que hay que vender no es que
   se ponga verde: es que antes dijo que no. */
const COMPASES_BLOQUEO = [1250, 2450, 2950] as const

export function TeselaBloqueo({ indice }: { indice: number }) {
  const { clase, armado, ciclando } = useTurno(indice)
  const paso = usePasos(armado, COMPASES_BLOQUEO)
  // Sin ciclo, el estado final: un botón trabado para siempre no es la
  // promesa de la tesela, es su contrario.
  const completo = !ciclando || paso >= 2
  const puedeEnviar = !ciclando || paso >= 3

  return (
    <div className={`${clase} w-full`}>
      <div className="space-y-1.5">
        {[['Actividades', true], ['Evidencias', true], ['Planilla de seguridad social', completo]].map(([t, ok]) => (
          <div key={t as string} className="flex items-center gap-2">
            <span className={`${css.marcaEstado} w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0`}
              style={{ backgroundColor: ok ? VERDE : ROJO }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                {ok
                  ? <path d="M5 12.5 L10 17.5 L19 7" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  : <path d="M7 7 L17 17 M17 7 L7 17" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />}
              </svg>
            </span>
            <span className="text-[12px] text-gray-600">{t as string}</span>
          </div>
        ))}
      </div>
      <div className={`${css.botonMuda} ${css.sacude} mt-3.5 rounded-lg py-2 text-center text-[12px] font-semibold`}
        style={{
          backgroundColor: puedeEnviar ? VERDE : '#EEF1F4',
          color: puedeEnviar ? '#fff' : '#A3AEB8',
        }}>
        {puedeEnviar ? 'Enviar informe' : 'Falta la planilla'}
      </div>
    </div>
  )
}

/* ── 6 · Cualquier dispositivo ───────────────────────────────────────────
   El contenido SE REACOMODA de verdad: en el celular los renglones se apilan
   a lo ancho; en el computador se reparten en dos columnas. Antes solo se
   estiraban, que es cambiar de tamaño, no ser responsivo. */
const FORMAS = [
  { w: 50, h: 88, r: 9, rotulo: 'Celular', col: 100 },
  { w: 82, h: 96, r: 9, rotulo: 'Tableta', col: 100 },
  { w: 138, h: 84, r: 6, rotulo: 'Computador', col: 46 },
] as const

const COMPASES_FORMAS = [200, 1400, 2600] as const

export function TeselaDispositivos({ indice }: { indice: number }) {
  const { armado, ciclando } = useTurno(indice)
  const paso = usePasos(armado, COMPASES_FORMAS)
  // Sin turno se queda en el computador, que es el estado final de la vuelta.
  const f = FORMAS[ciclando && paso > 0 ? paso - 1 : FORMAS.length - 1]

  return (
    <div className="w-full flex flex-col items-center justify-center" style={{ minHeight: 116 }}>
      <div className={`${css.marco} border-2 flex flex-wrap content-start gap-1.5 p-2.5 overflow-hidden`}
        style={{ width: f.w, height: f.h, borderRadius: f.r, borderColor: '#C6D2DB' }}>
        {[0, 1, 2, 3, 4, 5].map(j => (
          <span key={j} className={`${css.barraFlex} block h-1.5 rounded-full shrink-0`}
            style={{ width: `${f.col}%`, backgroundColor: '#E6EDF2' }} />
        ))}
      </div>
      <span className="mt-3 text-[10px] text-gray-400">{f.rotulo}</span>
    </div>
  )
}

/* ── 7 · El paquete ──────────────────────────────────────────────────────
   Los documentos ya no se desvanecen al llegar: SE APILAN, y el contador sube
   mientras aterrizan. Lo satisfactorio de esta tesela es la acumulación, y
   desvaneciéndolos se estaba tirando justo eso a la basura. */
const SUELTOS = [
  { x: -62, y: -30, r: -20 }, { x: 58, y: -34, r: 16 }, { x: -52, y: 26, r: 12 },
  { x: 62, y: 22, r: -14 }, { x: 0, y: -44, r: 6 },
] as const
const COMPASES_PAQUETE = [260, 500, 740, 980, 1220] as const

export function TeselaPaquete({ indice }: { indice: number }) {
  const { clase, armado, ciclando } = useTurno(indice)
  const pasos = usePasos(armado, COMPASES_PAQUETE)
  const llegados = ciclando ? pasos : SUELTOS.length

  return (
    <div className={`${clase} relative w-full flex flex-col items-center justify-center`} style={{ height: 126 }}>
      <div className="relative" style={{ width: 120, height: 84 }}>
        {SUELTOS.map((s, i) => {
          const dentro = llegados > i
          return (
            <span key={i} className={`${css.vuela} absolute rounded border bg-white`}
              style={{
                width: 30, height: 38, left: 45, top: 22, borderColor: '#D9E4EC',
                transform: dentro
                  ? `translate(${(i - 2) * 3.5}px, ${-i * 3}px) rotate(${(i - 2) * 2}deg)`
                  : `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)`,
                zIndex: i,
              }}>
              <span className="block p-1.5 space-y-1">
                {[80, 58, 40].map((w, j) => (
                  <span key={j} className="block h-[2px] rounded-full"
                    style={{ width: `${w}%`, backgroundColor: '#E6EDF2' }} />
                ))}
              </span>
            </span>
          )
        })}

        {/* La banda que cierra el paquete, cuando ya está todo dentro. */}
        <span className={`${css.banda} absolute flex items-center justify-center rounded`}
          style={{
            left: 30, top: 36, width: 62, height: 17, zIndex: 10,
            backgroundColor: MARCA, color: '#fff',
          }}>
          <span className="text-[8px] font-bold tracking-wide">SECOP II</span>
        </span>
      </div>

      <span className="mt-1 text-[10px] text-gray-400 tabular-nums">
        {llegados} de {SUELTOS.length} documentos
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTO 4 · El código que se arma
   ═══════════════════════════════════════════════════════════════════════════ */

/** Retícula determinista: misma figura en servidor y cliente, sin Math.random
 *  —que daría un desajuste de hidratación— y con aire de código real. */
function tramaQR(lado: number): boolean[] {
  const celdas: boolean[] = []
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const esquina = (cx: number, cy: number) =>
        x >= cx && x < cx + 7 && y >= cy && y < cy + 7 &&
        !(x > cx && x < cx + 6 && y > cy && y < cy + 6 &&
          !(x > cx + 1 && x < cx + 5 && y > cy + 1 && y < cy + 5))
      if (esquina(0, 0) || esquina(lado - 7, 0) || esquina(0, lado - 7)) { celdas.push(true); continue }
      const zonaOjo = (x < 8 && y < 8) || (x > lado - 9 && y < 8) || (x < 8 && y > lado - 9)
      celdas.push(zonaOjo ? false : ((x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0))
    }
  }
  return celdas
}

export function CodigoQR() {
  const LADO = 21
  const { ref, clase } = useCiclo<HTMLDivElement>(6000, 0.3)
  const celdas = tramaQR(LADO)
  return (
    <div ref={ref} className={`${clase} inline-block p-4 rounded-2xl bg-white`}>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${LADO}, 7px)` }} aria-hidden="true">
        {celdas.map((llena, i) => (
          <span key={i} className={css.modulo}
            style={{
              width: 7, height: 7, borderRadius: 1,
              backgroundColor: llena ? MARCA : 'transparent',
              transitionDelay: `${((i % LADO) + Math.floor(i / LADO)) * 13}ms`,
            }} />
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Contador que cuenta al entrar
   ═══════════════════════════════════════════════════════════════════════════ */

export function Cifra({ hasta, sufijo = '', prefijo = '', decimales = 0 }: {
  hasta: number; sufijo?: string; prefijo?: string; decimales?: number
}) {
  const [n, setN] = useState<number | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || quieto() || typeof IntersectionObserver === 'undefined') return
    setN(0)
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      const DUR = 1400
      const t0 = performance.now()
      const paso = (ahora: number) => {
        const p = Math.min((ahora - t0) / DUR, 1)
        // Desaceleración cúbica: arranca rápido y se posa, que es como se lee
        // una cifra que «sube».
        setN(hasta * (1 - Math.pow(1 - p, 3)))
        if (p < 1) requestAnimationFrame(paso)
        else setN(null)
      }
      requestAnimationFrame(paso)
    }, { threshold: 0.5 })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [hasta])

  const valor = n === null ? hasta : n
  return (
    <span ref={ref}>
      {prefijo}{valor.toLocaleString('es-CO', {
        minimumFractionDigits: decimales, maximumFractionDigits: decimales,
      })}{sufijo}
    </span>
  )
}
