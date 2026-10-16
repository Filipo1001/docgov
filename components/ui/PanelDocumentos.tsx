'use client'

/**
 * components/ui/PanelDocumentos.tsx — El apartado de documentos de seguridad social del formulario de envío del informe.
 *
 * Una sola fila de botones, uno al lado del otro: [factura, si aplica] · planilla · soporte del pago · N.° de planilla
 * (del doble de ancho, siempre el último). Poco texto: cada botón dice solo qué es. Lo que hay que saber de cada
 * documento sale en un letrero al pasar el cursor.
 *
 * ── Cómo se usa cada botón ───────────────────────────────────────────────
 *
 *   · Vacío (zona punteada): un clic abre el selector de archivos (PDF).
 *   · Con documento (ficha sólida con su marca verde): un clic lo abre.
 *   · Los tres puntitos, arriba a la derecha DENTRO del botón, están en todos los botones de documento para que ninguno
 *     se vea distinto de otro. Con archivo ofrecen Ver, Reemplazar y Eliminar; vacíos, solo «Subir PDF».
 *   · El número de planilla es un campo de texto: un clic lo enfoca.
 *
 * ── Que el letrero y el menú no choquen ──────────────────────────────────
 *
 * Los dos salen en la misma zona. El menú manda: con uno abierto no hay letrero, y tampoco mientras el cursor está sobre
 * los tres puntitos (la regla vive en `lib/panel-documentos.ts`, con sus pruebas). Antes el letrero se pintaba encima del
 * menú y tapaba «Eliminar». Un solo letrero para todo el panel, bajo la fila, para que quepa siempre, también en un
 * teléfono; con retardo, para que no parpadee cuando el cursor solo cruza la fila. En pantallas táctiles no hay cursor,
 * así que no hay letrero: el botón lleva su etiqueta.
 *
 * Responde al ancho de SU tarjeta (consultas de contenedor de Tailwind 4), no al de la ventana: con cinco piezas
 * (con factura) y la tarjeta estrecha, el número baja a una segunda fila a todo el ancho.
 */

import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'
import { RETARDO_LETRERO_MS, letreroVisible } from '@/lib/panel-documentos'

export type EstadoDoc = 'vacio' | 'cargado' | 'error' | 'subiendo'

export interface Documento {
  icono: LucideIcon
  etiqueta: string
  /** Qué es el documento: el letrero que sale al pasar el cursor. */
  ayuda: string
  estado: EstadoDoc
  /** Dirección (ya firmada) para ver el archivo cargado. */
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
  planilla: Documento
  soporte: Documento
  /** Solo para quien está obligado a facturar electrónicamente. */
  factura?: Documento | null
  numero: CampoNumero
}

// ─── El letrero y su convivencia con el menú ─────────────────────────────────

function useLetrero() {
  const [activo, setActivo] = useState<string | null>(null)
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null)
  const [sobreAcciones, setSobreAcciones] = useState(false)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelar = () => {
    if (espera.current) { clearTimeout(espera.current); espera.current = null }
  }
  useEffect(() => cancelar, [])

  const mostrar = (texto: string) => {
    cancelar()
    espera.current = setTimeout(() => setActivo(texto), RETARDO_LETRERO_MS)
  }
  const ocultar = () => { cancelar(); setActivo(null) }

  const enlazar = (texto: string) => ({
    // Solo el ratón: en una pantalla táctil «pasar por encima» se queda pegado después de tocar.
    onPointerEnter: (e: PointerEvent) => { if (e.pointerType === 'mouse') mostrar(texto) },
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType === 'mouse') ocultar() },
    // El teclado sí; pero no sobre un campo de texto (taparía lo que hay debajo mientras se escribe) ni sobre los tres
    // puntitos (ahí se va a pulsar, no a leer).
    onFocus: (e: FocusEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName !== 'INPUT' && !el.closest('[data-acciones]') && el.matches(':focus-visible')) setActivo(texto)
    },
    onBlur: ocultar,
  })

  return {
    letrero: letreroVisible({ activo, menuAbierto, sobreAcciones }),
    enlazar,
    menuAbierto,
    setMenuAbierto,
    setSobreAcciones,
  }
}

// ─── Los tres puntitos ───────────────────────────────────────────────────────

const ENFOQUE = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400'

const ITEM_MENU =
  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none'

function MenuPuntitos({
  etiqueta, urlVer, alinear, cargado, abierto, onCambiar, onSobre, onReemplazar, onEliminar,
}: {
  etiqueta: string
  urlVer?: string | null
  alinear: 'izquierda' | 'derecha'
  /** Con documento: Ver, Reemplazar, Eliminar. Sin él: solo Subir PDF. */
  cargado: boolean
  abierto: boolean
  onCambiar: (abierto: boolean) => void
  /** El cursor entra o sale de los tres puntitos y de su menú. */
  onSobre: (sobre: boolean) => void
  onReemplazar: () => void
  onEliminar: () => void
}) {
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: globalThis.PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) onCambiar(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCambiar(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto, onCambiar])

  return (
    <div
      ref={raiz}
      data-acciones
      // Con el menú abierto el contenedor sube de capa: el menú nunca queda por debajo de nada del panel.
      className={`absolute right-0.5 top-0.5 ${abierto ? 'z-30' : 'z-10'}`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onSobre(true) }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') onSobre(false) }}
    >
      <button
        type="button"
        aria-label={`Opciones de ${etiqueta}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => onCambiar(!abierto)}
        className={`grid h-7 w-7 place-items-center rounded-md text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-800 ${ENFOQUE}`}
      >
        <Icono glifo={Iconos.accion.mas} tamano="sm" />
      </button>
      {abierto && (
        <div
          role="menu"
          className={`absolute top-full mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
            alinear === 'derecha' ? 'right-0' : 'left-0'
          }`}
        >
          {cargado ? (
            <>
              {urlVer && (
                <a role="menuitem" href={urlVer} target="_blank" rel="noopener noreferrer" onClick={() => onCambiar(false)} className={ITEM_MENU}>
                  <Icono glifo={Iconos.accion.ver} tamano="sm" /> Ver
                </a>
              )}
              <button type="button" role="menuitem" onClick={() => { onCambiar(false); onReemplazar() }} className={ITEM_MENU}>
                <Icono glifo={Iconos.accion.recargar} tamano="sm" /> Reemplazar
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { onCambiar(false); onEliminar() }}
                className={`${ITEM_MENU} !text-red-600 hover:!bg-red-50`}
              >
                <Icono glifo={Iconos.accion.eliminar} tamano="sm" /> Eliminar
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" onClick={() => { onCambiar(false); onReemplazar() }} className={ITEM_MENU}>
              <Icono glifo={Iconos.documentos.subir} tamano="sm" /> Subir PDF
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Una ficha de documento ──────────────────────────────────────────────────

/**
 * El hueco de arriba (`pt-7`) es el de los tres puntitos: lo llevan TODAS las fichas, estén cargadas o no, para que el
 * alto no cambie al subir un archivo y los iconos queden alineados entre fichas.
 */
function claseFicha(e: EstadoDoc): string {
  return `flex h-full min-h-[104px] w-full flex-col items-center justify-center gap-1 rounded-xl border px-2 pb-3 pt-7 text-center transition-colors ${ENFOQUE} ${
    e === 'cargado' ? 'border-gray-200 bg-gray-50 hover:bg-gray-100'
      : e === 'error' ? 'border-dashed border-red-400 bg-red-50/50'
        : e === 'subiendo' ? 'border-gray-200 bg-gray-50'
          : 'border-dashed border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
  }`
}

/** El color del icono: solo significa estado. */
function colorIcono(e: EstadoDoc): string {
  return e === 'cargado' ? 'text-emerald-700' : e === 'error' ? 'text-red-600' : e === 'subiendo' ? 'text-gray-300' : 'text-gray-500'
}

function ContenidoFicha({ d }: { d: Documento }) {
  const cargado = d.estado === 'cargado'
  return (
    <>
      <Icono glifo={d.icono} tamano="md" className={colorIcono(d.estado)} />
      <span className={`text-xs font-medium leading-tight ${d.estado === 'error' ? 'text-red-600' : 'text-gray-800'}`}>{d.etiqueta}</span>
      <span className="flex h-4 items-center text-[11px] leading-none text-gray-400">
        {cargado
          ? <Icono glifo={Iconos.estado.aprobado} tamano="sm" className="text-emerald-600" />
          : d.estado === 'subiendo' ? 'Subiendo…' : 'Subir'}
      </span>
    </>
  )
}

function FichaDocumento({
  d, alinear, enlazar, menuAbierto, setMenuAbierto, setSobreAcciones,
}: {
  d: Documento
  alinear: 'izquierda' | 'derecha'
  enlazar: (texto: string) => object
  menuAbierto: string | null
  setMenuAbierto: (etiqueta: string | null) => void
  setSobreAcciones: (sobre: boolean) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const cargado = d.estado === 'cargado'
  const subiendo = d.estado === 'subiendo'
  const elegir = () => entrada.current?.click()
  const clase = claseFicha(d.estado)

  return (
    <div className="relative" {...enlazar(d.ayuda)}>
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
        <a href={d.urlVer} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${d.etiqueta}`} className={clase}>
          <ContenidoFicha d={d} />
        </a>
      ) : (
        <button
          type="button"
          onClick={elegir}
          disabled={subiendo || !d.onSubir}
          aria-label={`Subir ${d.etiqueta}`}
          className={`${clase} disabled:cursor-not-allowed`}
        >
          <ContenidoFicha d={d} />
        </button>
      )}

      {!subiendo && (d.onSubir || d.onQuitar) && (
        <MenuPuntitos
          etiqueta={d.etiqueta}
          urlVer={d.urlVer}
          alinear={alinear}
          cargado={cargado}
          abierto={menuAbierto === d.etiqueta}
          onCambiar={(abrir) => setMenuAbierto(abrir ? d.etiqueta : null)}
          onSobre={setSobreAcciones}
          onReemplazar={elegir}
          onEliminar={() => d.onQuitar?.()}
        />
      )}
    </div>
  )
}

// ─── La ficha del número (doble ancho) ───────────────────────────────────────

function FichaNumero({
  n, claseCelda, enlazar,
}: {
  n: CampoNumero
  claseCelda: string
  enlazar: (texto: string) => object
}) {
  const lleno = n.valor.trim().length > 0
  const error = !!n.error
  const ok = lleno && !error

  return (
    <label
      {...enlazar(n.ayuda)}
      className={`${claseCelda} flex min-h-[104px] cursor-text flex-col items-center justify-center gap-1 rounded-xl border bg-white px-3 pb-3 pt-7 text-center transition-colors focus-within:ring-2 focus-within:ring-gray-300 ${
        error ? 'border-red-400 bg-red-50/50' : 'border-gray-300 focus-within:border-gray-400'
      }`}
    >
      <Icono glifo={Iconos.dominio.numero} tamano="md" className={error ? 'text-red-600' : ok ? 'text-emerald-700' : 'text-gray-500'} />
      <span className={`flex items-center gap-1 text-xs font-medium leading-tight ${error ? 'text-red-600' : 'text-gray-800'}`}>
        {n.etiqueta}
        {ok && <Icono glifo={Iconos.estado.aprobado} tamano="sm" className="text-emerald-600" />}
      </span>
      <input
        value={n.valor}
        onChange={(e) => n.onCambio(e.target.value)}
        onBlur={n.onSalir}
        placeholder={n.placeholder ?? 'Ej. 6016087440'}
        inputMode="text"
        aria-label={n.etiqueta}
        aria-invalid={error}
        className="w-full min-w-0 bg-transparent text-center text-sm font-semibold tracking-wide text-gray-900 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-300"
      />
    </label>
  )
}

// ─── El panel ────────────────────────────────────────────────────────────────

export default function PanelDocumentos({ planilla, soporte, factura, numero }: Props) {
  const conFactura = !!factura
  const { letrero, enlazar, menuAbierto, setMenuAbierto, setSobreAcciones } = useLetrero()

  // Cuatro unidades: planilla 1 · soporte 1 · número 2. Con factura son cinco; en una tarjeta estrecha no caben en fila
  // y el número baja a una segunda fila a todo el ancho.
  const columnas = conFactura ? 'grid-cols-3 @md:grid-cols-5' : 'grid-cols-4'
  const spanNumero = conFactura ? 'col-span-3 @md:col-span-2' : 'col-span-2'

  const comun = { enlazar, menuAbierto, setMenuAbierto, setSobreAcciones }

  return (
    <div className="@container relative">
      <div className={`grid gap-2 ${columnas}`}>
        {factura && <FichaDocumento d={factura} alinear="izquierda" {...comun} />}
        <FichaDocumento d={planilla} alinear="izquierda" {...comun} />
        {/* El menú del soporte se abre hacia la izquierda cuando hay factura: en una tarjeta estrecha queda en la tercera
            columna, pegado al borde derecho. */}
        <FichaDocumento d={soporte} alinear={conFactura ? 'derecha' : 'izquierda'} {...comun} />
        <FichaNumero n={numero} claseCelda={spanNumero} enlazar={enlazar} />
      </div>

      {numero.error && <p className="mt-1.5 text-xs text-red-600">{numero.error}</p>}

      {letrero && (
        <div role="tooltip" className="absolute inset-x-0 top-full z-20 mt-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100 shadow-lg">
          {letrero}
        </div>
      )}
    </div>
  )
}
