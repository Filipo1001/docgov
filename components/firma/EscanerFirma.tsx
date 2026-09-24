'use client'

/**
 * Escáner de firma en vivo.
 *
 * ── LO QUE SE COPIA, Y DE DÓNDE ──────────────────────────────────────────
 *
 * La pantalla no inventa nada: repite el escáner de documentos de las Notas
 * del iPhone, que es el que más gente ha usado sin que nadie se lo explique.
 * De ahí salen las cuatro piezas:
 *
 *   · Un rótulo corto y en presente arriba de todo («Coloca tu firma en el
 *     recuadro»), que cambia según lo que la cámara ve.
 *   · El recuadro se TIÑE cuando reconoce lo que busca. Ese cambio de color
 *     es el aviso de que va a disparar; no hace falta explicarlo.
 *   · Un destello blanco al capturar. Todas las cámaras del mundo lo hacen.
 *   · Botón de disparo SIEMPRE visible, y un interruptor «Automático» al
 *     lado, exactamente como el Auto/Manual de las Notas.
 *
 * ── LO QUE SE QUITÓ, Y POR QUÉ ───────────────────────────────────────────
 *
 * Había un anillo de progreso que se llenaba mientras la imagen estaba
 * estable. Era una invención: ningún escáner usa eso, y la primera pregunta
 * de quien lo probó fue «¿ese círculo para qué es?». Cuando hay que explicar
 * un indicador, el indicador sobra. El recuadro que cambia de color dice lo
 * mismo sin preguntas.
 *
 * El disparo manual estaba escondido nueve segundos «para no ensuciar la
 * pantalla». Nadie esconde el obturador de una cámara. Ahora está desde el
 * primer instante: quien no se fía del automático, dispara y punto.
 *
 * ── DETALLES QUE SOLO SE VEN EN UN TELÉFONO ──────────────────────────────
 *
 * Toda la capa lleva la selección de texto desactivada. Con un dedo apoyado
 * sobre la pantalla —que es como se sostiene un teléfono mientras se apunta
 * con el otro— el navegador entendía «pulsación larga» y seleccionaba los
 * rótulos de abajo, con su lupa azul encima de la cámara.
 *
 * La linterna solo aparece si la cámara de ese teléfono la expone. En iOS no
 * se puede encender desde el navegador, así que allí sencillamente no está en
 * vez de estar y no hacer nada.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ANCHO_ANALISIS, CUADROS_RAFAGA, PROPORCION_MARCO,
  aGris, analizar, consolidar,
  type Consejo,
} from '@/lib/firma-escaner'

/** Cuadros seguidos en «listo» antes de disparar en automático. A ~12 por
 *  segundo son unos 0,4 s: bastante para descartar un acierto de casualidad,
 *  poco para que parezca que no reacciona. */
const CUADROS_PARA_DISPARAR = 5

/** Lado mayor del recorte que se procesa. Más resolución no mejora un trazo
 *  y multiplica el trabajo de la mediana en un teléfono modesto. */
const ANCHO_PROCESO = 1280

/** El rótulo de arriba. Uno solo, en presente, sin signos de admiración. */
const MENSAJE: Record<Consejo, string> = {
  buscando:  'Coloca tu firma en el recuadro',
  falta_luz: 'Hace falta más luz',
  acercate:  'Acerca un poco más el teléfono',
  despeja:   'Algo está tapando el recuadro',
  quieto:    'Sostén el teléfono quieto',
  listo:     'Escaneando…',
}

type Etapa = 'iniciando' | 'escaneando' | 'procesando' | 'revisando' | 'error'

export default function EscanerFirma({
  abierto,
  nombre,
  cedula,
  onCancelar,
  onSubirArchivo,
  onConfirmar,
}: {
  abierto: boolean
  nombre: string
  cedula?: string | null
  onCancelar: () => void
  /** Salida de emergencia: la cámara no sirve o la persona prefiere un archivo. */
  onSubirArchivo: () => void
  onConfirmar: (blob: Blob) => Promise<void> | void
}) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const marcoRef  = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const previoRef = useRef<Uint8ClampedArray | null>(null)
  const buenosRef = useRef(0)
  const rafRef    = useRef<number | null>(null)
  const ultimoAnalisisRef = useRef(0)
  /** Evita que la ráfaga se dispare dos veces si el bucle va rápido. */
  const capturandoRef = useRef(false)
  /** El bucle lee el modo automático sin volver a montarse por cada cambio. */
  const autoRef = useRef(true)
  /** Capturas seguidas que no encontraron ni un trazo. */
  const fallosRef = useRef(0)
  const destelloRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const avisoRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [etapa, setEtapa]     = useState<Etapa>('iniciando')
  const [consejo, setConsejo] = useState<Consejo>('buscando')
  const [auto, setAuto]       = useState(true)
  const [destello, setDestello] = useState(false)
  const [linterna, setLinterna] = useState(false)
  const [hayLinterna, setHayLinterna] = useState(false)
  const [aviso, setAviso]     = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [firma, setFirma]     = useState<{ blob: Blob; url: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { autoRef.current = auto }, [auto])

  // ── Geometría ───────────────────────────────────────────────────────────
  //
  // El vídeo se pinta con `object-cover`, así que lo que se ve en pantalla es
  // un recorte del cuadro real. Para analizar EXACTAMENTE lo que hay dentro
  // del recuadro guía hay que deshacer ese recorte.
  const recorteEnVideo = useCallback(() => {
    const video = videoRef.current
    const marco = marcoRef.current
    if (!video || !marco || !video.videoWidth) return null

    const caja = video.getBoundingClientRect()
    const guia = marco.getBoundingClientRect()
    const escala = Math.max(caja.width / video.videoWidth, caja.height / video.videoHeight)
    const ox = (caja.width  - video.videoWidth  * escala) / 2
    const oy = (caja.height - video.videoHeight * escala) / 2

    const x = (guia.left - caja.left - ox) / escala
    const y = (guia.top  - caja.top  - oy) / escala
    const w = guia.width  / escala
    const h = guia.height / escala

    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      w: Math.max(1, Math.min(Math.round(w), video.videoWidth)),
      h: Math.max(1, Math.min(Math.round(h), video.videoHeight)),
    }
  }, [])

  /** Un recorte del recuadro guía, al ancho pedido. */
  const tomarRecorte = useCallback((anchoDestino: number): ImageData | null => {
    const video = videoRef.current
    const r = recorteEnVideo()
    if (!video || !r) return null
    const w = Math.min(anchoDestino, r.w)
    const h = Math.max(1, Math.round((w * r.h) / r.w))
    const lienzo = document.createElement('canvas')
    lienzo.width = w
    lienzo.height = h
    const ctx = lienzo.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  }, [recorteEnVideo])

  // ── Captura ─────────────────────────────────────────────────────────────

  const capturar = useCallback(async () => {
    if (capturandoRef.current) return
    capturandoRef.current = true

    // Destello primero: el disparo tiene que sentirse en el mismo instante en
    // que se pulsa, no cuando termine de procesar.
    setDestello(true)
    if (destelloRef.current) clearTimeout(destelloRef.current)
    destelloRef.current = setTimeout(() => setDestello(false), 220)
    setEtapa('procesando')

    const cuadros: ImageData[] = []
    for (let i = 0; i < CUADROS_RAFAGA; i++) {
      const c = tomarRecorte(ANCHO_PROCESO)
      if (c) cuadros.push(c)
      // Separados en el tiempo a propósito: cuadros idénticos no aportan nada
      // a la mediana, y lo que se quiere borrar son los brillos pasajeros.
      if (i < CUADROS_RAFAGA - 1) await new Promise(r => setTimeout(r, 90))
    }

    const lienzo = cuadros.length ? consolidar(cuadros) : null
    if (!lienzo) {
      // Disparó pero no había tinta: una sombra, un papel en blanco, un
      // encuadre que se movió. Sin avisar, en automático esto se repetía en
      // bucle y desde fuera parecía que la aplicación no hacía nada.
      capturandoRef.current = false
      buenosRef.current = 0
      fallosRef.current++
      const insiste = fallosRef.current >= 2
      if (insiste) setAuto(false)
      setAviso(
        insiste
          ? 'Seguimos sin encontrar el trazo. Encuádrala y toma la foto tú.'
          : 'No vimos ningún trazo. Acerca la firma o busca más luz.',
      )
      if (avisoRef.current) clearTimeout(avisoRef.current)
      avisoRef.current = setTimeout(() => setAviso(null), 3200)
      setConsejo('buscando')
      setEtapa('escaneando')
      return
    }
    fallosRef.current = 0

    const blob = await new Promise<Blob | null>(res => lienzo.toBlob(res, 'image/png'))
    if (!blob) {
      capturandoRef.current = false
      setEtapa('escaneando')
      return
    }
    setFirma({ blob, url: URL.createObjectURL(blob) })
    setEtapa('revisando')
  }, [tomarRecorte])

  // ── Bucle de análisis ───────────────────────────────────────────────────

  useEffect(() => {
    if (etapa !== 'escaneando') return

    const bucle = (t: number) => {
      rafRef.current = requestAnimationFrame(bucle)
      // ~12 lecturas por segundo. Analizar cada cuadro no mejora el rótulo y
      // sí calienta el teléfono.
      if (t - ultimoAnalisisRef.current < 80) return
      ultimoAnalisisRef.current = t

      const recorte = tomarRecorte(ANCHO_ANALISIS)
      if (!recorte) return
      const gris = aGris(recorte)
      const lectura = analizar(gris, recorte.width, recorte.height, previoRef.current)
      previoRef.current = gris
      setConsejo(lectura.consejo)

      if (lectura.consejo === 'listo') {
        buenosRef.current++
        if (autoRef.current && buenosRef.current >= CUADROS_PARA_DISPARAR) void capturar()
      } else {
        buenosRef.current = 0
      }
    }

    rafRef.current = requestAnimationFrame(bucle)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [etapa, tomarRecorte, capturar])

  // ── Cámara ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!abierto) return
    let cancelado = false

    // El componente no se desmonta al cerrarse —solo deja de pintarse—, así
    // que al reabrirlo conservaba la etapa y la firma de la vez anterior: el
    // primer fotograma enseñaba la firma vieja antes de arrancar la cámara.
    setEtapa('iniciando')
    setFirma(null)
    setConsejo('buscando')
    setAviso(null)
    setAuto(true)
    buenosRef.current = 0
    fallosRef.current = 0
    capturandoRef.current = false
    previoRef.current = null

    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error('sin soporte'), { name: 'NotSupportedError' })
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        // La linterna solo existe en algunos Android. Si no está, el botón no
        // se dibuja: un botón que no hace nada es peor que no tenerlo.
        const pista = stream.getVideoTracks()[0]
        const capacidades = pista?.getCapabilities?.() as { torch?: boolean } | undefined
        setHayLinterna(!!capacidades?.torch)

        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        setEtapa('escaneando')
      } catch (e: unknown) {
        if (cancelado) return
        const nombreError = (e as { name?: string })?.name ?? ''
        setError(
          nombreError === 'NotAllowedError'
            ? 'Tu teléfono no nos dejó usar la cámara. Búscala en los permisos del navegador para este sitio, o sube una imagen de tu firma.'
            : nombreError === 'NotFoundError'
              ? 'No encontramos una cámara en este dispositivo.'
              : 'No pudimos abrir la cámara desde aquí. Si entraste desde el correo, prueba a abrir la página en Safari o Chrome.',
        )
        setEtapa('error')
      }
    })()

    return () => {
      cancelado = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      previoRef.current = null
      buenosRef.current = 0
      capturandoRef.current = false
      setHayLinterna(false)
      setLinterna(false)
      if (destelloRef.current) clearTimeout(destelloRef.current)
      if (avisoRef.current) clearTimeout(avisoRef.current)
    }
  }, [abierto])

  // Red de seguridad: al volver a escanear, asegurarse de que el vídeo sigue
  // enganchado al stream. Con el elemento ya montado no debería perderlo,
  // pero iOS suelta la reproducción al volver de segundo plano y una cámara
  // congelada es indistinguible de una aplicación colgada.
  useEffect(() => {
    if (etapa !== 'escaneando') return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (video.srcObject !== stream) video.srcObject = stream
    if (video.paused) void video.play().catch(() => {})
  }, [etapa])

  async function alternarLinterna() {
    const pista = streamRef.current?.getVideoTracks()[0]
    if (!pista) return
    const encender = !linterna
    try {
      // `torch` no está en la definición estándar de TypeScript aunque los
      // navegadores que la soportan la aceptan aquí; de ahí el doble paso.
      await pista.applyConstraints(
        { advanced: [{ torch: encender }] } as unknown as MediaTrackConstraints,
      )
      setLinterna(encender)
    } catch {
      setHayLinterna(false)
    }
  }

  // La URL del objeto vive mientras se revisa; al descartarla hay que soltarla.
  useEffect(() => () => { if (firma) URL.revokeObjectURL(firma.url) }, [firma])

  if (!abierto) return null

  function repetir() {
    if (firma) URL.revokeObjectURL(firma.url)
    setFirma(null)
    previoRef.current = null
    buenosRef.current = 0
    fallosRef.current = 0
    capturandoRef.current = false
    // El rótulo también vuelve al principio. Si se quedaba en «listo», el
    // primer instante tras Repetir enseñaba «Escaneando…» y el recuadro en
    // verde sobre una cámara que aún no había leído nada.
    setConsejo('buscando')
    setAviso(null)
    setEtapa('escaneando')
  }

  async function guardar() {
    if (!firma || guardando) return
    setGuardando(true)
    try {
      await onConfirmar(firma.blob)
    } finally {
      setGuardando(false)
    }
  }

  const listo = consejo === 'listo' && etapa === 'escaneando'
  /** El vídeo sigue montado durante la revisión; su cromo, no. */
  const escaneandoVisible = etapa === 'escaneando' || etapa === 'procesando'

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col select-none"
      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {/* ── Cabecera ── */}
      <div className="relative z-20 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <button
          onClick={onCancelar}
          className="text-white/80 hover:text-white text-sm font-medium px-2 py-1"
        >
          Cancelar
        </button>
        <p className="text-white/90 text-sm font-semibold">
          {etapa === 'revisando' ? 'Tu firma' : 'Escanear firma'}
        </p>
        <div className="w-16 flex justify-end">
          {hayLinterna && etapa !== 'revisando' && etapa !== 'error' && (
            <button
              onClick={() => void alternarLinterna()}
              aria-pressed={linterna}
              aria-label={linterna ? 'Apagar la linterna' : 'Encender la linterna'}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                linterna ? 'bg-white text-gray-900' : 'bg-white/15 text-white'
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2h6l-1 5h3l-7 15 2-10H8z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Cámara ──
          Se monta mientras haya cámara y NO se desmonta al revisar: el vídeo
          es quien sostiene el stream, y quitarlo del árbol dejaba un elemento
          nuevo y vacío al volver con «Repetir». El análisis no recibía ni un
          cuadro, así que el rótulo se quedaba congelado en el último que vio
          —«Escaneando…»— para siempre. La revisión se pinta ENCIMA. */}
      {etapa !== 'error' && (
        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />

          {/* Rótulo arriba, como en el escáner de las Notas: una frase corta,
              en presente, que cambia con lo que la cámara ve. */}
          <div
            className="absolute inset-x-0 top-0 pt-4 px-6 flex justify-center pointer-events-none transition-opacity"
            style={{ opacity: escaneandoVisible ? 1 : 0 }}
          >
            <p className={`text-[15px] font-medium px-4 py-2 rounded-full transition-colors duration-200 text-center ${
              aviso ? 'bg-amber-500 text-white'
                    : listo ? 'bg-emerald-500 text-white'
                            : 'bg-black/55 text-white'
            }`}>
              {aviso ?? (etapa === 'procesando' ? 'Escaneando…' : MENSAJE[consejo])}
            </p>
          </div>

          {/* Recuadro guía. Al reconocer la firma se TIÑE — ese cambio de
              color es el aviso de que va a disparar, y no necesita leyenda. */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity"
            style={{ opacity: escaneandoVisible ? 1 : 0 }}
          >
            <div
              ref={marcoRef}
              style={{ width: '88%', aspectRatio: String(PROPORCION_MARCO) }}
              className={`relative rounded-2xl outline-[9999px] outline outline-black/55 transition-colors duration-200 ${
                listo || etapa === 'procesando' ? 'bg-emerald-400/20' : ''
              }`}
            >
              {(['-top-px -left-px border-t-4 border-l-4 rounded-tl-2xl',
                 '-top-px -right-px border-t-4 border-r-4 rounded-tr-2xl',
                 '-bottom-px -left-px border-b-4 border-l-4 rounded-bl-2xl',
                 '-bottom-px -right-px border-b-4 border-r-4 rounded-br-2xl'] as const).map((c, i) => (
                <span
                  key={i}
                  className={`absolute w-9 h-9 ${c} transition-colors duration-200 ${
                    listo || etapa === 'procesando' ? 'border-emerald-400' : 'border-white/90'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Destello de disparo. */}
          <div
            className="absolute inset-0 bg-white pointer-events-none transition-opacity duration-200"
            style={{ opacity: destello ? 1 : 0 }}
          />

          {/* Controles abajo: obturador siempre visible, y el automático al
              lado como interruptor, igual que el Auto/Manual de las Notas. */}
          <div
            className="absolute inset-x-0 bottom-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-black/70 to-transparent transition-opacity"
            style={{ opacity: escaneandoVisible ? 1 : 0, pointerEvents: escaneandoVisible ? 'auto' : 'none' }}
          >
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setAuto(a => !a)}
                aria-pressed={auto}
                className={`text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors ${
                  auto ? 'bg-white text-gray-900' : 'bg-white/15 text-white/80'
                }`}
              >
                Automático
              </button>

              <button
                onClick={() => void capturar()}
                disabled={etapa !== 'escaneando'}
                aria-label="Capturar la firma"
                className="w-[70px] h-[70px] rounded-full border-4 border-white/90 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
              >
                <span className="w-[56px] h-[56px] rounded-full bg-white" />
              </button>

              {/* Mismo ancho que el interruptor, para que el obturador quede
                  centrado de verdad y no ligeramente a la derecha. */}
              <span className="w-[86px]" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      {/* ── Revisión, sobre el documento de verdad ── */}
      {etapa === 'revisando' && firma && (
        <div className="absolute inset-0 z-10 bg-black overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)]">
          <p className="text-white/70 text-sm text-center mb-5">
            Así va a salir impresa en tu cuenta de cobro
          </p>

          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm mx-auto">
            <div className="h-20 flex items-end justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={firma.url} alt="Tu firma" className="max-h-20 max-w-full object-contain" />
            </div>
            <div className="border-t border-gray-800 mt-1 pt-2 text-center">
              <p className="text-[13px] font-semibold text-gray-900 uppercase leading-tight">{nombre}</p>
              {cedula && <p className="text-[11px] text-gray-500 mt-0.5">C.C. {cedula}</p>}
              <p className="text-[11px] text-gray-500">Contratista</p>
            </div>
          </div>

          <div className="max-w-sm mx-auto mt-7 flex flex-col gap-3">
            <button
              onClick={() => void guardar()}
              disabled={guardando}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl transition-colors"
            >
              {guardando ? 'Guardando…' : 'Usar esta firma'}
            </button>
            <button
              onClick={repetir}
              disabled={guardando}
              className="w-full text-white/80 hover:text-white font-medium py-3 disabled:opacity-50"
            >
              Repetir
            </button>
          </div>
        </div>
      )}

      {/* ── Sin cámara ── */}
      {etapa === 'error' && (
        <div className="flex-1 flex items-center justify-center px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="max-w-sm text-center">
            <p className="text-white text-lg font-semibold mb-2">No pudimos usar la cámara</p>
            <p className="text-white/70 text-sm leading-relaxed mb-7">{error}</p>
            <button
              onClick={onSubirArchivo}
              className="w-full bg-white text-gray-900 font-semibold py-3.5 rounded-2xl"
            >
              Subir una imagen de mi firma
            </button>
            <button onClick={onCancelar} className="w-full text-white/70 font-medium py-3 mt-2">
              Ahora no
            </button>
          </div>
        </div>
      )}

      {etapa === 'iniciando' && (
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          <p className="text-white/70 text-sm">Abriendo la cámara…</p>
        </div>
      )}
    </div>
  )
}
