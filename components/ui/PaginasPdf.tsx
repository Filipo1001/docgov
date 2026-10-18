'use client'

/**
 * components/ui/PaginasPdf.tsx — Un PDF dibujado página a página (pdf.js sobre <canvas>) con dos extras que el visor
 * simple (`components/VisorPDF.tsx`) no tiene y la revisión de la planilla necesita:
 *
 *   · LEE el texto del documento y se lo entrega a quien lo pida (`onTexto`). Se hace aquí, en el navegador de quien
 *     revisa: el PDF no sale del sistema ni va a ningún servicio externo.
 *   · RESALTA fragmentos sobre el documento (`marcas`) y lleva la vista hasta uno (`activa`).
 *
 * Contraseña: algunos operadores entregan la planilla cifrada con la cédula del contratista (26 de 348 el 17-oct-2026,
 * y las 26 se abren con ella). Quien revisa no tiene por qué saberlo ni teclearlo: se prueba cada clave de `claves`.
 *
 * Las posiciones de los resaltes se guardan como FRACCIÓN de la página, no en píxeles: el lienzo se muestra al ancho
 * disponible y su mapa de bits es mayor, así que lo único que no cambia al redimensionar es la proporción.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { cajasDe, leerTexto, type Caja, type ItemTexto, type Marca } from '@/lib/pdf-texto'

export type { Marca }

export type EstadoPdf = 'cargando' | 'listo' | 'error' | 'protegido'

const ANCHO_MIN = 900
const ANCHO_MAX = 1600

async function abrirDocumento(url: string, claves: string[]): Promise<{ doc: PDFDocumentProxy; pdfjs: typeof import('pdfjs-dist') }> {
  const pdfjs = await import('pdfjs-dist')
  // El worker se sirve desde el propio bundle (evita CDN externo, que además estaría bloqueado por la política de contenido).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

  const respuesta = await fetch(url)
  if (!respuesta.ok) throw new Error(`No se pudo descargar el documento (${respuesta.status})`)
  const bytes = new Uint8Array(await respuesta.arrayBuffer())

  // Sin clave primero; después cada una. pdf.js consume el buffer, así que cada intento recibe su copia.
  for (const password of [undefined, ...claves]) {
    try {
      const doc = await pdfjs.getDocument({ data: bytes.slice(), password }).promise
      return { doc, pdfjs }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'PasswordException') throw e
    }
  }
  throw Object.assign(new Error('protegido'), { protegido: true })
}

const TONO: Record<Marca['tono'], string> = {
  ok: 'bg-emerald-300/40 ring-1 ring-emerald-500/60',
  aviso: 'bg-amber-300/50 ring-1 ring-amber-500/70',
}

function PaginaPdf({ page, ancho, cajas, activa }: { page: PDFPageProxy; ancho: number; cajas: Caja[]; activa: string | null }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const vista = useMemo(() => {
    const base = page.getViewport({ scale: 1 })
    return page.getViewport({ scale: ancho / base.width })
  }, [page, ancho])

  useEffect(() => {
    const canvas = lienzo.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = vista.width
    canvas.height = vista.height
    const tarea = page.render({ canvasContext: ctx, viewport: vista })
    tarea.promise.catch(() => { /* cancelada al desmontar */ })
    return () => tarea.cancel()
  }, [page, vista])

  return (
    <div className="relative mx-auto mb-3 overflow-hidden rounded-lg bg-white shadow-sm">
      <canvas ref={lienzo} aria-label={`Página ${page.pageNumber}`} className="block h-auto w-full" />
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
  url, claves = [], marcas = [], activa = null, onTexto, onEstado,
}: {
  url: string
  claves?: string[]
  marcas?: Marca[]
  /** Qué marca llevar a la vista (su id). */
  activa?: string | null
  /** El texto de cada página, cuando ya se leyó. */
  onTexto?: (paginas: string[]) => void
  onEstado?: (estado: EstadoPdf) => void
}) {
  const area = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<EstadoPdf>('cargando')
  const [error, setError] = useState('')
  const [paginas, setPaginas] = useState<{ page: PDFPageProxy; items: ItemTexto[] }[]>([])
  const [ancho, setAncho] = useState(ANCHO_MIN)
  // Los avisos al padre van por referencia: no deben reabrir el documento al cambiar la función.
  const avisos = useRef({ onTexto, onEstado })
  avisos.current = { onTexto, onEstado }

  useEffect(() => {
    let cancelado = false
    let abierto: PDFDocumentProxy | null = null
    const cambiar = (e: EstadoPdf) => { setEstado(e); avisos.current.onEstado?.(e) }
    setPaginas([])
    cambiar('cargando')

    ;(async () => {
      try {
        const { doc, pdfjs } = await abrirDocumento(url, claves)
        if (cancelado) { doc.destroy(); return }
        abierto = doc
        const px = (area.current?.clientWidth ?? 0) * (window.devicePixelRatio || 1)
        setAncho(Math.round(Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, px))))

        const leidas: { page: PDFPageProxy; items: ItemTexto[] }[] = []
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n)
          leidas.push({ page, items: await leerTexto(page, pdfjs.Util) })
        }
        if (cancelado) return
        setPaginas(leidas)
        cambiar('listo')
        avisos.current.onTexto?.(leidas.map(l => l.items.map(i => i.str).join(' ')))
      } catch (e) {
        if (cancelado) return
        if ((e as { protegido?: boolean })?.protegido) { cambiar('protegido'); return }
        setError(e instanceof Error ? e.message : 'No se pudo abrir el documento')
        cambiar('error')
      }
    })()

    return () => { cancelado = true; abierto?.destroy() }
    // `claves` se compara por contenido: la lista se vuelve a crear en cada pintado del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, claves.join('|')])

  const cajasPorPagina = useMemo(() => paginas.map(p => cajasDe(p.items, marcas)), [paginas, marcas])

  // Llevar a la vista la marca activa.
  useEffect(() => {
    if (!activa) return
    area.current?.querySelector<HTMLElement>(`[data-marca="${activa}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activa, paginas])

  return (
    <div ref={area} className="relative min-h-[240px]">
      <div className="mx-auto max-w-5xl">
        {paginas.map((p, i) => (
          <PaginaPdf key={p.page.pageNumber} page={p.page} ancho={ancho} cajas={cajasPorPagina[i] ?? []} activa={activa} />
        ))}
      </div>

      {estado === 'cargando' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500">
          <svg className="h-7 w-7 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm">Abriendo el documento…</p>
        </div>
      )}
      {(estado === 'error' || estado === 'protegido') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-sm font-medium text-gray-800">
            {estado === 'protegido' ? 'El documento tiene contraseña' : 'No se pudo mostrar el documento'}
          </p>
          <p className="max-w-sm text-xs text-gray-500">
            {estado === 'protegido'
              ? 'No se abrió con la cédula del contratista. Ábrelo en una pestaña nueva para ver si te la pide.'
              : error}
          </p>
        </div>
      )}
    </div>
  )
}
