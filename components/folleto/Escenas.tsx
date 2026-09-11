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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
import css from './folleto.module.css'

const VERDE = '#10b981'
const AMBAR = '#D98324'
/** El verde pleno no se lee como texto sobre claro; este sí. */
const VERDE_OSCURO = '#0B7A5C'
const ROJO = '#E0574F'

/**
 * ¿Pidió este aparato menos movimiento?
 *
 * YA NO DETIENE LOS CICLOS, y ese fue el error que dejó el folleto muerto en
 * todo iPhone con el ajuste puesto — que son muchísimos, porque se activa para
 * quitarle el zoom a iOS, no para desactivar páginas. Las escenas siguen
 * corriendo y contando su historia; el CSS se encarga de que la cuenten con
 * opacidad y color en vez de con desplazamientos, giros y escalas.
 *
 * Queda para lo único que el CSS no puede matizar: el revuelto de caracteres
 * de la huella, que es texto cambiando a toda velocidad y no tiene versión
 * suave.
 */
function quieto(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * LA FRANJA DEL FOCO.
 *
 * «Estar en pantalla» y «tener la atención» no son lo mismo. El disparador no
 * es la pantalla entera sino su TERCIO CENTRAL: márgenes negativos del 28%
 * arriba y abajo dejan una franja del 44% en mitad del alto, que es donde de
 * verdad se está mirando.
 */
const FRANJA_FOCO = '-28% 0px -28% 0px'

/** Reparto máximo del escalonado, en milisegundos. */
const ESCALON_MAX = 260

/**
 * Una escena: actúa UNA VEZ al entrar en el foco, y no se repite.
 *
 * ── POR QUÉ SE FUE EL BUCLE ──────────────────────────────────────────────
 *
 * Repetir obligaba a tres cosas, y las tres se percibían como una pausa:
 * un REBOBINADO visible antes de cada vuelta, un tiempo MUERTO al final de
 * cada una para que el remate se alcanzara a leer, y —en las teselas— una
 * ESPERA DE TURNO en la que una tarjeta que ya había contado su historia se
 * quedaba quieta hasta que su turno expiraba. Ninguna era un error de
 * milisegundos: eran el precio de repetir.
 *
 * Las páginas de producto de Apple no repiten nada. Sus animaciones avanzan
 * con el recorrido y se quedan donde las dejas. Quitando el bucle desaparecen
 * las tres pausas de golpe, y lo que queda es lo que se pidió: cada escena se
 * enciende cuando llegas a ella.
 *
 * ── DOS OBSERVADORES, NO UNO ─────────────────────────────────────────────
 *
 * El del FOCO manda actuar cuando la escena entra en la franja central. El de
 * SALIDA rebobina, pero solo cuando la escena ha salido POR COMPLETO de la
 * pantalla — nunca mientras se ve. Rebobinar dentro del campo de visión era
 * justamente lo que se leía como un tirón.
 *
 * El escalonado sale de la posición horizontal del elemento, no de su índice:
 * así la ola va de izquierda a derecha en escritorio y en un teléfono —donde
 * todo está en la misma columna— desaparece sola, sin lógica de puntos de
 * corte que mantener.
 */
function useEscena() {
  const ref = useRef<HTMLDivElement>(null)
  const [fase, setFase] = useState<'inicial' | 'listo' | 'corriendo'>('inicial')

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof IntersectionObserver === 'undefined') return

    let reloj: ReturnType<typeof setTimeout> | undefined
    let respondio = false

    const foco = new IntersectionObserver(([e]) => {
      respondio = true
      if (!e.isIntersecting) return
      if (reloj) clearTimeout(reloj)
      const r = nodo.getBoundingClientRect()
      const reparto = Math.round((r.left / Math.max(window.innerWidth, 1)) * ESCALON_MAX)
      reloj = setTimeout(() => {
        // DOS CUADROS DE RESPIRO, y no son un capricho. Una transición de CSS
        // necesita que el navegador haya PINTADO el estado de partida para
        // tener desde dónde salir; si el rebobinado y el arranque caen en el
        // mismo cuadro, no hay transición y la escena aparece ya terminada.
        //
        // Pasaba solo a veces, y por eso costó verlo: el reparto sale de la
        // posición horizontal, así que en dos columnas la escena está a la
        // derecha y hereda ~140 ms —de sobra—, pero en una sola columna
        // empieza pegada al margen y baja a unos 16 ms, menos de un fotograma.
        requestAnimationFrame(() => requestAnimationFrame(() => setFase('corriendo')))
      }, reparto)
    }, { threshold: 0, rootMargin: FRANJA_FOCO })

    const salida = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) return
      if (reloj) clearTimeout(reloj)
      setFase('listo')
    }, { threshold: 0 })

    foco.observe(nodo)
    salida.observe(nodo)

    // Punto de partida: rebobinada. Si ya está en el foco al cargar —la
    // portada lo está—, el observador lo dirá en el mismo cuadro.
    setFase('listo')

    // Red de seguridad: sin respuesta del observador, la escena actúa igual.
    // Quedarse rebobinada sería peor que no animar, porque es un estado a
    // medias y no el resultado.
    const respaldo = setTimeout(() => { if (!respondio) setFase('corriendo') }, 2500)

    return () => {
      foco.disconnect(); salida.disconnect()
      if (reloj) clearTimeout(reloj)
      clearTimeout(respaldo)
    }
  }, [])

  const clase = fase === 'listo' ? css.dormido : fase === 'corriendo' ? css.armado : ''
  return { ref, clase, armado: fase === 'corriendo', ciclando: fase !== 'inicial' }
}

/**
 * Envoltorio de la rejilla. Ya no dirige nada —cada tesela se gobierna sola
 * desde que se fueron los turnos— pero se conserva para no tocar la página.
 */
export function Secuencia({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}

/** Cuenta compases dentro de una vuelta./** Cuenta compases dentro de una vuelta. Los tiempos van como constante de
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

/**
 * El desorden que llega: siete soportes, cada uno reconocible de un vistazo.
 *
 * Tienen que verse DESORDENADOS —girados, de distinto tamaño y forma, con el
 * borde punteado— porque el contraste con los cinco documentos idénticos que
 * salen después es el argumento entero. Si entran ordenados, no hay
 * transformación que mostrar; y si entran todos iguales, tampoco: se leen
 * como siete rectángulos y no como los papeles sueltos de un contratista.
 *
 * Las posiciones van escritas a mano y no al azar: `Math.random` daría un
 * desajuste entre lo que pinta el servidor y lo que pinta el navegador.
 */
const SOPORTES = [
  { x: -138, y: -72, giro: -17, w: 42, h: 42, tipo: 'foto' },
  { x: 134, y: -78, giro: 14, w: 36, h: 44, tipo: 'planilla' },
  { x: -152, y: 32, giro: 10, w: 44, h: 32, tipo: 'recibo' },
  { x: 148, y: 24, giro: -12, w: 38, h: 42, tipo: 'nota' },
  { x: -18, y: -106, giro: 7, w: 34, h: 42, tipo: 'cuenta' },
  { x: 94, y: -12, giro: -8, w: 32, h: 32, tipo: 'foto' },
  { x: -98, y: -16, giro: 12, w: 30, h: 38, tipo: 'planilla' },
] as const

/**
 * La escena existe en dos tintas.
 *
 * No es un tema ni una preferencia del visitante: es que el folleto puede
 * asentarse sobre fondo claro, y una escena pintada en blanco sobre claro
 * simplemente no existe. Todo lo que aquí se dibuja —contornos, renglones,
 * la carpeta misma— sale de esta tabla, así que invertirla es una línea y no
 * una revisión de cada elemento.
 *
 * El verde NO cambia. Es el color con el que el producto dice «confirmado», y
 * funciona igual sobre las dos tintas; cambiarlo rompería el único código de
 * color que la página mantiene de principio a fin.
 */
type Tinta = {
  logo: string; borde: string; relleno: string; renglon: string;
  orbita: string; halo: string; papel: string; bordePapel: string;
}

const TINTA_OSCURA: Tinta = {
  logo: '#FFFFFF',
  borde: 'rgba(255,255,255,.34)',
  relleno: 'rgba(255,255,255,.13)',
  renglon: 'rgba(255,255,255,.45)',
  orbita: 'rgba(255,255,255,.13)',
  halo: 'rgba(127,203,184,.16)',
  papel: 'rgba(255,255,255,.14)',
  bordePapel: 'rgba(255,255,255,.32)',
}

const TINTA_CLARA: Tinta = {
  logo: MARCA,
  // Los soportes se veían con un relleno del 5% sobre fondo arena: existían,
  // medían bien y tenían opacidad 1, pero no se distinguían del fondo. Y son
  // justo lo que la escena tiene que contar — el desorden que entra. Pasan a
  // blanco con contorno más firme: papel suelto sobre un escritorio, que es
  // exactamente lo que representan.
  borde: 'rgba(25,32,49,.38)',
  relleno: '#FFFFFF',
  renglon: 'rgba(25,32,49,.34)',
  orbita: 'rgba(25,32,49,.12)',
  halo: 'rgba(16,185,129,.14)',
  papel: '#FFFFFF',
  bordePapel: 'rgba(25,32,49,.16)',
}

function Soporte({ tipo, w, h, t }: { tipo: string; w: number; h: number; t: Tinta }) {
  if (tipo === 'foto') {
    return (
      <span className="block rounded-[3px] border border-dashed overflow-hidden"
        style={{ width: w, height: h, borderColor: t.borde,
                 background: 'linear-gradient(135deg,#8FB4C9 0%,#4E7A93 55%,#33566B 100%)' }}>
        <span className="block rounded-full"
          style={{ width: Math.round(w * .22), height: Math.round(w * .22), margin: '15% 0 0 12%',
                   backgroundColor: 'rgba(255,255,255,.82)' }} />
        <span className="block" style={{ marginTop: '18%', height: '38%',
          background: 'linear-gradient(180deg,transparent,rgba(20,44,60,.7))' }} />
      </span>
    )
  }
  if (tipo === 'recibo') {
    // Angosto y con el pie dentado, como un tirilla de caja.
    return (
      <span className="block border border-dashed p-1"
        style={{ width: w, height: h, borderColor: t.borde, backgroundColor: t.relleno,
                 clipPath: 'polygon(0 0,100% 0,100% 88%,88% 100%,75% 88%,62% 100%,50% 88%,38% 100%,25% 88%,12% 100%,0 88%)' }}>
        {[70, 90, 52].map((a, i) => (
          <span key={i} className="block rounded-full mb-[3px]"
            style={{ width: `${a}%`, height: 2, backgroundColor: t.renglon }} />
        ))}
      </span>
    )
  }
  if (tipo === 'nota') {
    // Garabato a mano: dos trazos irregulares. Lee como «escrito a bolígrafo».
    return (
      <span className="block rounded-[3px] border border-dashed"
        style={{ width: w, height: h, borderColor: t.borde, backgroundColor: 'rgba(214,180,60,.14)' }}>
        <svg viewBox="0 0 30 34" width={w} height={h} fill="none" aria-hidden="true">
          <path d="M5 10 q6 -4 10 0 t10 -1" stroke={t.renglon} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M5 18 q8 -3 13 1 t6 -1" stroke={t.renglon} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M5 26 q5 -3 9 0" stroke={t.renglon} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  if (tipo === 'cuenta') {
    // Lleva una cifra: es la cuenta de cobro.
    return (
      <span className="block rounded-[3px] border border-dashed p-1"
        style={{ width: w, height: h, borderColor: t.borde, backgroundColor: t.relleno }}>
        <span className="block rounded-full mb-1" style={{ width: '58%', height: 2, backgroundColor: t.renglon }} />
        <span className="block font-bold leading-none" style={{ fontSize: 9, color: t.logo, opacity: .75 }}>$</span>
        <span className="block rounded-full mt-1" style={{ width: '78%', height: 2, backgroundColor: t.renglon }} />
      </span>
    )
  }
  // Planilla: una retícula, que es como se ve una de verdad.
  return (
    <span className="block rounded-[3px] border border-dashed p-[3px]"
      style={{ width: w, height: h, borderColor: t.borde, backgroundColor: t.relleno }}>
      <span className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="block rounded-[1px]"
            style={{ height: 3, backgroundColor: i % 4 === 0 ? t.renglon : t.orbita }} />
        ))}
      </span>
    </span>
  )
}

/** Los cinco que salen: idénticos, limpios, en abanico. */
const SALIDAS = [
  { x: -116, giro: -9 }, { x: -58, giro: -4.5 }, { x: 0, giro: 0 },
  { x: 58, giro: 4.5 }, { x: 116, giro: 9 },
] as const

const LADO_CARPETA = 92

export function ExpedienteVivo({ claro = false }: { claro?: boolean }) {
  const { ref, clase } = useEscena()
  const t = claro ? TINTA_CLARA : TINTA_OSCURA

  return (
    <div ref={ref} className={`${clase} ${css.escenario} relative mx-auto`}
      style={{ width: 340, height: 300 }}>

      {/* ── Atmósfera: late siempre, también en reposo ──────────────── */}
      <span className={`${css.aliento} absolute rounded-full pointer-events-none`}
        style={{
          left: '50%', top: 66, width: 300, height: 300, marginLeft: -150, marginTop: -150,
          background: `radial-gradient(circle, ${t.halo} 0%, transparent 62%)`,
        }} />

      {/* ── La órbita, que no para ──────────────────────────────────── */}
      <svg className={`${css.orbita} absolute pointer-events-none`}
        width="216" height="216" viewBox="0 0 216 216"
        style={{ left: '50%', top: 66, marginLeft: -108, marginTop: -108 }} aria-hidden="true">
        <circle cx="108" cy="108" r="100" fill="none" stroke={t.orbita}
          strokeWidth="1" strokeDasharray="3 9" />
      </svg>

      {/* ── La carpeta, su resplandor y su onda ─────────────────────── */}
      <div className="absolute" style={{ left: '50%', top: 20, transform: 'translateX(-50%)' }}>
        <div className="relative">
          <span className={`${css.onda} absolute rounded-full pointer-events-none`}
            style={{ left: '50%', top: '50%', width: 130, height: 130, marginLeft: -65, marginTop: -65,
                     border: `2px solid ${VERDE}` }} />
          <span className={`${css.brillo} absolute rounded-full pointer-events-none`}
            style={{
              left: '50%', top: '50%', width: 164, height: 164, marginLeft: -82, marginTop: -82,
              // El desenfoque va COCIDO EN EL DEGRADADO y no en un `filter`.
              // Un radial con suficientes paradas ES un desenfoque, pero
              // gratis: `filter: blur()` sobre algo que además escala obliga a
              // rasterizar de nuevo en cada fotograma.
              background: 'radial-gradient(circle, rgba(16,185,129,.92) 0%, rgba(16,185,129,.66) 22%, rgba(16,185,129,.34) 42%, rgba(16,185,129,.14) 58%, rgba(16,185,129,.04) 72%, transparent 82%)',
            }} />
          <span className={`${css.carpeta} relative block`}>
            <LogoCD size={LADO_CARPETA} color={t.logo} />
          </span>
          <span className={`${css.vistoPestana} absolute flex items-center justify-center rounded-full`}
            style={{ width: 26, height: 26, left: -9, top: -9, backgroundColor: VERDE }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5 L10 17.5 L19 7" stroke="#fff" strokeWidth="3.2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>

      {/* ── El desorden, que llega por una curva ────────────────────── */}
      {SOPORTES.map((f, i) => (
        <span key={i} className={`${css.arcoX} absolute`}
          style={{
            left: '50%', top: 58, marginLeft: -f.w / 2,
            ['--x' as string]: `${f.x}px`,
            transitionDelay: `${900 + i * 65}ms`,
          }}>
          <span className={`${css.arcoY} block`}
            style={{
              ['--y' as string]: `${f.y}px`,
              transitionDelay: `${900 + i * 65}ms, ${2100 + i * 50}ms`,
            }}>
            {/* Flotan mientras esperan su turno de viajar. */}
            <span className={`${css.flota} block`}
              style={{ ['--giro' as string]: `${f.giro}deg`, animationDelay: `${i * 420}ms` }}>
              <Soporte tipo={f.tipo} w={f.w} h={f.h} t={t} />
            </span>
          </span>
        </span>
      ))}

      {/* ── El expediente que sale, y su comprobación ───────────────── */}
      {SALIDAS.map((d, i) => (
        <span key={i} className={`${css.emerge} absolute rounded-[4px] border`}
          style={{
            left: '50%', top: 190, width: 44, height: 58, marginLeft: -22,
            borderColor: t.bordePapel,
            backgroundColor: t.papel,
            // La posición viaja en variables y NO en `transform`, para que el
            // CSS pueda componer «dónde va» con «cómo llega». Cuando estaba en
            // línea pasaban dos cosas malas: la regla de reposo nunca se
            // aplicaba —un estilo en línea gana a cualquier clase, así que los
            // documentos jamás llegaron a salir de la carpeta, solo aparecían—
            // y la de «reducir movimiento», que sí lleva `!important`, los
            // apilaba a los cinco en el mismo punto: uno solo bajo el logo.
            ['--px' as string]: `${d.x}px`,
            ['--rot' as string]: `${d.giro}deg`,
            transitionDelay: `${2700 + i * 70}ms`,
            // SIN `backdrop-filter`. Estaba en los cinco documentos a la vez y
            // es lo más caro que se puede pedir por fotograma en la GPU de un
            // teléfono: obliga a re-muestrear y desenfocar el fondo en cada
            // cuadro mientras el elemento se mueve. Y no aportaba NADA — el
            // fondo de esta sección es un color plano, y desenfocar un color
            // plano devuelve el mismo color plano. Puro coste.
          }}>
          <span className="block p-1.5">
            {[84, 62, 74, 48].map((ancho, j) => (
              <span key={j} className="block rounded-full mb-[3px]"
                style={{ width: `${ancho}%`, height: 2.5, backgroundColor: t.renglon }} />
            ))}
          </span>
          <span className={`${css.selloDoc} absolute`}
            style={{ right: 4, bottom: 4, animationDelay: `${3400 + i * 70}ms`, color: VERDE }}>
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="3" />
              <rect x="14" y="1" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="3" />
              <rect x="1" y="14" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="3" />
              <rect x="14" y="14" width="4" height="4" fill="currentColor" />
            </svg>
          </span>
        </span>
      ))}

      {/* El barrido de comprobación pasa por los cinco ya sellados. */}
      <span className={`${css.barridoVerde} absolute pointer-events-none`}
        style={{
          left: '50%', top: 182, width: 26, height: 74, marginLeft: -13,
          background: `linear-gradient(90deg, transparent, ${VERDE}55 45%, ${VERDE}99 50%, ${VERDE}55 55%, transparent)`,
        }} />
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
  const { ref, armado, ciclando } = useEscena()

  // Igual que las demás escenas: toca UNA VEZ al llegar al foco y se queda en
  // su remate. El bucle anterior tenía 3,5 s de parada muerta al final de cada
  // vuelta para que el verde se alcanzara a leer — y esa parada era justo lo
  // que se percibía como un tirón.
  useEffect(() => {
    if (!ciclando) { setSellado(true); setSalidos(PIEZAS.length); return }
    if (!armado) { setSellado(false); setSalidos(0); return }

    const relojes: ReturnType<typeof setTimeout>[] = []
    relojes.push(setTimeout(() => setSellado(true), 1500))
    // 800 ms después del cierre, no a la vez: si la confirmación y los papeles
    // se pisan, el verde deja de ser un momento.
    PIEZAS.forEach((_, i) =>
      relojes.push(setTimeout(() => setSalidos(i + 1), 2300 + i * 220)))
    return () => relojes.forEach(clearTimeout)
  }, [armado, ciclando])

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
                  <span className="block text-[11px] text-gray-400 mt-0.5">{p.q}</span>
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

function Tesela({ titulo, cuerpo, children, ancha = false, altoEscena = 132 }: {
  titulo: string; cuerpo: string; children: ReactNode; ancha?: boolean
  /** Alto mínimo de la caja de la escena. 132 sirve a seis de las siete; la de
   *  duplicados necesita más, porque su insignia («Ya se usó en marzo») no
   *  cabe en los ~20px de margen que deja una escena de 90px dentro de 132. */
  altoEscena?: number
}) {
  return (
    <div className={`rounded-2xl border border-[#E4EAEF] bg-white p-5 sm:p-6 flex flex-col ${ancha ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <div className="flex-1 flex items-center justify-center py-2 overflow-hidden" style={{ minHeight: altoEscena }}>{children}</div>
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

export function TeselaDuplicados() {
  const { ref, clase } = useEscena()
  return (
    <div ref={ref} className={`${clase} relative w-full flex items-center justify-center gap-9`}>
      <div className="flex flex-col items-center gap-2">
        <Foto />
        <span className="text-[11px] text-gray-400">marzo</span>
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
        <span className="text-[11px] text-gray-400">abril</span>
      </div>

      {/* Sin `left` explícito, el navegador colocaba la insignia por su
          posición «estática» en el flujo — que varía con el ancho del
          contenedor y en pantallas angostas la dejaba tapando el rótulo
          «marzo» de la primera foto. El centrado va en un envoltorio aparte,
          porque `.alerta` anima su propio `transform` (la entrada con rebote)
          y un `translateX` en el mismo elemento se perdería al terminar la
          animación, que fija `transform: none`. */}
      {/* Con -6 la insignia quedaba a la MISMA altura que «marzo»/«abril» y
          los tapaba enteros: la caja de esta escena medía 132px, la escena
          90,5, y eso deja solo ~20px de margen a cada lado — menos que los
          24,5px de la propia insignia, así que no había desplazamiento posible
          sin recortarla contra el `overflow-hidden` de la tarjeta. La tarjeta
          pide una caja más alta (172px, ver `altoEscena` en page.tsx) y la
          insignia baja lo que ese margen nuevo permite. */}
      <span className="absolute" style={{ bottom: -30, left: '50%', transform: 'translateX(-50%)' }}>
        <span className={`${css.alerta} block px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap`}
          style={{ backgroundColor: '#FBF0E2', color: AMBAR }}>
          Ya se usó en marzo
        </span>
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

export function TeselaHuella() {
  const { ref, clase, armado, ciclando } = useEscena()
  const [huella, setHuella] = useState(HUELLA_SUCIA)

  useEffect(() => {
    // Sin ciclo —sin JavaScript útil— la tesela se queda en su estado final,
    // que es la huella ya alterada.
    if (!ciclando) { setHuella(HUELLA_SUCIA); return }
    if (!armado) { setHuella(HUELLA_LIMPIA); return }
    // Con «reducir movimiento», la huella cambia de golpe y en rojo. El
    // remolino es texto girando a toda velocidad y no tiene versión suave,
    // pero su conclusión —cambió entera— se entiende igual sin él.
    if (quieto()) { setHuella(HUELLA_SUCIA); return }

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
    <div ref={ref} className={`${clase} w-full`}>
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
      <p className="mt-2 text-center text-[11px] text-gray-400 font-mono">SHA-256</p>
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

export function TeselaInfraestructura() {
  const { ref, clase } = useEscena()
  return (
    <div ref={ref} className={`${clase} w-full flex items-center justify-center gap-5`}>
      <svg width="54" height="62" viewBox="0 0 54 62" fill="none" aria-hidden="true" className="shrink-0">
        <path d="M27 3 L50 12 V30 C50 44 40 54 27 59 C14 54 4 44 4 30 V12 Z"
          stroke={MARCA} strokeWidth="2.4" strokeLinejoin="round" className={css.escudo} />
        <path d="M18 30.5 L24.5 37 L36 25" stroke={VERDE} strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round" className={css.visto} />
      </svg>
      <div className="flex flex-col gap-1.5">
        {NORMAS.map((n, i) => (
          <span key={n}
            className={`${css.selloNorma} rounded-md px-2 py-1 text-[11px] font-semibold tracking-wide text-center`}
            style={{ backgroundColor: '#EEF2F5', color: MARCA, animationDelay: `${1260 + i * 130}ms` }}>
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

export function TeselaTrazabilidad() {
  const { ref, clase } = useEscena()
  return (
    <div ref={ref} className={`${clase} w-full relative`}>
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
            <span className="text-[13px] font-medium text-gray-700 flex-1">{q}</span>
            <span className="text-[11px] text-gray-400 font-mono">{cuando}</span>
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
const COMPASES_BLOQUEO = [880, 1780, 2220] as const

export function TeselaBloqueo() {
  const { ref, clase, armado, ciclando } = useEscena()
  const paso = usePasos(armado, COMPASES_BLOQUEO)
  // Sin ciclo, el estado final: un botón trabado para siempre no es la
  // promesa de la tesela, es su contrario.
  const completo = !ciclando || paso >= 2
  const puedeEnviar = !ciclando || paso >= 3

  return (
    <div ref={ref} className={`${clase} w-full`}>
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
            <span className="text-[13px] text-gray-600">{t as string}</span>
          </div>
        ))}
      </div>
      <div className={`${css.botonMuda} ${css.sacude} mt-3.5 rounded-lg py-2 text-center text-[13px] font-semibold`}
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

const COMPASES_FORMAS = [140, 1060, 1980] as const

export function TeselaDispositivos() {
  const { ref, armado, ciclando } = useEscena()
  const paso = usePasos(armado, COMPASES_FORMAS)
  // Sin turno se queda en el computador, que es el estado final de la vuelta.
  const f = FORMAS[ciclando && paso > 0 ? paso - 1 : FORMAS.length - 1]

  return (
    <div ref={ref} className="w-full flex flex-col items-center justify-center" style={{ minHeight: 116 }}>
      <div className={`${css.marco} border-2 flex flex-wrap content-start gap-1.5 p-2.5 overflow-hidden`}
        style={{ width: f.w, height: f.h, borderRadius: f.r, borderColor: '#C6D2DB' }}>
        {[0, 1, 2, 3, 4, 5].map(j => (
          <span key={j} className={`${css.barraFlex} block h-1.5 rounded-full shrink-0`}
            style={{ width: `${f.col}%`, backgroundColor: '#E6EDF2' }} />
        ))}
      </div>
      <span className="mt-3 text-[11px] text-gray-400">{f.rotulo}</span>
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

export function TeselaPaquete() {
  const { ref, clase, armado, ciclando } = useEscena()
  const pasos = usePasos(armado, COMPASES_PAQUETE)
  const llegados = ciclando ? pasos : SUELTOS.length

  return (
    <div ref={ref} className={`${clase} relative w-full flex flex-col items-center justify-center`} style={{ height: 126 }}>
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
            left: 26, top: 36, width: 70, height: 18, zIndex: 10,
            backgroundColor: MARCA, color: '#fff',
          }}>
          <span className="text-[10px] font-bold tracking-wide">SECOP II</span>
        </span>
      </div>

      <span className="mt-1 text-[11px] text-gray-400 tabular-nums">
        {llegados} de {SUELTOS.length} documentos
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTO 4 · El código que se arma
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aparición escalonada, una sola vez.
 *
 * Para bloques donde lo que vende es el TEXTO y no el movimiento: la sección
 * no puede quedarse muerta en una página donde todo lo demás respira, pero
 * tampoco puede competir con las escenas que sí están demostrando algo.
 */
export function AlEntrar({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fase, setFase] = useState<'quieto' | 'dormido' | 'armado'>('quieto')

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof IntersectionObserver === 'undefined') return
    setFase('dormido')
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      requestAnimationFrame(() => requestAnimationFrame(() => setFase('armado')))
    }, { threshold: 0, rootMargin: FRANJA_FOCO })
    obs.observe(nodo)
    const respaldo = setTimeout(() => setFase('armado'), 2500)
    return () => { obs.disconnect(); clearTimeout(respaldo) }
  }, [])

  const clase = fase === 'dormido' ? css.dormido : fase === 'armado' ? css.armado : ''
  return <div ref={ref} className={`${clase} ${className}`}>{children}</div>
}

/**
 * La cadena de custodia, dibujada.
 *
 * Cuatro eslabones que nombran lo que el título promete: de quien lo crea a
 * quien lo verifica. Existe porque «cadena de custodia» es un concepto, y un
 * concepto sin forma se lee como eslogan; con los cuatro pasos a la vista,
 * se lee como descripción.
 *
 * SE ARMA UNA VEZ. Comparte pantalla con el código QR, que es lo que hay que
 * mirar y lo que pide un gesto. Una cadena repitiéndose al lado le robaría el
 * ojo justo cuando se está pidiendo que saquen el teléfono.
 */
const CUSTODIA = [
  ['Creación', 'quién lo hizo'],
  ['Aprobación', 'quién lo firmó'],
  ['Sello', 'huella y código'],
  ['Verificación', 'sin caducidad'],
] as const

export function CadenaCustodia() {
  const ref = useRef<HTMLDivElement>(null)
  const [fase, setFase] = useState<'quieto' | 'dormido' | 'armado'>('quieto')

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof IntersectionObserver === 'undefined') return
    setFase('dormido')
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      requestAnimationFrame(() => requestAnimationFrame(() => setFase('armado')))
    }, { threshold: 0, rootMargin: FRANJA_FOCO })
    obs.observe(nodo)
    const respaldo = setTimeout(() => setFase('armado'), 2500)
    return () => { obs.disconnect(); clearTimeout(respaldo) }
  }, [])

  const clase = fase === 'dormido' ? css.dormido : fase === 'armado' ? css.armado : ''

  return (
    <div ref={ref} className={`${clase} relative`}>
      {/* El hilo va por detrás y crece de izquierda a derecha: es la cadena. */}
      <span className={`${css.hiloCustodia} absolute block`}
        style={{ left: 4, right: 4, top: 4, height: 2, backgroundColor: 'rgba(25,32,49,.14)' }} />
      <div className="relative grid grid-cols-4 gap-2">
        {CUSTODIA.map(([paso, pie], i) => {
          const ultimo = i === CUSTODIA.length - 1
          return (
            <div key={paso} className={`${css.eslabonCustodia} flex flex-col`}
              style={{ transitionDelay: `${260 + i * 130}ms` }}>
              <span className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: ultimo ? VERDE : 'rgba(25,32,49,.38)' }} />
              <span className="mt-3 text-[11px] font-semibold leading-tight"
                style={{ color: ultimo ? VERDE_OSCURO : MARCA }}>
                {paso}
              </span>
              <span className="mt-1 text-[11px] leading-tight text-gray-500">
                {pie}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * El código QR. REAL Y ESCANEABLE, no un dibujo.
 *
 * La retícula la calcula el servidor con la misma librería que imprime los QR
 * dentro de los PDF, y llega aquí ya resuelta. Dos consecuencias que mandan
 * sobre el diseño de este componente:
 *
 * SIN SEPARACIÓN ENTRE MÓDULOS. El `gap` que llevaba la versión decorativa
 * rompe el patrón y ningún lector lo descifra. Los módulos se tocan, y el
 * margen blanco de alrededor —la zona de silencio— son cuatro módulos, que es
 * el mínimo de la norma.
 *
 * SE ARMA UNA VEZ Y SE QUEDA. Las teselas de la rejilla viven en bucle porque
 * su trabajo es contar algo; el de este código es que le apunten un teléfono.
 * Uno que se desarmara cada pocos segundos sería imposible de leer, así que
 * aquí el bucle no es un extra: es un defecto.
 */
const LADO_MODULO = 6
const SILENCIO = LADO_MODULO * 4

export function CodigoQR({ modulos, lado }: { modulos: boolean[]; lado: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fase, setFase] = useState<'quieto' | 'dormido' | 'armado'>('quieto')

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof IntersectionObserver === 'undefined') return
    setFase('dormido')
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      requestAnimationFrame(() => requestAnimationFrame(() => setFase('armado')))
    }, { threshold: 0, rootMargin: FRANJA_FOCO })
    obs.observe(nodo)
    // Si el observador no dispara, el código aparece igual: es lo que hay que
    // escanear, y quedarse invisible sería peor que no animarlo nunca.
    const respaldo = setTimeout(() => setFase('armado'), 2500)
    return () => { obs.disconnect(); clearTimeout(respaldo) }
  }, [])

  const clase = fase === 'dormido' ? css.dormido : fase === 'armado' ? css.armado : ''

  return (
    <div ref={ref} className={`${clase} inline-block rounded-2xl bg-white`} style={{ padding: SILENCIO }}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${lado}, ${LADO_MODULO}px)`, lineHeight: 0 }}
        aria-label="Código QR a la página de documentos emitidos">
        {modulos.map((oscuro, i) => (
          <span key={i} className={css.modulo}
            style={{
              width: LADO_MODULO, height: LADO_MODULO,
              backgroundColor: oscuro ? '#000000' : 'transparent',
              transitionDelay: `${((i % lado) + Math.floor(i / lado)) * 11}ms`,
            }} />
        ))}
      </div>
    </div>
  )
}
