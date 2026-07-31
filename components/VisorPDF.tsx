'use client'

/**
 * Visor de PDF integrado.
 *
 * Se renderiza con pdf.js sobre <canvas> en lugar de incrustar el archivo en un
 * <iframe>. Motivo: los navegadores móviles —Safari de iPhone sobre todo— no
 * renderizan PDFs incrustados de forma confiable (muestran una hoja en blanco o
 * fuerzan la descarga), y los usuarios de esta pantalla trabajan desde el móvil.
 *
 * Beneficio adicional de seguridad: pdf.js no ejecuta el JavaScript que pueda
 * llevar embebido un PDF, así que un documento malicioso no puede actuar sobre
 * la aplicación.
 *
 * pdfjs-dist pesa bastante, así que se importa de forma dinámica: solo se
 * descarga cuando el usuario abre un documento por primera vez.
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
  url: string
  nombre: string
  onClose: () => void
}

/**
 * Ancho del mapa de bits de cada página, en píxeles.
 *
 * El canvas se muestra al 100% del ancho disponible, así que el mapa de bits se
 * genera con holgura: el documento sigue viéndose nítido al girar el teléfono o
 * al hacer zoom con los dedos, sin volver a renderizar. Se acota por arriba para
 * que un PDF de muchas páginas no agote la memoria del móvil.
 */
const ANCHO_MIN = 900
const ANCHO_MAX = 1600

export default function VisorPDF({ url, nombre, onClose }: Props) {
  const areaRef = useRef<HTMLDivElement>(null)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [paginas, setPaginas] = useState(0)
  const [error, setError] = useState('')

  // Cerrar con Escape + bloquear el scroll de fondo mientras el visor está abierto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflowPrevio
    }
  }, [onClose])

  useEffect(() => {
    // React ejecuta este efecto dos veces en desarrollo (StrictMode). Sin este
    // testigo, la segunda pasada añadiría un segundo juego de páginas al mismo
    // contenedor y el documento se vería duplicado.
    let cancelado = false
    let doc: { destroy: () => void } | null = null

    const contenedor = contenedorRef.current
    if (contenedor) contenedor.replaceChildren()

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        // El worker se sirve desde el propio bundle (evita CDN externo, que
        // además estaría bloqueado por la política de contenido).
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const cargado = await pdfjs.getDocument({ url }).promise
        if (cancelado) { cargado.destroy(); return }
        doc = cargado
        setPaginas(cargado.numPages)

        const anchoBitmap = Math.round(Math.min(
          ANCHO_MAX,
          Math.max(ANCHO_MIN, (areaRef.current?.clientWidth ?? 0) * (window.devicePixelRatio || 1)),
        ))

        for (let n = 1; n <= cargado.numPages; n++) {
          const page = await cargado.getPage(n)
          if (cancelado) return

          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: anchoBitmap / base.width })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          // El mapa de bits es fijo; la presentación se adapta al contenedor.
          canvas.className = 'block w-full h-auto mx-auto mb-3 rounded-lg shadow-sm bg-white'
          canvas.setAttribute('aria-label', `Página ${n} de ${cargado.numPages}`)

          const ctx = canvas.getContext('2d')
          if (!ctx) continue

          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelado) return

          // Se añade ya pintada: la primera página aparece de inmediato y las
          // demás van llegando, en vez de esperar a que termine todo el archivo.
          contenedorRef.current?.appendChild(canvas)
          if (n === 1) setEstado('listo')
          page.cleanup()
        }

        if (!cancelado) setEstado('listo')
      } catch (e) {
        if (cancelado) return
        setError(e instanceof Error ? e.message : 'No se pudo abrir el documento')
        setEstado('error')
      }
    })()

    return () => {
      cancelado = true
      doc?.destroy()
    }
  }, [url])

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex flex-col"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Documento ${nombre}`}
    >
      {/* Barra superior */}
      <div
        className="shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 bg-gray-900 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="w-8 h-8 rounded-lg bg-red-500/15 text-red-300 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold tracking-tight">PDF</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{nombre}</p>
          {paginas > 0 && (
            <p className="text-[11px] text-white/50">
              {paginas} {paginas === 1 ? 'página' : 'páginas'}
            </p>
          )}
        </div>
        <a
          href={url}
          download={nombre}
          onClick={(e) => e.stopPropagation()}
          title="Descargar"
          aria-label="Descargar documento"
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </a>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar"
          aria-label="Cerrar documento"
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Lienzo con scroll.
          El contenedor nunca se oculta: si estuviera en display:none mediría
          cero de ancho y las páginas se renderizarían a escala inválida. Los
          estados de carga y error se superponen encima. */}
      <div
        ref={areaRef}
        className="relative flex-1 overflow-y-auto overscroll-contain px-2 sm:px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={contenedorRef} className="mx-auto max-w-3xl" />

        {estado === 'cargando' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm">Abriendo documento…</p>
          </div>
        )}

        {estado === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
            <p className="text-white text-sm font-medium">No se pudo mostrar el documento</p>
            <p className="text-white/50 text-xs max-w-sm">{error}</p>
            <a
              href={url}
              download={nombre}
              className="mt-2 text-xs font-semibold text-blue-300 hover:text-blue-200 underline"
            >
              Descargarlo en su lugar
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
