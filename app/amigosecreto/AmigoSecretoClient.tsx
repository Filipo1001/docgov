'use client'

/**
 * Sorteo de amigo secreto — la parte que corre en el navegador.
 *
 * ── Por qué no hay servidor ni base de datos ─────────────────────────────
 *
 * Las parejas NO SE GUARDAN EN NINGÚN SITIO. El enlace que se reparte lleva
 * los nombres, el tope, la fecha y una semilla; cada teléfono vuelve a
 * calcular la cadena a partir de esa semilla y le sale idéntica a la de los
 * demás, porque el barajado es determinista.
 *
 * Eso no es una limitación, es la propiedad interesante: no hay una tabla de
 * parejas que alguien pueda consultar, ni siquiera nosotros. Y como no hay
 * cuenta de por medio, cualquiera abre el enlace desde WhatsApp.
 *
 * ── Cómo se reparte ──────────────────────────────────────────────────────
 *
 * UN SOLO ENLACE para todo el grupo. Cada quien entra, elige su nombre de la
 * lista, confirma «soy yo» y revela el suyo. Es el mismo camino que usan las
 * páginas de sorteos conocidas, y evita al organizador tener que mandar 35
 * mensajes distintos.
 *
 * A cambio no se puede bloquear un nombre ya abierto entre dispositivos —eso
 * exigiría servidor—, así que se hace lo que sí se puede: cuando alguien
 * confirma quién es, ESE aparato queda marcado y ya no vuelve a ofrecer la
 * lista. Cubre el caso realista, que es la curiosidad desde el propio
 * celular.
 */

import { useEffect, useState } from 'react'
import { LogoCD } from '@/components/Logo'

/** Diciembre en Antioquia: alumbrados sobre cielo de noche. */
const NOCHE = '#101A2E'
const NOCHE_2 = '#1A2743'
const LUZ = '#F5C24B'
const BRASA = '#D9553F'
const MONTE = '#4E8D6E'

const PERSONAS_INICIALES = [
  'Sara Sánchez', 'Mateo Montoya', 'Diego Alejandro García Echeverri',
  'María Alejandra Londoño López', 'Valeria Moncada Acevedo', 'Lorena Carvajal',
  'Felipe Bedoya Mesa', 'Andrea Londoño', 'Karen Puerta', 'Felipe Restrepo',
  'Germán David (Terminal)', 'Lucelly', 'Mariana Tobón', 'Luz Eugenia (Personería)',
  'Blanca Muñoz', 'María Fernanda (Bienestar Social)', 'Adriana Benítez', 'Marta Gómez',
  'Juan David Mesa', 'Fredy (Cárcel)', 'Doña Cristina', 'Juliana Palacio',
  'Margarita Calle', 'Nuveida Restrepo', 'Sebastián Gómez', 'Biviana Mondragón',
  'Wilson Darío Velásquez Diez', 'Adriana Otálvaro', 'Gladis Sánchez', 'Manuela Valencia',
  'Sandra Velásquez', 'Gabriel Echeverri', 'Valentina Restrepo', 'María Elena Toro',
  'Óscar (Terminal)',
].join('\n')

type Config = { p: string[]; s: string; t: string; c: string }

// ── Enlace ─────────────────────────────────────────────────────────────────

function empacar(obj: Config): string {
  const b = new TextEncoder().encode(JSON.stringify(obj))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function desempacar(txt: string): Config | null {
  try {
    const b64 = txt.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4))
    const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))))
    return Array.isArray(obj?.p) && obj.p.length > 2 ? obj : null
  } catch { return null }
}

// ── El sorteo ──────────────────────────────────────────────────────────────

/** Generador con semilla: da el mismo número en todos los dispositivos. */
function motorAzar(semilla: string): () => number {
  let h = 1779033703 ^ semilla.length
  for (let i = 0; i < semilla.length; i++) {
    h = Math.imul(h ^ semilla.charCodeAt(i), 3432918353)
    h = h << 13 | h >>> 19
  }
  let a = h >>> 0
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/**
 * Una sola cadena cerrada: se baraja y cada quien le regala al siguiente.
 * De un golpe garantiza que nadie se saque a sí mismo y que no haya dos
 * personas regalándose entre ellas, que es lo que le quita la gracia.
 */
function cadena(nombres: string[], semilla: string): Record<string, string> {
  const azar = motorAzar(semilla)
  const orden = nombres.slice()
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
  }
  const mapa: Record<string, string> = {}
  orden.forEach((quien, i) => { mapa[quien] = orden[(i + 1) % orden.length] })
  return mapa
}

// ── Piezas de interfaz ─────────────────────────────────────────────────────

function Cintillo({ centro = false }: { centro?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 mb-3.5 ${centro ? 'justify-center' : ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: LUZ }}>
        Alcaldía de Fredonia · Diciembre
      </span>
      {!centro && <span className="flex-1 h-px" style={{ backgroundColor: '#2C3A5C' }} />}
    </div>
  )
}

/**
 * Patrocinio. Discreto a propósito: quien abre esto viene a ver su amigo
 * secreto, no un anuncio. La marca se gana el sitio por estar el regalo
 * hecho, no por gritar.
 */
function Patrocinio({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2.5 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8892A8]">
        Apoya
      </span>
      <LogoCD size={20} color={LUZ} />
      <span className="text-[13px] font-semibold text-[#B9C0D2]">Contratista Digital</span>
    </div>
  )
}

function Paso({ num, titulo, nota, children }: {
  num: string; titulo: string; nota: string; children: React.ReactNode
}) {
  return (
    <section className="mb-7">
      <div className="flex items-baseline gap-3 mb-3">
        <span
          className="font-mono text-xs px-2.5 py-1.5 rounded-full flex-none border"
          style={{ color: LUZ, borderColor: '#2C3A5C' }}
        >
          {num}
        </span>
        <div>
          <h2 className="text-lg font-semibold text-[#F2ECE0]">{titulo}</h2>
          <p className="text-[13px] mt-1 text-[#8892A8]">{nota}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

const claseCampo =
  'w-full px-3.5 py-2.5 rounded-xl text-[15px] text-[#F2ECE0] outline-none ' +
  'border focus:ring-2 placeholder-[#6B7690]'
const estiloCampo = { backgroundColor: NOCHE, borderColor: '#2C3A5C' } as const

/**
 * Dibuja la tarjeta que la persona se guarda en la galería.
 *
 * Es la única copia que sobrevive a perder el enlace de WhatsApp —el amigo
 * secreto no está guardado en ningún servidor, se recalcula— así que vale
 * como respaldo de verdad, no como adorno. Y es donde el patrocinio tiene
 * sentido: una tarjeta que la gente conserva.
 */
async function dibujarTarjeta(yo: string, amigo: string, tope: string, cuando: string): Promise<string> {
  const A = 1080, L = 1350
  const c = document.createElement('canvas')
  c.width = A; c.height = L
  const g = c.getContext('2d')
  if (!g) return ''

  const tipo = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

  g.fillStyle = NOCHE
  g.fillRect(0, 0, A, L)

  // Alumbrados: puntos de luz tenues, más densos arriba. Puestos con una
  // secuencia fija y no al azar, para que la tarjeta salga igual siempre.
  for (let i = 0; i < 60; i++) {
    const x = (i * 137.5) % A
    const y = ((i * 71.3) % (L * 0.55))
    const r = 1 + (i % 3)
    g.globalAlpha = 0.05 + (i % 5) * 0.03
    g.fillStyle = LUZ
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }
  g.globalAlpha = 1

  g.textAlign = 'center'

  g.fillStyle = LUZ
  g.font = `600 26px ${tipo}`
  g.fillText('AMIGO SECRETO · ALCALDÍA DE FREDONIA', A / 2, 150)

  g.fillStyle = '#8892A8'
  g.font = `400 34px ${tipo}`
  g.fillText(`A ${yo} le tocó`, A / 2, 400)

  // El nombre se encoge si es largo, para no salirse de la tarjeta.
  let cuerpo = 96
  g.font = `700 ${cuerpo}px ${tipo}`
  while (g.measureText(amigo).width > A - 140 && cuerpo > 44) {
    cuerpo -= 4
    g.font = `700 ${cuerpo}px ${tipo}`
  }
  g.fillStyle = '#F2ECE0'
  g.fillText(amigo, A / 2, 520)

  g.strokeStyle = '#2C3A5C'
  g.lineWidth = 2
  g.beginPath(); g.moveTo(180, 640); g.lineTo(A - 180, 640); g.stroke()

  const campos = [['TOPE DE REGALO', tope], ['INTERCAMBIO', cuando]].filter(([, v]) => v)
  campos.forEach(([et, v], i) => {
    const y = 730 + i * 130
    g.fillStyle = '#8892A8'
    g.font = `600 22px ${tipo}`
    g.fillText(et as string, A / 2, y)
    g.fillStyle = '#F2ECE0'
    g.font = `600 42px ${tipo}`
    g.fillText(v as string, A / 2, y + 54)
  })

  g.fillStyle = '#8892A8'
  g.font = `400 26px ${tipo}`
  g.fillText('No se lo cuentes a nadie', A / 2, 1120)

  // Patrocinio al pie.
  try {
    const logo = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image()
      im.onload = () => res(im); im.onerror = rej
      im.src = '/marca/logo@2x.png'
    })
    const alto = 54
    const ancho = (logo.width / logo.height) * alto
    g.drawImage(logo, (A - ancho) / 2, 1200, ancho, alto)
  } catch {
    // Sin logo la tarjeta sigue sirviendo; es un adorno, no el contenido.
  }
  g.fillStyle = '#6B7690'
  g.font = `600 22px ${tipo}`
  g.fillText('APOYA CONTRATISTA DIGITAL', A / 2, 1300)

  return c.toDataURL('image/png')
}

// ── Pantalla ───────────────────────────────────────────────────────────────

export default function AmigoSecretoClient() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [listo, setListo] = useState(false)

  // Organizador
  const [personas, setPersonas] = useState(PERSONAS_INICIALES)
  const [tope, setTope] = useState('$50.000')
  const [cuando, setCuando] = useState('Viernes 19 de diciembre')
  const [vetos, setVetos] = useState('')
  const [enlace, setEnlace] = useState('')
  const [fallo, setFallo] = useState('')
  const [copiado, setCopiado] = useState(false)

  // Participante
  const [yo, setYo] = useState<string | null>(null)
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // El fragmento decide el modo. Va en un efecto porque en el servidor no
  // existe `location`, y leerlo durante el render rompería la hidratación.
  useEffect(() => {
    const marca = window.location.hash.slice(1)
    if (!marca) { setListo(true); return }
    const leido = desempacar(decodeURIComponent(marca))
    setCfg(leido)
    if (leido) {
      try {
        const guardado = localStorage.getItem('amigo-secreto-' + leido.s)
        if (guardado && leido.p.includes(guardado)) setYo(guardado)
      } catch { /* navegador sin almacenamiento: se elige otra vez */ }
    }
    setListo(true)
  }, [])

  if (!listo) return null

  // ── Modo participante ────────────────────────────────────────────────
  if (cfg) {
    const mapa = cadena(cfg.p, cfg.s)

    if (yo) {
      return (
        <div className="max-w-[640px] mx-auto px-5 pt-8 pb-16 text-center">
          <Cintillo centro />
          <p className="text-[17px] text-[#B9C0D2] mb-1.5">Hola, {yo}</p>
          <h1 className="text-[clamp(26px,6vw,36px)] font-bold tracking-tight text-[#F2ECE0]">
            Tu amigo secreto
          </h1>

          <button
            type="button"
            onClick={() => setAbierto(true)}
            disabled={abierto}
            className="mt-6 mx-auto block w-full max-w-[430px] rounded-[20px] border px-6 py-10 text-center transition-colors"
            style={{ backgroundColor: NOCHE_2, borderColor: '#2C3A5C', cursor: abierto ? 'default' : 'pointer' }}
          >
            {abierto ? (
              <>
                <span className="text-[15px] font-bold uppercase tracking-[0.14em]" style={{ color: LUZ }}>
                  Te tocó
                </span>
                <p className="mt-1.5 text-[clamp(30px,8vw,46px)] font-bold leading-tight tracking-tight text-[#F2ECE0]">
                  {mapa[yo]}
                </p>
              </>
            ) : (
              <>
                <span className="text-[15px] font-bold uppercase tracking-[0.14em]" style={{ color: LUZ }}>
                  Toca para abrir
                </span>
                <p className="mt-3.5 text-sm text-[#8892A8]">
                  Mira alrededor primero. Lo que salga aquí es solo tuyo.
                </p>
              </>
            )}
          </button>

          <div className="flex justify-center gap-7 flex-wrap mt-8">
            {[['Tope de regalo', cfg.t], ['Intercambio', cfg.c]]
              .filter(([, v]) => v)
              .map(([et, v]) => (
                <div key={et}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8892A8]">{et}</p>
                  <p className="mt-1 text-[17px] font-semibold text-[#F2ECE0]">{v}</p>
                </div>
              ))}
          </div>

          {abierto && (
            <button
              type="button"
              disabled={guardando}
              onClick={async () => {
                setGuardando(true)
                try {
                  const datos = await dibujarTarjeta(yo, mapa[yo], cfg.t, cfg.c)
                  if (datos) {
                    const a = document.createElement('a')
                    a.href = datos
                    a.download = `amigo-secreto-${yo.split(' ')[0].toLowerCase()}.png`
                    document.body.appendChild(a); a.click(); a.remove()
                  }
                } finally { setGuardando(false) }
              }}
              className="mt-7 min-h-[48px] px-5 rounded-xl text-sm font-semibold border text-[#F2ECE0] disabled:opacity-50"
              style={{ backgroundColor: NOCHE_2, borderColor: '#2C3A5C' }}
            >
              {guardando ? 'Preparando…' : 'Guardar imagen'}
            </button>
          )}

          <p className="mt-8 text-[12.5px] text-[#8892A8]">
            {abierto
              ? 'Si pierdes el enlace, la imagen es tu respaldo. No se la muestres a nadie.'
              : 'Guarda este enlace si quieres volver a mirarlo. No se lo reenvíes a nadie.'}
          </p>

          <Patrocinio className="mt-9" />
        </div>
      )
    }

    if (porConfirmar) {
      return (
        <div className="max-w-[640px] mx-auto px-5 pt-8 pb-16 text-center">
          <Cintillo centro />
          <h1 className="text-[clamp(28px,6.5vw,40px)] font-bold tracking-tight text-[#F2ECE0]">
            {porConfirmar}
          </h1>
          <p className="text-[#B9C0D2] max-w-[52ch] mx-auto mt-3 mb-7">
            Si abres el amigo secreto de otra persona, le arruinas la sorpresa y ya no hay
            vuelta atrás.
          </p>
          <div className="flex gap-2.5 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => {
                try { localStorage.setItem('amigo-secreto-' + cfg.s, porConfirmar) } catch { /* sin almacenamiento */ }
                setYo(porConfirmar)
                setPorConfirmar(null)
              }}
              className="min-h-[52px] min-w-[210px] px-6 rounded-xl font-semibold text-white"
              style={{ backgroundColor: BRASA }}
            >
              Sí, soy {porConfirmar.split(' ')[0]}
            </button>
            <button
              type="button"
              onClick={() => setPorConfirmar(null)}
              className="min-h-[52px] px-4 rounded-xl text-sm border text-[#F2ECE0]"
              style={{ backgroundColor: NOCHE_2, borderColor: '#2C3A5C' }}
            >
              No, ese no soy yo
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="max-w-[640px] mx-auto px-5 pt-8 pb-16">
        <Cintillo />
        <h1 className="text-[clamp(28px,6.5vw,40px)] font-bold tracking-tight text-[#F2ECE0] mb-2.5">
          ¿Quién eres tú?
        </h1>
        <p className="text-[#B9C0D2] mb-6">Busca tu nombre en la lista. Solo verás el tuyo.</p>
        <div className="flex flex-col rounded-2xl overflow-hidden border" style={{ borderColor: '#2C3A5C' }}>
          {cfg.p.map(nombre => (
            <button
              key={nombre}
              type="button"
              onClick={() => setPorConfirmar(nombre)}
              className="text-left text-base font-medium text-[#F2ECE0] px-4 py-4 min-h-[52px] border-b last:border-b-0 transition-colors hover:brightness-125"
              style={{ backgroundColor: NOCHE_2, borderColor: '#2C3A5C' }}
            >
              {nombre}
            </button>
          ))}
        </div>
        <Patrocinio className="mt-9" />
      </div>
    )
  }

  // ── Modo organizador ─────────────────────────────────────────────────
  const lista = personas.split('\n').map(s => s.trim()).filter(Boolean)
  const repetidos = new Set(lista.map(s => s.toLowerCase())).size !== lista.length

  const crear = () => {
    setFallo('')
    if (lista.length < 3) { setFallo('Hacen falta al menos 3 personas.'); return }
    if (repetidos) { setFallo('Hay nombres repetidos. Cada persona debe aparecer una sola vez.'); return }

    const pares = vetos.split(',').map(p => p.trim()).filter(Boolean)
      .map(par => par.split('+').map(s => s.trim())).filter(p => p.length === 2)
      .map(([a, b]) => [
        lista.find(n => n.toLowerCase().includes(a.toLowerCase())) ?? a,
        lista.find(n => n.toLowerCase().includes(b.toLowerCase())) ?? b,
      ])

    let semilla: string | null = null
    for (let i = 0; i < 3000 && !semilla; i++) {
      const s = Math.random().toString(36).slice(2, 10)
      const mapa = cadena(lista, s)
      if (!pares.some(([x, y]) => mapa[x] === y || mapa[y] === x)) semilla = s
    }
    if (!semilla) {
      setFallo('Con esas parejas vetadas no hay sorteo posible. Quita alguna e intenta de nuevo.')
      return
    }

    const base = window.location.href.split('#')[0]
    setEnlace(base + '#' + empacar({ p: lista, s: semilla, t: tope.trim(), c: cuando.trim() }))
  }

  return (
    <div className="max-w-[760px] mx-auto px-5 pt-8 pb-16">
      <Cintillo />
      <h1 className="text-[clamp(32px,7vw,50px)] font-bold leading-[1.05] tracking-tight text-[#F2ECE0] mb-2.5">
        Amigo secreto
      </h1>
      <p className="text-[#B9C0D2] max-w-[56ch] mb-8">
        Un solo enlace para todo el grupo. Cada quien entra, dice quién es y ve únicamente su
        amigo secreto. Ni tú ves la lista de parejas.
      </p>

      <Paso num="01" titulo="Quiénes juegan" nota="Un nombre por línea. Así aparecerán en la lista que verá cada persona.">
        <div className="rounded-2xl border p-4" style={{ backgroundColor: NOCHE_2, borderColor: '#2C3A5C' }}>
          <textarea
            value={personas}
            onChange={e => setPersonas(e.target.value)}
            spellCheck={false}
            rows={10}
            className={`${claseCampo} resize-y min-h-[200px] leading-relaxed`}
            style={estiloCampo}
          />
          <div className="flex items-center gap-2 mt-2.5 text-[13px] text-[#B9C0D2]">
            <span
              className="w-[7px] h-[7px] rounded-full flex-none"
              style={{ backgroundColor: (repetidos || lista.length < 3) ? BRASA : MONTE }}
            />
            {repetidos
              ? `${lista.length} líneas, pero hay nombres repetidos`
              : lista.length < 3
                ? `${lista.length} personas — hacen falta al menos 3`
                : `${lista.length} personas listas para el sorteo`}
          </div>
        </div>
      </Paso>

      <Paso num="02" titulo="Las reglas" nota="Se le muestran a cada persona junto con su amigo secreto.">
        <div className="rounded-2xl border p-4" style={{ backgroundColor: NOCHE_2, borderColor: '#2C3A5C' }}>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <label htmlFor="tope" className="block text-xs font-semibold uppercase tracking-wider text-[#8892A8] mb-2">
                Tope de regalo
              </label>
              <input id="tope" value={tope} onChange={e => setTope(e.target.value)}
                className={claseCampo} style={estiloCampo} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="cuando" className="block text-xs font-semibold uppercase tracking-wider text-[#8892A8] mb-2">
                Día del intercambio
              </label>
              <input id="cuando" value={cuando} onChange={e => setCuando(e.target.value)}
                className={claseCampo} style={estiloCampo} autoComplete="off" />
            </div>
          </div>
          <div className="mt-3.5">
            <label htmlFor="veto" className="block text-xs font-semibold uppercase tracking-wider text-[#8892A8] mb-2">
              Parejas que no deben tocarse
            </label>
            <input id="veto" value={vetos} onChange={e => setVetos(e.target.value)}
              placeholder="Sara + Mateo, Lucelly + Blanca"
              className={claseCampo} style={estiloCampo} autoComplete="off" />
            <p className="text-[13px] mt-2 text-[#8892A8]">
              Separa cada pareja con coma. Acepta nombres parciales.
            </p>
          </div>
        </div>
      </Paso>

      <Paso num="03" titulo="Crear el sorteo" nota="Nadie se saca a sí mismo y nadie se regala mutuamente: sale una sola cadena.">
        <button
          type="button"
          onClick={crear}
          className="w-full min-h-[52px] rounded-xl font-semibold text-white transition-[filter] hover:brightness-110"
          style={{ backgroundColor: BRASA }}
        >
          {enlace ? 'Volver a sortear' : 'Crear el sorteo'}
        </button>
        {fallo && <p className="text-[13px] mt-2.5" style={{ color: BRASA }}>{fallo}</p>}
      </Paso>

      {enlace && (
        <Paso num="04" titulo="Compartir con el grupo" nota={`Este mismo enlace sirve para las ${lista.length} personas. Mándalo una sola vez al grupo.`}>
          <div className="rounded-2xl border p-4" style={{ backgroundColor: NOCHE_2, borderColor: '#2C3A5C' }}>
            <div
              className="font-mono text-[12.5px] leading-relaxed text-[#B9C0D2] break-all rounded-lg border px-3 py-2.5 mb-3.5 max-h-[110px] overflow-auto"
              style={{ backgroundColor: NOCHE, borderColor: '#2C3A5C' }}
            >
              {enlace}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(enlace)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 1600)
                }}
                className="min-h-[48px] rounded-xl text-sm font-semibold border text-[#F2ECE0]"
                style={{ backgroundColor: NOCHE, borderColor: '#2C3A5C' }}
              >
                {copiado ? 'Copiado' : 'Copiar enlace'}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  '¡Amigo secreto de la Alcaldía! Entra, busca tu nombre y mira quién te tocó. '
                  + 'Es solo para ti, no lo comentes: ' + enlace,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] rounded-xl text-sm font-semibold text-white flex items-center justify-center"
                style={{ backgroundColor: MONTE }}
              >
                Enviar por WhatsApp
              </a>
            </div>
          </div>
          <div
            className="mt-4 rounded-xl border border-l-[3px] px-4 py-3.5 text-sm text-[#B9C0D2]"
            style={{ backgroundColor: '#22304F', borderColor: '#2C3A5C', borderLeftColor: LUZ }}
          >
            <strong className="text-[#F2ECE0]">No abras el enlace tú mismo</strong> si vas a jugar.
            Al entrar tendrías que elegir un nombre, y ahí verías a quién le tocó esa persona.
          </div>
        </Paso>
      )}

      <Patrocinio className="mt-10" />
    </div>
  )
}
