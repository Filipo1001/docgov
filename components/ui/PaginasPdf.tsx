'use client'

/**
 * components/ui/PaginasPdf.tsx — Un PDF dibujado página a página (pdf.js sobre <canvas>) con dos extras que el visor
 * simple (`components/VisorPDF.tsx`) no tiene y la revisión de la planilla necesita:
 *
 *   · LEE el texto del documento y se lo entrega a quien lo pida (`onTexto`). Se hace aquí, en el navegador de quien
 *     revisa: el PDF no sale del sistema ni va a ningún servicio externo.
 *   · RESALTA fragmentos sobre el documento (`marcas`) y lleva la vista hasta uno (`activa`).
 *
 * Qué puede salir mal, y qué se hace:
 *
 *   · Cifrado con la cédula del contratista (26 de 348 el 17-oct-2026, y las 26 se abren con ella): se prueba cada clave
 *     de `claves`. Si ninguna sirve, se PIDE la contraseña (no se queda en un callejón).
 *   · Enlace vencido (las direcciones firmadas duran horas), archivo que no es un PDF o dañado, sin red, o tan lento que
 *     deja de ser útil (60 s): mensaje que dice qué pasó y «Reintentar»; el documento siempre se puede abrir aparte.
 *   · Muchas páginas, o páginas enormes: las páginas se dibujan SOLO cuando se acercan a la pantalla, el lienzo tiene un
 *     tope de alto y el texto se lee hasta cierto número de páginas.
 *   · La dirección firmada cambia de firma al recargar la página aunque el archivo sea el mismo: se reabre solo si
 *     cambia el ARCHIVO, no la firma (si no, el documento parpadearía a media revisión).
 *
 * ZOOM: con `zoom` > 1 las páginas se ensanchan (y quien las contiene desplaza en horizontal) y el mapa de bits se vuelve
 * a dibujar con más resolución —hasta un tope—, así que las cifras pequeñas de una planilla se leen nítidas, no
 * pixeladas. Es lo que hace falta en un teléfono, donde una página apaisada cabe en 375 píxeles de ancho.
 *
 * Las posiciones de los resaltes son fracción de la página (`lib/pdf-texto.ts`): valen a cualquier tamaño y con páginas
 * giradas.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { cajasDe, leerTexto, type Caja, type ItemTexto, type Marca } from '@/lib/pdf-texto'

export type { Marca }

export type EstadoPdf = 'cargando' | 'listo' | 'error' | 'protegido'

const ANCHO_MIN = 900
const ANCHO_MAX = 1600
/** Con zoom el mapa de bits puede crecer más, hasta aquí (un lienzo de 2600 de ancho ya pesa ~14 MB por página). */
const ANCHO_MAX_CON_ZOOM = 2600
/** El lienzo no pasa de este alto: los navegadores fallan con lienzos enormes. */
const ALTO_MAX_LIENZO = 12_000
/** Hasta esta página se lee el texto; una planilla tiene una o dos. */
const PAGINAS_CON_TEXTO = 40
const ESPERA_MAX_MS = 60_000

/** Un error que se le puede explicar a quien revisa. */
class ErrorDeDocumento extends Error {
  readonly protegido: boolean
  constructor(mensaje: string, protegido = false) {
    super(mensaje)
    this.protegido = protegido
  }
}

/** Dirección sin la firma: identifica el ARCHIVO, no el permiso temporal para leerlo. */
export const identidadDelArchivo = (url: string) => url.split('?')[0]

async function abrirDocumento(url: string, claves: string[]): Promise<{ doc: PDFDocumentProxy; pdfjs: typeof import('pdfjs-dist') }> {
  const pdfjs = await import('pdfjs-dist')
  // El worker se sirve desde el propio bundle (evita CDN externo, que además estaría bloqueado por la política de contenido).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), ESPERA_MAX_MS)
  let bytes: Uint8Array
  try {
    const respuesta = await fetch(url, { signal: control.signal })
    if (respuesta.status === 400 || respuesta.status === 401 || respuesta.status === 403) {
      throw new ErrorDeDocumento('El enlace del documento venció. Recarga la página para pedir uno nuevo.')
    }
    if (respuesta.status === 404) throw new ErrorDeDocumento('El documento ya no está en el sistema.')
    if (!respuesta.ok) throw new ErrorDeDocumento(`No se pudo descargar el documento (error ${respuesta.status}).`)
    bytes = new Uint8Array(await respuesta.arrayBuffer())
  } catch (e) {
    if (e instanceof ErrorDeDocumento) throw e
    if ((e as { name?: string })?.name === 'AbortError') throw new ErrorDeDocumento('El documento tarda demasiado en llegar. Revisa tu conexión y reintenta.')
    throw new ErrorDeDocumento('No se pudo descargar el documento. Revisa tu conexión y reintenta.')
  } finally {
    clearTimeout(reloj)
  }
  if (bytes.length === 0) throw new ErrorDeDocumento('El archivo está vacío.')

  // Sin clave primero; después cada una. pdf.js consume el buffer, así que cada intento recibe su copia.
  for (const password of [undefined, ...claves]) {
    try {
      const doc = await pdfjs.getDocument({ data: bytes.slice(), password, isEvalSupported: false, enableXfa: false }).promise
      return { doc, pdfjs }
    } catch (e) {
      const nombre = (e as { name?: string })?.name
      if (nombre === 'PasswordException') continue
      if (nombre === 'InvalidPDFException' || nombre === 'FormatError') throw new ErrorDeDocumento('El archivo no es un PDF válido o está dañado.')
      if (nombre === 'MissingPDFException') throw new ErrorDeDocumento('El documento no se encontró.')
      throw new ErrorDeDocumento('No se pudo abrir el documento.')
    }
  }
  throw new ErrorDeDocumento('protegido', true)
}

const TONO: Record<Marca['tono'], string> = {
  ok: 'bg-emerald-300/40 ring-1 ring-emerald-500/60',
  aviso: 'bg-amber-300/50 ring-1 ring-amber-500/70',
}

function PaginaPdf({ page, ancho, cajas, activa }: { page: PDFPageProxy; ancho: number; cajas: Caja[]; activa: string | null }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  // Si el navegador no logra dibujarla (poca memoria, lienzo demasiado grande), se dice: una hoja en blanco no explica nada.
  const [fallo, setFallo] = useState(false)
  const envoltura = useRef<HTMLDivElement>(null)
  // Se dibuja cuando se acerca a la pantalla (con margen), y ya no se borra: un PDF largo no agota la memoria del teléfono
  // salvo que se recorra entero.
  const [cerca, setCerca] = useState(false)

  const { base, vista } = useMemo(() => {
    const base = page.getViewport({ scale: 1 })
    const escala = Math.min(ancho / base.width, ALTO_MAX_LIENZO / base.height)
    return { base, vista: page.getViewport({ scale: escala }) }
  }, [page, ancho])

  useEffect(() => {
    const el = envoltura.current
    if (!el || cerca) return
    if (typeof IntersectionObserver === 'undefined') { setCerca(true); return }
    const obs = new IntersectionObserver(entradas => { if (entradas.some(e => e.isIntersecting)) setCerca(true) }, { rootMargin: '900px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [cerca])

  useEffect(() => {
    if (!cerca) return
    const canvas = lienzo.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = vista.width
    canvas.height = vista.height
    setFallo(false)
    const tarea = page.render({ canvasContext: ctx, viewport: vista })
    tarea.promise.catch((e: { name?: string }) => {
      // Cancelar al desmontar o al cambiar el zoom no es un fallo.
      if (e?.name !== 'RenderingCancelledException') setFallo(true)
    })
    return () => tarea.cancel()
  }, [page, vista, cerca])

  return (
    // La proporción se reserva desde el principio: así las marcas y el desplazamiento valen aunque el lienzo aún no esté pintado.
    <div ref={envoltura} className="relative mx-auto mb-3 overflow-hidden rounded-lg bg-white shadow-sm" style={{ aspectRatio: `${base.width} / ${base.height}` }}>
      <canvas ref={lienzo} aria-label={`Página ${page.pageNumber}`} className="block h-full w-full" />
      {fallo && (
        <p role="alert" className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-gray-500">
          No se pudo dibujar esta página. Prueba con menos zoom o ábrela en una pestaña nueva.
        </p>
      )}
      {cajas.map((c, i) => (
        <span
          key={i}
          data-marca={c.id}
          aria-hidden
          className={`pointer-events-none absolute rounded-sm transition-shadow ${TONO[c.tono]} ${activa === c.id ? 'shadow-[0_0_0_4px_rgba(250,204,21,0.55)]' : ''}`}
          style={{ left: `${c.izq * 100}%`, top: `${c.arr * 100}%`, width: `${c.ancho * 100}%`, height: `${c.alto * 100}%` }}
        />
      ))}
    </div>
  )
}

export default function PaginasPdf({
  url, claves = [], marcas = [], activa = null, zoom = 1, onTexto, onEstado, onMarcas, onAspecto,
}: {
  url: string
  claves?: string[]
  marcas?: Marca[]
  /** 1 = ajustado al ancho; más = acercado (las páginas se ensanchan y se desplazan). */
  zoom?: number
  /** Ancho ÷ alto de la primera página, cuando se conoce: una página apaisada pide más zoom en un teléfono. */
  onAspecto?: (aspecto: number) => void
  /** Qué marca llevar a la vista (su id). */
  activa?: string | null
  /** El texto de cada página, cuando ya se leyó. */
  onTexto?: (paginas: string[]) => void
  onEstado?: (estado: EstadoPdf) => void
  /** Qué marcas se pudieron señalar sobre el documento (su id): las que no, no tienen adónde llevar la vista. */
  onMarcas?: (ids: Set<string>) => void
}) {
  const area = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<EstadoPdf>('cargando')
  const [error, setError] = useState('')
  const [paginas, setPaginas] = useState<{ page: PDFPageProxy; items: ItemTexto[] }[]>([])
  const [ancho, setAncho] = useState(ANCHO_MIN)
  const [intento, setIntento] = useState(0)
  const [clavePuesta, setClavePuesta] = useState<string | null>(null)
  const [claveMala, setClaveMala] = useState(false)
  const [borrador, setBorrador] = useState('')

  // Los avisos y la dirección vigente van por referencia: no deben reabrir el documento al cambiar la función ni la firma.
  const avisos = useRef({ onTexto, onEstado, onMarcas, onAspecto })
  avisos.current = { onTexto, onEstado, onMarcas, onAspecto }
  const urlVigente = useRef(url)
  urlVigente.current = url
  const clavesVigentes = useRef<string[]>([])
  clavesVigentes.current = clavePuesta ? [...claves, clavePuesta] : claves
  const archivo = identidadDelArchivo(url)

  useEffect(() => {
    let cancelado = false
    let abierto: PDFDocumentProxy | null = null
    const cambiar = (e: EstadoPdf) => { setEstado(e); avisos.current.onEstado?.(e) }
    setPaginas([])
    cambiar('cargando')

    ;(async () => {
      try {
        const { doc, pdfjs } = await abrirDocumento(urlVigente.current, clavesVigentes.current)
        if (cancelado) { doc.destroy(); return }
        abierto = doc
        const primera = await doc.getPage(1)
        const base = primera.getViewport({ scale: 1 })
        avisos.current.onAspecto?.(base.width / base.height)

        const leidas: { page: PDFPageProxy; items: ItemTexto[] }[] = []
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n)
          // El texto solo hasta cierta página; las demás se dibujan sin leerse.
          leidas.push({ page, items: n <= PAGINAS_CON_TEXTO ? await leerTexto(page, pdfjs.Util) : [] })
        }
        if (cancelado) return
        setClaveMala(false)
        setPaginas(leidas)
        cambiar('listo')
        avisos.current.onTexto?.(leidas.map(l => l.items.map(i => i.str).join(' ')))
      } catch (e) {
        if (cancelado) return
        if (e instanceof ErrorDeDocumento && e.protegido) { setClaveMala(!!clavePuesta); cambiar('protegido'); return }
        setError(e instanceof Error ? e.message : 'No se pudo abrir el documento.')
        cambiar('error')
      }
    })()

    return () => { cancelado = true; abierto?.destroy() }
    // Se reabre si cambia el ARCHIVO (no la firma), las claves, la contraseña tecleada o se pide reintentar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo, claves.join('|'), clavePuesta, intento])

  // La resolución del mapa de bits sigue al zoom (con un pequeño retardo: no se redibuja a cada toque del botón).
  useEffect(() => {
    const calcular = () => {
      const px = (area.current?.clientWidth ?? 0) * zoom * (window.devicePixelRatio || 1)
      setAncho(Math.round(Math.min(zoom > 1 ? ANCHO_MAX_CON_ZOOM : ANCHO_MAX, Math.max(ANCHO_MIN, px))))
    }
    if (zoom === 1) { calcular(); return }
    const id = setTimeout(calcular, 250)
    return () => clearTimeout(id)
  }, [zoom, estado])

  const cajasPorPagina = useMemo(() => paginas.map(p => cajasDe(p.items, marcas)), [paginas, marcas])

  // Avisar de cuáles marcas tienen dónde señalarse.
  useEffect(() => {
    avisos.current.onMarcas?.(new Set(cajasPorPagina.flat().map(c => c.id)))
  }, [cajasPorPagina])

  // Llevar a la vista la marca activa.
  useEffect(() => {
    if (!activa) return
    area.current?.querySelector<HTMLElement>(`[data-marca="${activa}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [activa, paginas])

  return (
    <div ref={area} className="relative min-h-[240px]">
      <div className="mx-auto" style={zoom > 1 ? { width: `${zoom * 100}%` } : { maxWidth: '64rem' }}>
        {paginas.map((p, i) => (
          <PaginaPdf key={p.page.pageNumber} page={p.page} ancho={ancho} cajas={cajasPorPagina[i] ?? []} activa={activa} />
        ))}
      </div>

      {estado === 'cargando' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500" role="status">
          <svg className="h-7 w-7 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm">Abriendo el documento…</p>
        </div>
      )}

      {estado === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center" role="alert">
          <p className="text-sm font-medium text-gray-800">No se pudo mostrar el documento</p>
          <p className="max-w-sm text-xs text-gray-500">{error}</p>
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={() => setIntento(n => n + 1)} className="h-8 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
              Reintentar
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
              Abrir en pestaña nueva
            </a>
          </div>
        </div>
      )}

      {estado === 'protegido' && (
        <form
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
          onSubmit={e => { e.preventDefault(); if (borrador.trim()) setClavePuesta(borrador.trim()) }}
        >
          <p className="text-sm font-medium text-gray-800">El documento tiene contraseña</p>
          <p className="max-w-sm text-xs text-gray-500">
            {claves.length > 0 ? 'No se abrió con la cédula del contratista. Si conoces la contraseña, escríbela.' : 'Si conoces la contraseña, escríbela.'}
          </p>
          <div className="mt-1 flex gap-2">
            <input
              type="password"
              autoComplete="off"
              aria-label="Contraseña del documento"
              value={borrador}
              onChange={e => setBorrador(e.target.value)}
              className="h-8 w-44 rounded-lg border border-gray-300 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-gray-400"
            />
            <button type="submit" disabled={!borrador.trim()} className="h-8 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1">
              Abrir
            </button>
          </div>
          {claveMala && <p className="text-xs text-red-600" role="alert">Esa contraseña no abre el documento.</p>}
        </form>
      )}
    </div>
  )
}
