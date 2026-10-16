'use client'

/**
 * components/ui/FilaDocumento.tsx — Una fila del formulario de envío del informe: un documento que se sube, o el
 * campo que va con él.
 *
 * ── Por qué una sola fila para todos ─────────────────────────────────────
 *
 * El formulario mezclaba cuatro tratamientos: la factura en ámbar y a ancho completo, la planilla en media columna y
 * verde al cargarla, el número como un campo suelto con la etiqueta encima y el soporte del pago a ancho completo.
 * Ninguno es más importante que otro —los cuatro son obligatorios para enviar—, pero el ámbar y el verde de fondo
 * hacían que uno saltara a la vista sobre los demás.
 *
 * Aquí todos tienen la MISMA presencia: mismo fondo neutro, mismo borde, misma altura y la misma distribución
 * (icono · título · estado · acciones). El estado se lee en una línea pequeña bajo el título, no en el color de toda la
 * fila. Solo una fila cambia de aspecto: la que falta cuando se intentó enviar sin ella (borde rojo), que es
 * justamente la que hay que mirar.
 *
 * ── El letrero ───────────────────────────────────────────────────────────
 *
 * La «i» junto al título explica QUÉ ES ese documento. Aparece al pasar el cursor, al enfocar con el teclado y al
 * tocar (en un teléfono no hay cursor). Ocupa el ancho de la fila y flota sobre las siguientes sin empujarlas: nada se
 * mueve al abrirlo. Escape lo cierra.
 *
 * ── Iconografía ──────────────────────────────────────────────────────────
 *
 * Todo sale del catálogo (`lib/iconos.ts`), sin `<svg>` sueltos: un icono por documento, ninguno repetido, y los de
 * estado y acción son los mismos en todas las filas. Los iconos que van solos en un botón llevan nombre accesible.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

export type EstadoFila = 'vacio' | 'cargado' | 'error' | 'subiendo'

/** El estado se dice con un icono y una línea de texto: el color acompaña, no carga el significado solo. */
const ESTADO: Record<EstadoFila, { icono: LucideIcon; texto: string }> = {
  vacio: { icono: Iconos.estado.pendiente, texto: 'text-gray-500' },
  cargado: { icono: Iconos.estado.aprobado, texto: 'text-emerald-700' },
  error: { icono: Iconos.estado.advertencia, texto: 'text-red-600' },
  subiendo: { icono: Iconos.estado.enEspera, texto: 'text-gray-500' },
}

/** 36 px: el mismo cuadrado para ver, reemplazar y quitar, y la misma altura que el campo de texto de la fila. */
const BOTON_ICONO =
  'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-white hover:text-gray-900 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50'

const BOTON_TEXTO =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 ' +
  'transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

interface Props {
  /** El icono del documento, del catálogo: `Iconos.documentos.planilla`. */
  icono: LucideIcon
  titulo: string
  /** Qué es el documento. Es el letrero de la «i» (ver `lib/ayudas-documentos.ts`). */
  ayuda: string
  estado: EstadoFila
  /** La línea bajo el título: en qué punto está y qué hacer. */
  detalle: string
  /** Dirección (ya firmada) para ver el archivo cargado. */
  urlVer?: string | null
  /** Si falta, la fila es de solo lectura: sin subir ni quitar. */
  onSubir?: (archivo: File) => void
  onQuitar?: () => void
  /**
   * Sustituye a las acciones de archivo: para un campo de texto que debe tener la misma presencia que un documento
   * (el número de la planilla).
   */
  children?: ReactNode
}

export default function FilaDocumento({
  icono, titulo, ayuda, estado, detalle, urlVer, onSubir, onQuitar, children,
}: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const idLetrero = useId()

  // `sobre`: el cursor o el teclado están en la «i». `fijada`: se tocó (o se pulsó) y se queda hasta cerrarla.
  const [sobre, setSobre] = useState(false)
  const [fijada, setFijada] = useState(false)
  const abierto = sobre || fijada

  // Al tocar fuera se cierra el letrero fijado: en un teléfono no hay «salir del cursor».
  useEffect(() => {
    if (!fijada) return
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setFijada(false)
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [fijada])

  const e = ESTADO[estado]
  const subiendo = estado === 'subiendo'
  const cargado = estado === 'cargado'

  const acciones = (urlVer || onSubir || onQuitar) && (
    <div className="ml-auto flex items-center gap-1">
      {urlVer && (
        <a
          href={urlVer}
          target="_blank"
          rel="noopener noreferrer"
          title="Ver"
          aria-label={`Ver ${titulo}`}
          className={BOTON_ICONO}
        >
          <Icono glifo={Iconos.accion.ver} tamano="sm" />
        </a>
      )}

      {onSubir && (
        <>
          <input
            ref={entrada}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={subiendo}
            onChange={(ev) => {
              const archivo = ev.target.files?.[0]
              ev.target.value = ''
              if (archivo) onSubir(archivo)
            }}
          />
          {/* Vacío: el botón dice lo que hace. Cargado: queda el icono, igual que ver y quitar. */}
          <button
            type="button"
            disabled={subiendo}
            onClick={() => entrada.current?.click()}
            title={cargado ? 'Reemplazar' : undefined}
            aria-label={cargado ? `Reemplazar ${titulo}` : `Subir ${titulo}`}
            className={cargado ? BOTON_ICONO : BOTON_TEXTO}
          >
            <Icono glifo={cargado ? Iconos.accion.recargar : Iconos.documentos.subir} tamano="sm" />
            {!cargado && <span>Subir PDF</span>}
          </button>
        </>
      )}

      {onQuitar && cargado && (
        <button
          type="button"
          onClick={onQuitar}
          title="Quitar"
          aria-label={`Quitar ${titulo}`}
          className={`${BOTON_ICONO} hover:!bg-red-50 hover:!text-red-600`}
        >
          <Icono glifo={Iconos.accion.eliminar} tamano="sm" />
        </button>
      )}
    </div>
  )

  return (
    <div ref={raiz} className="relative">
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-gray-50 px-3.5 py-3 transition-colors ${
          estado === 'error' ? 'border-red-400' : 'border-gray-200'
        }`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500">
          <Icono glifo={icono} tamano="md" />
        </span>

        <div className="min-w-[10rem] flex-1">
          <div className="flex items-center gap-1">
            <p className="text-sm font-medium text-gray-900">{titulo}</p>
            <button
              type="button"
              aria-label={`Qué es: ${titulo}`}
              aria-expanded={abierto}
              aria-describedby={abierto ? idLetrero : undefined}
              onMouseEnter={() => setSobre(true)}
              onMouseLeave={() => setSobre(false)}
              onFocus={() => setSobre(true)}
              onBlur={() => setSobre(false)}
              onClick={() => setFijada((v) => !v)}
              onKeyDown={(ev) => {
                if (ev.key === 'Escape') { setSobre(false); setFijada(false) }
              }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-200/70 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              <Icono glifo={Iconos.estado.informacion} tamano="sm" />
            </button>
          </div>
          <p className={`mt-0.5 flex items-start gap-1 text-xs ${e.texto}`}>
            <Icono glifo={e.icono} tamano="sm" className="mt-px shrink-0" />
            <span>{detalle}</span>
          </p>
        </div>

        {children ?? acciones}
      </div>

      {abierto && (
        <div
          id={idLetrero}
          role="tooltip"
          className="absolute inset-x-2 top-full z-20 mt-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-xs leading-relaxed text-slate-100 shadow-lg"
        >
          {ayuda}
        </div>
      )}
    </div>
  )
}
