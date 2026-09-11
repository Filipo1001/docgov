'use client'

/**
 * Las escenas animadas del folleto.
 *
 * NINGUNA ES DECORATIVA. Se pidió expresamente que las ventajas no fueran
 * «palabras ni emojis, sino animaciones», y el criterio que aplico es más
 * estrecho todavía: cada tesela anima EXACTAMENTE el argumento que tiene que
 * dejar creído, y solo ese. La de evidencias repetidas deforma la foto porque
 * lo increíble es que la reconozca deformada; la de la huella revuelve el
 * SHA-256 porque el efecto avalancha no se entiende leyéndolo. Si una tesela
 * se puede contar con una frase, no lleva animación.
 *
 * Todas arrancan en su estado FINAL y solo retroceden cuando el script
 * confirma que puede animar. Sin JavaScript el folleto se lee completo — misma
 * regla que gobierna Revelar.tsx y Contador.tsx.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
import css from './brochure.module.css'

const VERDE = '#10b981'
const AMBAR = '#D98324'

function quieto(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Dispara al entrar en pantalla. Devuelve `dormido` solo si el efecto llegó a
 * armarse: si no hay observador, o si se pidió menos movimiento, nunca duerme
 * y la escena se queda en su estado final.
 */
function useAlEntrar<T extends HTMLElement>(umbral = 0.35) {
  const ref = useRef<T>(null)
  const [fase, setFase] = useState<'inicial' | 'dormido' | 'armado'>('inicial')

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || quieto() || typeof IntersectionObserver === 'undefined') return
    setFase('dormido')
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      // Un cuadro de respiro: el navegador tiene que pintar el estado dormido
      // antes de que la transición tenga algo desde donde salir.
      requestAnimationFrame(() => requestAnimationFrame(() => setFase('armado')))
    }, { threshold: umbral })
    obs.observe(nodo)
    const respaldo = setTimeout(() => setFase('armado'), 3000)
    return () => { obs.disconnect(); clearTimeout(respaldo) }
  }, [umbral])

  const clase = fase === 'dormido' ? css.dormido : fase === 'armado' ? css.armado : ''
  return { ref, clase, armado: fase === 'armado' }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTO 1 · El expediente que crece
   ═══════════════════════════════════════════════════════════════════════════ */

export function ExpedienteCrece() {
  const { ref, clase } = useAlEntrar<HTMLDivElement>(0.2)
  return (
    <div ref={ref} className={`${clase} relative mx-auto`} style={{ width: 210, height: 150 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          className={`${css.hoja} absolute rounded-lg border`}
          style={{
            width: 118, height: 88,
            left: 46 + (i - 2) * 15,
            top: 52 - i * 11,
            borderColor: 'rgba(255,255,255,.22)',
            backgroundColor: `rgba(255,255,255,${0.05 + i * 0.035})`,
            transform: `rotate(${(i - 2) * 2.4}deg)`,
            transitionDelay: `${i * 110}ms`,
            backdropFilter: 'blur(2px)',
          }}
        >
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
  { n: 'Certificación de retención', q: 'Contratación' },
]

export function ElMomento() {
  const [sellado, setSellado] = useState(false)
  const [salidos, setSalidos] = useState(0)
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    const correr = () => {
      if (quieto()) { setSellado(true); setSalidos(PIEZAS.length); return }
      relojes.current.push(setTimeout(() => setSellado(true), 1700))
      // 800 ms después del cierre, no a la vez: si la confirmación y los
      // papeles se pisan, el verde deja de ser un momento.
      PIEZAS.forEach((_, i) =>
        relojes.current.push(setTimeout(() => setSalidos(i + 1), 2500 + i * 240)))
    }
    if (typeof IntersectionObserver === 'undefined') { correr(); return }
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect(); correr()
    }, { threshold: 0.3 })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [])

  useEffect(() => () => relojes.current.forEach(clearTimeout), [])

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
   ACTO 3 · Las teselas de capacidad
   ═══════════════════════════════════════════════════════════════════════════ */

function Tesela({ titulo, cuerpo, children, ancha = false }: {
  titulo: string; cuerpo: string; children: ReactNode; ancha?: boolean
}) {
  return (
    <div className={`rounded-2xl border border-[#E4EAEF] bg-white p-5 sm:p-6 flex flex-col ${ancha ? 'sm:col-span-2' : ''}`}>
      <div className="flex-1 flex items-center justify-center min-h-[132px] py-2">{children}</div>
      <p className="mt-4 font-semibold text-gray-900 text-[15px] leading-snug">{titulo}</p>
      <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">{cuerpo}</p>
    </div>
  )
}

/** La foto de la derecha está girada, ampliada y recontrastada — y aun así el
 *  sistema la empareja. Es el argumento entero, hecho imagen. */
export function TeselaDuplicados() {
  const { ref, clase } = useAlEntrar<HTMLDivElement>(0.4)
  const foto = (girada: boolean) => (
    <span className={`${girada ? css.gemela : ''} block rounded-lg overflow-hidden`}
      style={{ width: 62, height: 62, background: 'linear-gradient(135deg,#8FB4C9 0%,#5C8AA6 45%,#3E6880 100%)' }}>
      <span className="block w-full h-full relative">
        <span className="absolute rounded-full" style={{ width: 14, height: 14, top: 9, right: 10, backgroundColor: 'rgba(255,255,255,.75)' }} />
        <span className="absolute" style={{ left: 0, right: 0, bottom: 0, height: 26,
          background: 'linear-gradient(180deg,transparent,rgba(28,52,68,.65))' }} />
      </span>
    </span>
  )
  return (
    <div ref={ref} className={`${clase} relative w-full flex items-center justify-center gap-10`}>
      <div className="flex flex-col items-center gap-2">
        {foto(false)}
        <span className="text-[10px] text-gray-400">marzo</span>
      </div>
      <svg className="absolute" width="120" height="40" viewBox="0 0 120 40" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <path d="M12 20 C 40 6, 80 6, 108 20" fill="none" stroke={AMBAR} strokeWidth="2"
          strokeLinecap="round" className={css.lazo} />
      </svg>
      <div className="flex flex-col items-center gap-2">
        {foto(true)}
        <span className="text-[10px] text-gray-400">abril</span>
      </div>
      <span className={`${css.alerta} absolute -bottom-1 px-2.5 py-1 rounded-full text-[10px] font-semibold`}
        style={{ backgroundColor: '#FBF0E2', color: AMBAR }}>
        Misma imagen
      </span>
    </div>
  )
}

/** Se altera un carácter del documento y la huella entera cambia. */
export function TeselaHuella() {
  const { ref, clase, armado } = useAlEntrar<HTMLDivElement>(0.4)
  const antes = 'a7f3c2e9b4d18056'
  const despues = '3b91e08d7c6a24f5'
  const huella = armado ? despues : antes
  return (
    <div ref={ref} className={`${clase} w-full`}>
      <div className="rounded-lg border border-[#E4EAEF] bg-[#FAFBFC] px-3 py-2.5">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Valor del contrato:{' '}
          <span className={`${css.letraMala} rounded px-1 font-semibold`}
            style={{ color: armado ? undefined : '#374151' }}>
            {armado ? '$2.460.000' : '$2.450.000'}
          </span>
        </p>
      </div>
      <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
        {huella.split('').map((c, i) => (
          <span key={i}
            className={`${css.cifra} ${armado ? css.cifraGira : ''} font-mono text-[13px] w-[15px] text-center`}
            style={{ color: armado ? '#E0574F' : '#6B7280', animationDelay: `${i * 22}ms` }}>
            {c}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-gray-400 font-mono">SHA-256</p>
    </div>
  )
}

/** El valor en letras: la causa número uno de una cuenta de cobro devuelta. */
export function TeselaLetras() {
  const { ref, clase } = useAlEntrar<HTMLDivElement>(0.4)
  return (
    <div ref={ref} className={`${clase} w-full text-center`}>
      <p className="text-2xl font-bold tracking-tight text-gray-900">$2.450.000</p>
      <svg className="mx-auto my-2" width="16" height="18" viewBox="0 0 16 18" fill="none" aria-hidden="true">
        <path d="M8 1 V 14 M3 10 L8 15 L13 10" stroke="#9CA3AF" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className={`${css.enLetras} text-[11px] font-semibold uppercase tracking-wide leading-relaxed`}
        style={{ color: MARCA }}>
        Dos millones cuatrocientos<br />cincuenta mil pesos m/cte
      </p>
    </div>
  )
}

/** La cadena de trazabilidad: cada acción con su responsable y su hora. */
export function TeselaTrazabilidad() {
  const { ref, clase } = useAlEntrar<HTMLDivElement>(0.4)
  const pasos = [
    ['Enviado', '21 · 14:32'],
    ['En revisión', '22 · 09:15'],
    ['Aprobado', '22 · 16:40'],
  ]
  return (
    <div ref={ref} className={`${clase} w-full space-y-2`}>
      {pasos.map(([q, cuando], i) => (
        <div key={q} className={`${css.eslabon} flex items-center gap-2.5`}
          style={{ transitionDelay: `${i * 150}ms` }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: i === pasos.length - 1 ? VERDE : '#C6D2DB' }} />
          <span className="text-[12px] font-medium text-gray-700 flex-1">{q}</span>
          <span className="text-[10px] text-gray-400 font-mono">{cuando}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
            <rect x="5" y="11" width="14" height="10" rx="2" stroke="#9CA3AF" strokeWidth="2.4" />
            <path d="M8 11 V 7 a4 4 0 0 1 8 0 v 4" stroke="#9CA3AF" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
      ))}
    </div>
  )
}

/** El envío no sale incompleto: el sistema no lo permite. */
export function TeselaBloqueo() {
  const { ref, clase, armado } = useAlEntrar<HTMLDivElement>(0.4)
  return (
    <div ref={ref} className={`${clase} w-full`}>
      <div className="space-y-1.5">
        {[['Actividades', true], ['Evidencias', true], ['Planilla de seguridad social', armado]].map(([t, ok]) => (
          <div key={t as string} className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300"
              style={{ backgroundColor: ok ? VERDE : '#E0574F' }}>
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
      <div className={`${css.botonMuda} mt-3.5 rounded-lg py-2 text-center text-[12px] font-semibold`}
        style={{ backgroundColor: armado ? VERDE : '#EEF1F4', color: armado ? '#fff' : '#A3AEB8' }}>
        {armado ? 'Enviar informe' : 'Falta la planilla'}
      </div>
    </div>
  )
}

/** Sin instalar nada: el mismo expediente en cualquier pantalla. */
export function TeselaDispositivos() {
  const [paso, setPaso] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const nodo = ref.current
    if (!nodo || quieto() || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      const id = setInterval(() => setPaso(p => (p + 1) % 3), 1500)
      nodo.dataset.reloj = String(id)
    }, { threshold: 0.4 })
    obs.observe(nodo)
    return () => {
      obs.disconnect()
      if (nodo.dataset.reloj) clearInterval(Number(nodo.dataset.reloj))
    }
  }, [])
  const formas = [
    { w: 46, h: 84, r: 8, rotulo: 'Celular' },
    { w: 72, h: 96, r: 8, rotulo: 'Tableta' },
    { w: 132, h: 84, r: 6, rotulo: 'Computador' },
  ]
  const f = formas[paso]
  return (
    <div ref={ref} className="w-full flex flex-col items-center justify-center" style={{ minHeight: 110 }}>
      <div className={`${css.marco} border-2 flex flex-col gap-1 p-2 overflow-hidden`}
        style={{ width: f.w, height: f.h, borderRadius: f.r, borderColor: '#C6D2DB' }}>
        {[100, 74, 88, 52].map((w, j) => (
          <span key={j} className="block h-1 rounded-full shrink-0"
            style={{ width: `${w}%`, backgroundColor: '#E6EDF2' }} />
        ))}
      </div>
      <span className="mt-2.5 text-[10px] text-gray-400">{f.rotulo}</span>
    </div>
  )
}

/** El paquete del mes, armado y en orden. */
export function TeselaPaquete() {
  const { ref, clase, armado } = useAlEntrar<HTMLDivElement>(0.4)
  const sueltos = [
    { x: -54, y: -24, r: -18 }, { x: 48, y: -30, r: 14 },
    { x: -42, y: 22, r: 10 }, { x: 52, y: 18, r: -12 },
  ]
  return (
    <div ref={ref} className={`${clase} relative w-full flex items-center justify-center`} style={{ height: 116 }}>
      {sueltos.map((s, i) => (
        <span key={i} className={`${css.vuela} absolute rounded border bg-white`}
          style={{
            width: 28, height: 36, borderColor: '#D9E4EC',
            transform: armado ? `translate(0,${-i * 2}px) rotate(0deg)` : `translate(${s.x}px,${s.y}px) rotate(${s.r}deg)`,
            opacity: armado ? 0 : 1,
            transitionDelay: `${i * 90}ms`,
          }} />
      ))}
      <span className="relative rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-colors duration-500"
        style={{ width: 64, height: 52, borderColor: armado ? MARCA : '#D9E4EC',
                 backgroundColor: armado ? '#F4F7F9' : 'transparent' }}>
        <span className="text-[9px] font-bold tracking-wide" style={{ color: armado ? MARCA : '#C6D2DB' }}>
          SECOP II
        </span>
        <span className="text-[8px]" style={{ color: '#9CA3AF' }}>{armado ? '5 documentos' : '—'}</span>
      </span>
    </div>
  )
}

export { Tesela }

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
  const { ref, clase } = useAlEntrar<HTMLDivElement>(0.3)
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
