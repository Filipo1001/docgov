'use client'

/**
 * components/ui/PanelDocumentos.tsx — EXPERIMENTO de diseño: tres variantes del apartado de documentos de seguridad
 * social del formulario de envío. Cuando se elija una, las otras dos se borran.
 *
 * Idea de partida (de Felipe): una sola fila de botones, uno al lado del otro; los tres puntitos DENTRO del botón, arriba
 * a la derecha, para reemplazar o eliminar el documento; y el campo del número de planilla, del doble de ancho que los
 * demás. Poco texto, y que el apartado no sea el protagonista de la página.
 *
 * Orden: [factura, si aplica] · planilla · número de planilla (doble) · soporte del pago.
 *
 * Comportamiento común:
 *   · Botón vacío: un clic abre el selector de archivos (PDF).
 *   · Botón con documento: un clic lo abre; los tres puntitos ofrecen Ver, Reemplazar y Eliminar.
 *   · El letrero «qué es» sale al pasar el cursor o enfocar con el teclado (un solo letrero para todo el panel, bajo la
 *     fila: así cabe siempre, también en un teléfono). En pantallas táctiles no hay cursor: el botón lleva su etiqueta.
 *   · Responde al ancho de SU tarjeta (consultas de contenedor), no al de la ventana.
 */

import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

export type Variante = 'fichas' | 'barra' | 'segmentada'
export type EstadoDoc = 'vacio' | 'cargado' | 'error' | 'subiendo'

export interface Documento {
  icono: LucideIcon
  etiqueta: string
  /** Qué es el documento: el letrero que sale al pasar el cursor. */
  ayuda: string
  estado: EstadoDoc
  urlVer?: string | null
  onSubir?: (archivo: File) => void
  onQuitar?: () => void
}

export interface CampoNumero {
  etiqueta: string
  ayuda: string
  valor: string
  onCambio: (valor: string) => void
  onSalir?: () => void
  /** Mensaje de error, o null. */
  error: string | null
  placeholder?: string
}

interface Props {
  variante: Variante
  planilla: Documento
  soporte: Documento
  /** Solo para quien está obligado a facturar electrónicamente. */
  factura?: Documento | null
  numero: CampoNumero
}

// ─── El letrero ──────────────────────────────────────────────────────────────

function useLetrero() {
  const [activo, setActivo] = useState<string | null>(null)
  const enlazar = (texto: string) => ({
    // Solo el ratón: en una pantalla táctil «pasar por encima» se queda pegado después de tocar.
    onPointerEnter: (e: PointerEvent) => { if (e.pointerType === 'mouse') setActivo(texto) },
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType === 'mouse') setActivo(null) },
    // El teclado sí; pero no mientras se escribe en un campo de texto: el letrero taparía lo que hay debajo.
    onFocus: (e: FocusEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName !== 'INPUT' && el.matches(':focus-visible')) setActivo(texto)
    },
    onBlur: () => setActivo(null),
  })
  return { activo, enlazar }
}

// ─── Los tres puntitos ───────────────────────────────────────────────────────

const ITEM_MENU =
  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none'

function MenuPuntitos({
  etiqueta, urlVer, alinear, onReemplazar, onEliminar,
}: {
  etiqueta: string
  urlVer?: string | null
  alinear: 'izquierda' | 'derecha'
  onReemplazar: () => void
  onEliminar: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: globalThis.PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div ref={raiz} className="absolute right-0.5 top-0.5 z-10">
      <button
        type="button"
        aria-label={`Opciones de ${etiqueta}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="grid h-7 w-7 place-items-center rounded-md text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
      >
        <Icono glifo={Iconos.accion.mas} tamano="sm" />
      </button>
      {abierto && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
            alinear === 'derecha' ? 'right-0' : 'left-0'
          }`}
        >
          {urlVer && (
            <a role="menuitem" href={urlVer} target="_blank" rel="noopener noreferrer" onClick={() => setAbierto(false)} className={ITEM_MENU}>
              <Icono glifo={Iconos.accion.ver} tamano="sm" /> Ver
            </a>
          )}
          <button type="button" role="menuitem" onClick={() => { setAbierto(false); onReemplazar() }} className={ITEM_MENU}>
            <Icono glifo={Iconos.accion.recargar} tamano="sm" /> Reemplazar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setAbierto(false); onEliminar() }}
            className={`${ITEM_MENU} !text-red-600 hover:!bg-red-50`}
          >
            <Icono glifo={Iconos.accion.eliminar} tamano="sm" /> Eliminar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Estilos por variante ────────────────────────────────────────────────────

const ENFOQUE = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400'

/**
 * La variante barra es vertical en una tarjeta estrecha y horizontal cuando hay sitio. Con cinco piezas (con factura)
 * cada botón es más estrecho, así que el cambio llega más tarde. Son literales completos a propósito: Tailwind no genera
 * clases armadas con trozos de texto.
 */
const BARRA_HORIZONTAL = {
  cuatro: {
    caja: '@md:min-h-[56px] @md:flex-row @md:gap-2.5 @md:px-3 @md:py-2 @md:text-left',
    cargado: '@md:pr-10',
    texto: '@md:text-sm',
    lista: '@md:items-start',
    alinear: '@md:text-left',
  },
  cinco: {
    caja: '@2xl:min-h-[56px] @2xl:flex-row @2xl:gap-2.5 @2xl:px-3 @2xl:py-2 @2xl:text-left',
    cargado: '@2xl:pr-10',
    texto: '@2xl:text-sm',
    lista: '@2xl:items-start',
    alinear: '@2xl:text-left',
  },
} as const

/** Clases del botón principal de un documento, según variante y estado. */
function claseBoton(v: Variante, e: EstadoDoc, conFactura: boolean): string {
  const base = `w-full h-full text-center transition-colors ${ENFOQUE}`
  if (v === 'fichas') {
    return `${base} flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-xl border px-2 pb-3 pt-7 ${
      e === 'cargado' ? 'border-gray-200 bg-gray-50 hover:bg-gray-100'
        : e === 'error' ? 'border-dashed border-red-400 bg-red-50/50'
          : e === 'subiendo' ? 'border-gray-200 bg-gray-50'
            : 'border-dashed border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
    }`
  }
  if (v === 'barra') {
    // Vertical en una tarjeta estrecha; horizontal y bajita cuando hay sitio.
    const H = BARRA_HORIZONTAL[conFactura ? 'cinco' : 'cuatro']
    return `${base} flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-lg border px-2 pb-2 pt-7 ${H.caja} ${
      e === 'cargado' ? `border-gray-200 bg-white pr-2 hover:bg-gray-50 ${H.cargado}`
        : e === 'error' ? 'border-red-400 bg-red-50/40'
          : 'border-gray-200 bg-white hover:bg-gray-50'
    }`
  }
  // segmentada: la celda no lleva borde propio en una sola fila (la divide una línea fina); sí cuando se parte en dos.
  return `${base} flex min-h-[84px] flex-col items-start justify-between gap-2 px-3 pb-3 pt-3 text-left ${
    conFactura ? 'rounded-xl @md:rounded-none' : ''
  } ${
    e === 'cargado' ? 'hover:bg-gray-100/70'
      : e === 'error' ? 'bg-red-50/60'
        : 'hover:bg-gray-100/70'
  }`
}

/** El color del icono y de la etiqueta: el color solo significa estado. */
function colorIcono(e: EstadoDoc): string {
  return e === 'cargado' ? 'text-emerald-700' : e === 'error' ? 'text-red-600' : e === 'subiendo' ? 'text-gray-300' : 'text-gray-500'
}

function ContenidoDocumento({ v, d, conFactura }: { v: Variante; d: Documento; conFactura: boolean }) {
  const cargado = d.estado === 'cargado'
  const subiendo = d.estado === 'subiendo'
  const color = colorIcono(d.estado)
  const etiqueta = (
    <span className={`text-xs font-medium leading-tight ${d.estado === 'error' ? 'text-red-600' : 'text-gray-800'} ${v === 'barra' ? BARRA_HORIZONTAL[conFactura ? 'cinco' : 'cuatro'].texto : ''}`}>
      {d.etiqueta}
    </span>
  )

  if (v === 'fichas') {
    return (
      <>
        <Icono glifo={d.icono} tamano="md" className={color} />
        {etiqueta}
        <span className="flex h-4 items-center text-[11px] leading-none text-gray-400">
          {cargado ? <Icono glifo={Iconos.estado.aprobado} tamano="sm" className="text-emerald-600" />
            : subiendo ? 'Subiendo…' : 'Subir'}
        </span>
      </>
    )
  }
  if (v === 'barra') {
    return (
      <>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          cargado ? 'bg-emerald-50' : d.estado === 'error' ? 'bg-red-50' : 'bg-gray-100'
        } ${color}`}>
          <Icono glifo={d.icono} tamano="md" />
        </span>
        {etiqueta}
      </>
    )
  }
  return (
    <>
      <Icono glifo={d.icono} tamano="md" className={color} />
      <span className="flex flex-col gap-0.5">
        {etiqueta}
        <span className="text-[11px] leading-none text-gray-400">{cargado ? 'Cargado' : subiendo ? 'Subiendo…' : 'Subir PDF'}</span>
      </span>
    </>
  )
}

/** La barrita de estado de la variante segmentada. */
function Barrita({ e }: { e: EstadoDoc }) {
  const c = e === 'cargado' ? 'bg-emerald-500' : e === 'error' ? 'bg-red-400' : 'bg-transparent'
  return <span aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-[3px] ${c}`} />
}

// ─── Una celda de documento ──────────────────────────────────────────────────

function TileDocumento({
  v, d, conFactura, alinear, enlazar, claseCelda,
}: {
  v: Variante
  d: Documento
  conFactura: boolean
  alinear: 'izquierda' | 'derecha'
  enlazar: (texto: string) => object
  claseCelda: string
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const cargado = d.estado === 'cargado'
  const subiendo = d.estado === 'subiendo'
  const elegir = () => entrada.current?.click()
  const clase = claseBoton(v, d.estado, conFactura)

  return (
    <div className={`relative ${claseCelda}`} {...enlazar(d.ayuda)}>
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={subiendo}
        onChange={(ev) => {
          const archivo = ev.target.files?.[0]
          ev.target.value = ''
          if (archivo) d.onSubir?.(archivo)
        }}
      />

      {cargado && d.urlVer ? (
        <a href={d.urlVer} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${d.etiqueta}`} className={`${clase} rounded-[inherit]`}>
          <ContenidoDocumento v={v} d={d} conFactura={conFactura} />
        </a>
      ) : (
        <button
          type="button"
          onClick={elegir}
          disabled={subiendo || !d.onSubir}
          aria-label={`Subir ${d.etiqueta}`}
          className={`${clase} rounded-[inherit] disabled:cursor-not-allowed`}
        >
          <ContenidoDocumento v={v} d={d} conFactura={conFactura} />
        </button>
      )}

      {v === 'segmentada' && <Barrita e={d.estado} />}

      {cargado && (d.onSubir || d.onQuitar) && (
        <MenuPuntitos
          etiqueta={d.etiqueta}
          urlVer={d.urlVer}
          alinear={alinear}
          onReemplazar={elegir}
          onEliminar={() => d.onQuitar?.()}
        />
      )}
    </div>
  )
}

// ─── La celda del número (doble ancho) ───────────────────────────────────────

function TileNumero({
  v, n, conFactura, enlazar, claseCelda,
}: {
  v: Variante
  n: CampoNumero
  conFactura: boolean
  enlazar: (texto: string) => object
  claseCelda: string
}) {
  const lleno = n.valor.trim().length > 0
  const error = !!n.error
  const ok = lleno && !error
  const color = error ? 'text-red-600' : ok ? 'text-emerald-700' : 'text-gray-500'

  const entrada = (alinear: string) => (
    <input
      value={n.valor}
      onChange={(e) => n.onCambio(e.target.value)}
      onBlur={n.onSalir}
      placeholder={n.placeholder ?? 'Ej. 6016087440'}
      inputMode="text"
      aria-label={n.etiqueta}
      aria-invalid={error}
      className={`w-full min-w-0 bg-transparent text-sm font-semibold tracking-wide text-gray-900 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-300 ${alinear}`}
    />
  )
  const etiqueta = (
    <span className={`flex items-center gap-1 text-xs font-medium leading-tight ${error ? 'text-red-600' : 'text-gray-800'}`}>
      {n.etiqueta}
      {ok && <Icono glifo={Iconos.estado.aprobado} tamano="sm" className="text-emerald-600" />}
    </span>
  )

  if (v === 'fichas') {
    return (
      <label {...enlazar(n.ayuda)} className={`${claseCelda} flex min-h-[104px] cursor-text flex-col items-center justify-center gap-1 rounded-xl border bg-white px-3 pb-3 pt-7 text-center transition-colors focus-within:ring-2 focus-within:ring-gray-300 ${
        error ? 'border-red-400 bg-red-50/50' : 'border-gray-300 focus-within:border-gray-400'
      }`}>
        <Icono glifo={Iconos.dominio.numero} tamano="md" className={color} />
        {etiqueta}
        {entrada('text-center')}
      </label>
    )
  }
  if (v === 'barra') {
    const H = BARRA_HORIZONTAL[conFactura ? 'cinco' : 'cuatro']
    return (
      <label {...enlazar(n.ayuda)} className={`${claseCelda} flex min-h-[96px] cursor-text flex-col items-center justify-center gap-1.5 rounded-lg border bg-white px-3 pb-2 pt-7 text-center transition-colors focus-within:ring-2 focus-within:ring-gray-300 ${H.caja} ${
        error ? 'border-red-400 bg-red-50/40' : 'border-gray-200 focus-within:border-gray-400'
      }`}>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${ok ? 'bg-emerald-50' : error ? 'bg-red-50' : 'bg-gray-100'} ${color}`}>
          <Icono glifo={Iconos.dominio.numero} tamano="md" />
        </span>
        <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${H.lista}`}>
          {etiqueta}
          {entrada(`text-center ${H.alinear}`)}
        </span>
      </label>
    )
  }
  return (
    <label {...enlazar(n.ayuda)} className={`${claseCelda} relative flex min-h-[84px] cursor-text flex-col items-start justify-between gap-2 px-3 pb-3 pt-3 text-left transition-colors focus-within:bg-gray-100/70 ${
      conFactura ? 'rounded-xl @md:rounded-none' : ''
    } ${error ? 'bg-red-50/60' : ''}`}>
      <Icono glifo={Iconos.dominio.numero} tamano="md" className={color} />
      <span className="flex w-full flex-col gap-0.5">
        {etiqueta}
        {entrada('text-left')}
      </span>
      <Barrita e={error ? 'error' : ok ? 'cargado' : 'vacio'} />
    </label>
  )
}

// ─── El panel ────────────────────────────────────────────────────────────────

export default function PanelDocumentos({ variante: v, planilla, soporte, factura, numero }: Props) {
  const conFactura = !!factura
  const { activo, enlazar } = useLetrero()

  // Cuatro unidades: planilla 1 · número 2 · soporte 1. Con factura son cinco; en una tarjeta estrecha no caben en
  // fila y el número baja a una segunda fila a todo el ancho.
  const columnas = conFactura ? 'grid-cols-3 @md:grid-cols-5' : 'grid-cols-4'
  const spanNumero = conFactura ? 'col-span-3 order-last @md:order-none @md:col-span-2' : 'col-span-2'

  // La variante segmentada es UN solo campo dividido en celdas; las otras, botones sueltos con un hueco.
  const contenedor = v === 'segmentada'
    ? (conFactura
      ? `grid gap-2 ${columnas} @md:gap-0 @md:rounded-xl @md:border @md:border-gray-200 @md:bg-gray-50`
      : `grid ${columnas} rounded-xl border border-gray-200 bg-gray-50`)
    : `grid gap-2 ${columnas}`

  /** Línea divisoria y esquinas de cada celda en la variante segmentada. */
  const celda = (primera: boolean, ultima: boolean): string => {
    if (v !== 'segmentada') return ''
    if (conFactura) {
      return `rounded-xl border border-gray-200 bg-gray-50 @md:rounded-none @md:border-0 ${primera ? '@md:rounded-l-xl' : '@md:border-l'} ${ultima ? '@md:rounded-r-xl' : ''}`
    }
    return `${primera ? 'rounded-l-xl' : 'border-l border-gray-200'} ${ultima ? 'rounded-r-xl' : ''}`
  }

  const docs = [
    ...(factura ? [{ d: factura, alinear: 'izquierda' as const }] : []),
    { d: planilla, alinear: 'izquierda' as const },
  ]
  const total = docs.length + 2
  // Posición de cada celda en el orden de pantalla: factura?, planilla, número, soporte.
  let i = 0
  const siguiente = () => { const p = i++; return celda(p === 0, p === total - 1) }

  return (
    <div className="@container relative">
      <div className={contenedor}>
        {factura && <TileDocumento v={v} d={factura} conFactura alinear="izquierda" enlazar={enlazar} claseCelda={siguiente()} />}
        <TileDocumento v={v} d={planilla} conFactura={conFactura} alinear="izquierda" enlazar={enlazar} claseCelda={siguiente()} />
        <TileNumero v={v} n={numero} conFactura={conFactura} enlazar={enlazar} claseCelda={`${spanNumero} ${siguiente()}`} />
        <TileDocumento v={v} d={soporte} conFactura={conFactura} alinear="derecha" enlazar={enlazar} claseCelda={siguiente()} />
      </div>

      {numero.error && <p className="mt-1.5 text-xs text-red-600">{numero.error}</p>}

      {activo && (
        <div role="tooltip" className="absolute inset-x-0 top-full z-20 mt-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100 shadow-lg">
          {activo}
        </div>
      )}
    </div>
  )
}
