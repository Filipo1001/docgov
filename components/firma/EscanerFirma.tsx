'use client'

/**
 * Escáner de firma en vivo.
 *
 * La persona firma en un papel, apunta el teléfono y ya. No hay botón de
 * disparo: el escáner mira, avisa de UNA cosa a la vez —«acércate», «falta
 * luz», «quieto»— y captura solo cuando la imagen está bien. Después enseña
 * el resultado sobre el documento donde va a salir impreso, y solo entonces
 * pregunta si se guarda.
 *
 * Por qué sin botón: el disparo obliga a decidir «¿ya está suficientemente
 * bien?» a quien no tiene forma de saberlo. Esa decisión es justo la que
 * fallaba antes, y es la que el software sí puede tomar.
 *
 * Aun así hay un disparo manual, escondido hasta que pasan unos segundos sin
 * captura automática. Nunca dejar a nadie encerrado pesa más que la limpieza
 * de la pantalla.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ANCHO_ANALISIS, CUADROS_RAFAGA, PROPORCION_MARCO,
  aGris, analizar, consolidar,
  type Consejo,
} from '@/lib/firma-escaner'

/** Cuadros seguidos en «listo» antes de capturar. A ~12/s son unos 0,4 s:
 *  suficiente para descartar un acierto de casualidad, poco para impacientar. */
const CUADROS_PARA_DISPARAR = 5

/** Sin captura automática pasado esto, aparece el disparo manual. */
const MS_HASTA_DISPARO_MANUAL = 9000

/** Lado mayor del recorte que se procesa. Más resolución no mejora un trazo
 *  y multiplica el trabajo de la mediana en un teléfono modesto. */
const ANCHO_PROCESO = 1280

const MENSAJE: Record<Consejo, { titulo: string; pista: string }> = {
  buscando:  { titulo: 'Apunta a tu firma',     pista: 'Ponla dentro del recuadro' },
  falta_luz: { titulo: 'Necesitas más luz',     pista: 'Acércate a una ventana o enciende la luz' },
  acercate:  { titulo: 'Acércate un poco',      pista: 'La firma debe llenar el recuadro' },
  despeja:   { titulo: 'Algo tapa el recuadro', pista: 'Retira la mano o la sombra' },
  quieto:    { titulo: 'Mantén el pulso',       pista: 'Apoya los codos si puedes' },
  listo:     { titulo: 'Quieto ahí…',           pista: 'Capturando' },
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

  const [etapa, setEtapa]       = useState<Etapa>('iniciando')
  const [consejo, setConsejo]   = useState<Consejo>('buscando')
  const [progreso, setProgreso] = useState(0)
  const [manual, setManual]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [firma, setFirma]       = useState<{ blob: Blob; url: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

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

    // Un marco parcialmente fuera del cuadro real daría un recorte inválido.
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      w: Math.max(1, Math.min(Math.round(w), video.videoWidth)),
      h: Math.max(1, Math.min(Math.round(h), video.videoHeight)),
    }
  }, [])

  /** Un recorte del marco guía, al ancho pedido. */
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
      capturandoRef.current = false
      buenosRef.current = 0
      setProgreso(0)
      setEtapa('escaneando')
      return
    }

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
      // ~12 lecturas por segundo. Analizar cada cuadro no mejora el consejo y
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
        setProgreso(Math.min(1, buenosRef.current / CUADROS_PARA_DISPARAR))
        if (buenosRef.current >= CUADROS_PARA_DISPARAR) void capturar()
      } else {
        buenosRef.current = 0
        setProgreso(0)
      }
    }

    rafRef.current = requestAnimationFrame(bucle)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [etapa, tomarRecorte, capturar])

  // ── Cámara ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!abierto) return
    let cancelado = false

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
    }
  }, [abierto])

  // Disparo manual, solo si el automático no llegó.
  useEffect(() => {
    if (etapa !== 'escaneando') return
    const t = setTimeout(() => setManual(true), MS_HASTA_DISPARO_MANUAL)
    return () => clearTimeout(t)
  }, [etapa])

  // La URL del objeto vive mientras se revisa; al descartarla hay que soltarla.
  useEffect(() => () => { if (firma) URL.revokeObjectURL(firma.url) }, [firma])

  if (!abierto) return null

  function repetir() {
    if (firma) URL.revokeObjectURL(firma.url)
    setFirma(null)
    previoRef.current = null
    buenosRef.current = 0
    capturandoRef.current = false
    setProgreso(0)
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

  const texto = MENSAJE[consejo]

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
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
        <span className="w-16" />
      </div>

      {/* ── Cámara ── */}
      {etapa !== 'revisando' && etapa !== 'error' && (
        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Marco guía: todo lo de fuera se oscurece con un borde enorme. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              ref={marcoRef}
              style={{ width: '88%', aspectRatio: String(PROPORCION_MARCO) }}
              className="relative rounded-2xl outline-[9999px] outline outline-black/55 transition-colors duration-200"
            >
              {/* Esquinas: dicen «encuadra aquí» sin escribirlo. */}
              {(['-top-px -left-px border-t-4 border-l-4 rounded-tl-2xl',
                 '-top-px -right-px border-t-4 border-r-4 rounded-tr-2xl',
                 '-bottom-px -left-px border-b-4 border-l-4 rounded-bl-2xl',
                 '-bottom-px -right-px border-b-4 border-r-4 rounded-br-2xl'] as const).map((c, i) => (
                <span
                  key={i}
                  className={`absolute w-9 h-9 ${c} transition-colors duration-200 ${
                    consejo === 'listo' ? 'border-emerald-400' : 'border-white/90'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Un mensaje, uno solo. */}
          <div className="absolute inset-x-0 bottom-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] px-6">
            <div className="flex flex-col items-center gap-3">
              {/* Anillo de progreso: enseña que la captura está en camino. */}
              <div className="relative w-14 h-14">
                <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
                  <circle cx="28" cy="28" r="25" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="4" />
                  <circle
                    cx="28" cy="28" r="25" fill="none"
                    stroke={consejo === 'listo' ? '#34d399' : 'rgba(255,255,255,.55)'}
                    strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 25}
                    strokeDashoffset={2 * Math.PI * 25 * (1 - progreso)}
                    style={{ transition: 'stroke-dashoffset .12s linear' }}
                  />
                </svg>
              </div>
              <p className="text-white text-lg font-semibold text-center">
                {etapa === 'procesando' ? 'Listo, procesando…' : texto.titulo}
              </p>
              <p className="text-white/70 text-sm text-center max-w-xs">
                {etapa === 'procesando' ? 'Un segundo' : texto.pista}
              </p>

              {manual && etapa === 'escaneando' && (
                <button
                  onClick={() => void capturar()}
                  className="mt-1 text-white/90 text-sm underline underline-offset-4"
                >
                  Capturar ahora
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Revisión, sobre el documento de verdad ── */}
      {etapa === 'revisando' && firma && (
        <div className="flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
              {guardando ? 'Guardando…' : 'Sí, es mi firma'}
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
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/70 text-sm">Abriendo la cámara…</p>
        </div>
      )}
    </div>
  )
}
