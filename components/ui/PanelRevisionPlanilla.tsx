'use client'

/**
 * components/ui/PanelRevisionPlanilla.tsx — El apartado de «Planilla de Seguridad Social» tal como lo ve quien REVISA
 * (supervisor, asesor, administrador), con el mismo lenguaje de fichas que el del contratista (`PanelDocumentos`).
 *
 * Lo que el revisor tiene que comprobar, en tres filas:
 *
 *   1. Los documentos —planilla y soporte del pago— y el número de planilla (de solo lectura, doble ancho). Un clic
 *      abre el documento.
 *   2. Lo que dice la planilla y hay que verificar: el MES DE COTIZACIÓN y la BASE DE COTIZACIÓN (IBC). Cada ficha
 *      muestra su valor y su estado; un clic abre el selector del mes o el editor de la base. Un candado en vez de un
 *      lápiz dice que ese dato no se puede cambiar ahora, y el letrero explica por qué.
 *   3. La decisión: Devolver o Aprobar. Devolver pide el motivo, que le llega al contratista.
 *
 * Arriba, una línea con el estado de la revisión y, solo si hay motivo, la franja de alerta (mes vencido, planilla
 * repetida), siempre con su mensaje completo visible.
 *
 * ── Convivencia del letrero con los selectores ───────────────────────────
 *
 * Igual que en el panel del contratista: el letrero «qué es» sale al pasar el cursor, con retardo, y NUNCA con un
 * selector abierto (`lib/panel-documentos.ts`). Cada fila tiene su propio letrero, justo debajo de ella.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import Icono from '@/components/ui/Icono'
import { ENFOQUE, useLetrero } from '@/components/ui/PanelDocumentos'
import { Iconos, type LucideIcon } from '@/lib/iconos'
import { MARCA, MARCA_CLARA } from '@/lib/marca'

export interface DocumentoRevision {
  icono: LucideIcon
  etiqueta: string
  /** Qué es el documento: el letrero que sale al pasar el cursor. */
  ayuda: string
  /** Dirección (ya firmada) para abrirlo; null si no está subido. */
  url: string | null
}

export interface DatoMes {
  ayuda: string
  /** El mes de cotización vigente. */
  valor: string
  /** Lo confirmó un revisor (no es solo la sugerencia del sistema). */
  confirmado: boolean
  /** Los meses entre los que se puede elegir. */
  opciones: string[]
  puedeCambiar: boolean
  guardando: boolean
  onCambiar: (mes: string) => void
}

export interface DatoBase {
  ayuda: string
  valor: number
  /** El valor que se aplica si nadie lo cambia (el que calcula el acta). */
  porDefecto: number
  personalizada: boolean
  puedeCambiar: boolean
  /** Por qué no se puede cambiar, para el letrero del candado. */
  motivoBloqueo: string | null
  guardando: boolean
  onGuardar: (valor: number) => void
  onRestablecer: () => void
}

export interface AlertaRevision {
  nivel: 'roja' | 'naranja'
  titulo: string
  mensaje: string
}

export interface DecisionRevision {
  estado: 'pendiente' | 'aprobada' | 'rechazada' | null
  /** El motivo con el que se devolvió la última vez. */
  motivoAnterior: string | null
  /** Hay planilla y quien mira puede decidir. */
  puedeDecidir: boolean
  decidiendo: boolean
  onAprobar: () => void
  onDevolver: (motivo: string) => void
}

interface Props {
  planilla: DocumentoRevision
  soporte: DocumentoRevision
  numero: { ayuda: string; valor: string | null }
  mes: DatoMes
  base: DatoBase
  alerta: AlertaRevision | null
  decision: DecisionRevision
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

/** El mismo hueco de arriba (`pt-7`) que las fichas del contratista: ahí va el icono que dice qué se puede hacer. */
const FICHA =
  `relative flex h-full min-h-[104px] w-full flex-col items-center justify-center gap-1 rounded-xl border px-2 pb-3 pt-7 text-center transition-colors ${ENFOQUE}`

const EN_ESPERA = 'border-gray-200 bg-gray-50'
const ACTIVA = 'border-gray-200 bg-gray-50 hover:bg-gray-100'
const FALTA = 'border-dashed border-amber-300 bg-amber-50/40'

/** Cierra al hacer clic fuera o con Escape. */
function useCierre(abierto: boolean, cerrar: () => void, raiz: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: globalThis.PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) cerrar()
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto, cerrar, raiz])
}

/** La esquina de arriba a la derecha: lo que se puede hacer con la ficha. */
function Esquina({ glifo, className = '' }: { glifo: LucideIcon; className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute right-2 top-2 text-gray-400 ${className}`}>
      <Icono glifo={glifo} tamano="sm" />
    </span>
  )
}

function FichaDocumento({ d, enlazar }: { d: DocumentoRevision; enlazar: (texto: string) => object }) {
  const hay = !!d.url
  const contenido = (
    <>
      <Icono glifo={d.icono} tamano="md" className={hay ? 'text-emerald-700' : 'text-amber-600'} />
      <span className="text-xs font-medium leading-tight text-gray-800">{d.etiqueta}</span>
      <span className={`flex h-4 items-center text-[11px] leading-none ${hay ? '' : 'text-amber-700'}`}>
        {hay ? <Icono glifo={Iconos.estado.aprobado} tamano="sm" className="text-emerald-600" /> : 'Falta'}
      </span>
    </>
  )
  return (
    <div className="relative" {...enlazar(d.ayuda)}>
      {hay ? (
        <a href={d.url!} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${d.etiqueta}`} className={`${FICHA} ${ACTIVA}`}>
          {contenido}
          <Esquina glifo={Iconos.accion.abrirFuera} />
        </a>
      ) : (
        <div aria-label={`${d.etiqueta}: falta`} className={`${FICHA} ${FALTA}`}>{contenido}</div>
      )}
    </div>
  )
}

function FichaNumero({ n, enlazar }: { n: Props['numero']; enlazar: (texto: string) => object }) {
  const hay = !!n.valor?.trim()
  return (
    <div className="relative col-span-2" {...enlazar(n.ayuda)}>
      <div className={`${FICHA} ${hay ? EN_ESPERA : FALTA}`} aria-label={hay ? `Número de planilla ${n.valor}` : 'Número de planilla: falta'}>
        <Icono glifo={Iconos.dominio.numero} tamano="md" className={hay ? 'text-gray-500' : 'text-amber-600'} />
        <span className="text-xs font-medium leading-tight text-gray-800">N.° de planilla</span>
        {hay
          ? <span className="text-sm font-semibold tracking-wide text-gray-900">{n.valor}</span>
          : <span className="flex h-5 items-center text-[11px] text-amber-700">Sin número</span>}
      </div>
    </div>
  )
}

/** Una ficha de dato que se verifica y, si se puede, se cambia: abre su propio selector o editor. */
function FichaDato({
  icono, etiqueta, valor, estado, puedeCambiar, abierto, onAbrir, children,
}: {
  icono: LucideIcon
  etiqueta: string
  valor: string
  /** La línea bajo el valor: su estado. */
  estado: React.ReactNode
  puedeCambiar: boolean
  abierto: boolean
  onAbrir: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <button
        type="button"
        onClick={puedeCambiar ? onAbrir : undefined}
        aria-haspopup={puedeCambiar ? 'dialog' : undefined}
        aria-expanded={puedeCambiar ? abierto : undefined}
        aria-disabled={!puedeCambiar}
        aria-label={`${etiqueta}: ${valor}${puedeCambiar ? '. Cambiar' : ''}`}
        className={`${FICHA} ${puedeCambiar ? ACTIVA : `${EN_ESPERA} cursor-default`}`}
      >
        <Icono glifo={icono} tamano="md" className="text-gray-500" />
        <span className="text-xs font-medium leading-tight text-gray-800">{etiqueta}</span>
        <span className="text-sm font-semibold leading-tight text-gray-900">{valor}</span>
        <span className="flex h-4 items-center gap-1 text-[11px] leading-none text-gray-500">{estado}</span>
        <Esquina glifo={puedeCambiar ? Iconos.accion.editar : Iconos.estado.bloqueado} />
      </button>
      {abierto && children}
    </>
  )
}

const POPOVER = 'absolute top-full z-30 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg'

// ─── El panel ────────────────────────────────────────────────────────────────

export default function PanelRevisionPlanilla({ planilla, soporte, numero, mes, base, alerta, decision }: Props) {
  // Cada fila, su letrero. Un selector abierto (fila de datos) calla también el letrero de la fila de documentos.
  const docs = useLetrero()
  const datos = useLetrero()
  const hayAbierto = datos.menuAbierto !== null
  const letreroDocs = hayAbierto ? null : docs.letrero

  const cerrar = useCallback(() => datos.setMenuAbierto(null), [datos.setMenuAbierto]) // eslint-disable-line react-hooks/exhaustive-deps
  const raizMes = useRef<HTMLDivElement>(null)
  const raizBase = useRef<HTMLDivElement>(null)
  useCierre(datos.menuAbierto === 'mes', cerrar, raizMes)
  useCierre(datos.menuAbierto === 'base', cerrar, raizBase)

  // El editor de la base arranca con el valor vigente cada vez que se abre.
  const [borrador, setBorrador] = useState('')
  useEffect(() => { if (datos.menuAbierto === 'base') setBorrador(String(base.valor)) }, [datos.menuAbierto, base.valor])
  const borradorValido = /^\d+$/.test(borrador) && Number(borrador) > 0

  const [devolviendo, setDevolviendo] = useState(false)
  const [motivo, setMotivo] = useState('')

  const texto = {
    mes: mes.puedeCambiar ? mes.ayuda : `${mes.ayuda} Ahora no se puede cambiar.`,
    base: base.puedeCambiar ? base.ayuda : `${base.ayuda} ${base.motivoBloqueo ?? 'Ahora no se puede cambiar.'}`,
  }

  return (
    <div className="space-y-3">
      {/* El estado de la revisión, en una línea */}
      <p className={`flex flex-wrap items-center gap-1.5 text-xs ${
        decision.estado === 'aprobada' ? 'text-emerald-700' : decision.estado === 'rechazada' ? 'text-red-600' : 'text-gray-500'
      }`}>
        <Icono
          glifo={decision.estado === 'aprobada' ? Iconos.estado.aprobado : decision.estado === 'rechazada' ? Iconos.accion.devolver : Iconos.estado.pendiente}
          tamano="sm"
        />
        <span className="font-medium">
          {decision.estado === 'aprobada' ? 'Planilla aprobada' : decision.estado === 'rechazada' ? 'Planilla devuelta' : 'Pendiente de revisión'}
        </span>
        {decision.estado === 'rechazada' && decision.motivoAnterior && (
          <span className="text-gray-500">· {decision.motivoAnterior}</span>
        )}
      </p>

      {alerta && (
        <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
          alerta.nivel === 'roja' ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-orange-50'
        }`}>
          <Icono glifo={Iconos.estado.advertencia} tamano="sm" className={`mt-0.5 shrink-0 ${alerta.nivel === 'roja' ? 'text-red-600' : 'text-amber-600'}`} />
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${alerta.nivel === 'roja' ? 'text-red-700' : 'text-orange-700'}`}>{alerta.titulo}</p>
            <p className={`mt-0.5 text-[11px] leading-relaxed ${alerta.nivel === 'roja' ? 'text-red-600/90' : 'text-orange-700/80'}`}>{alerta.mensaje}</p>
          </div>
        </div>
      )}

      {/* 1 · Los documentos y el número */}
      <div className="@container relative">
        <div className="grid grid-cols-4 gap-2">
          <FichaDocumento d={planilla} enlazar={docs.enlazar} />
          <FichaDocumento d={soporte} enlazar={docs.enlazar} />
          <FichaNumero n={numero} enlazar={docs.enlazar} />
        </div>
        {letreroDocs && (
          <div role="tooltip" className="absolute inset-x-0 top-full z-20 mt-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100 shadow-lg">
            {letreroDocs}
          </div>
        )}
      </div>

      {/* 2 · Lo que dice la planilla y se verifica: el mes y la base de cotización */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-2">
          <div ref={raizMes} className="relative" {...datos.enlazar(texto.mes)}>
            <FichaDato
              icono={Iconos.dominio.periodo}
              etiqueta="Mes de cotización"
              valor={mes.valor || '—'}
              estado={mes.guardando ? 'Guardando…' : mes.confirmado
                ? <><Icono glifo={Iconos.estado.aprobado} tamano="sm" className="text-emerald-600" /> Confirmado</>
                : <><Icono glifo={Iconos.estado.pendiente} tamano="sm" /> Sin verificar</>}
              puedeCambiar={mes.puedeCambiar && !mes.guardando}
              abierto={datos.menuAbierto === 'mes'}
              onAbrir={() => datos.setMenuAbierto(datos.menuAbierto === 'mes' ? null : 'mes')}
            >
              <div role="listbox" aria-label="Mes de cotización" className={`${POPOVER} left-0 max-h-56 w-48 overflow-y-auto py-1`}>
                {mes.opciones.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={m === mes.valor}
                    onClick={() => { datos.setMenuAbierto(null); if (m !== mes.valor) mes.onCambiar(m) }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                  >
                    {m}
                    {m === mes.valor && <Icono glifo={Iconos.estado.ok} tamano="sm" className="text-emerald-600" />}
                  </button>
                ))}
              </div>
            </FichaDato>
          </div>

          <div ref={raizBase} className="relative" {...datos.enlazar(texto.base)}>
            <FichaDato
              icono={Iconos.dominio.valor}
              etiqueta="Base de cotización"
              valor={`$ ${base.valor.toLocaleString('es-CO')}`}
              estado={base.guardando ? 'Guardando…' : base.personalizada ? 'Personalizada' : 'Por defecto'}
              puedeCambiar={base.puedeCambiar && !base.guardando}
              abierto={datos.menuAbierto === 'base'}
              onAbrir={() => datos.setMenuAbierto(datos.menuAbierto === 'base' ? null : 'base')}
            >
              <div role="dialog" aria-label="Cambiar la base de cotización" className={`${POPOVER} right-0 w-60 space-y-2 p-3`}>
                <label htmlFor="base-cotizacion-revision" className="text-xs font-medium text-gray-700">Base de cotización</label>
                <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-gray-300">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    id="base-cotizacion-revision"
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && borradorValido) { datos.setMenuAbierto(null); base.onGuardar(Number(borrador)) }
                    }}
                    placeholder={base.porDefecto.toLocaleString('es-CO')}
                    className="h-9 w-full min-w-0 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-300"
                  />
                </div>
                {/* El importe con sus puntos: con siete cifras seguidas es fácil equivocarse. */}
                <p aria-live="polite" className="h-4 text-[11px] text-gray-500">
                  {borradorValido ? `$ ${Number(borrador).toLocaleString('es-CO')}` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!borradorValido}
                    onClick={() => { datos.setMenuAbierto(null); base.onGuardar(Number(borrador)) }}
                    className="h-8 rounded-lg px-3 text-xs font-medium text-white transition-colors disabled:opacity-40"
                    style={{ backgroundColor: MARCA }}
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => datos.setMenuAbierto(null)}
                    className="h-8 rounded-lg border border-gray-300 px-3 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
                {base.personalizada && (
                  <button
                    type="button"
                    onClick={() => { datos.setMenuAbierto(null); base.onRestablecer() }}
                    className="text-xs text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
                  >
                    Volver al valor por defecto ($ {base.porDefecto.toLocaleString('es-CO')})
                  </button>
                )}
              </div>
            </FichaDato>
          </div>
        </div>
        {datos.letrero && (
          <div role="tooltip" className="absolute inset-x-0 top-full z-20 mt-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-100 shadow-lg">
            {datos.letrero}
          </div>
        )}
      </div>

      {/* 3 · La decisión */}
      {decision.puedeDecidir && (
        devolviendo ? (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3">
            <label htmlFor="motivo-devolucion" className="text-xs font-semibold text-red-700">Motivo de la devolución</label>
            <textarea
              id="motivo-devolucion"
              autoFocus
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explica al contratista qué debe corregir…"
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-red-300"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={decision.decidiendo || !motivo.trim()}
                onClick={() => { decision.onDevolver(motivo.trim()); setDevolviendo(false); setMotivo('') }}
                className="h-10 flex-1 rounded-xl bg-red-600 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {decision.decidiendo ? 'Devolviendo…' : 'Confirmar devolución'}
              </button>
              <button
                type="button"
                onClick={() => { setDevolviendo(false); setMotivo('') }}
                className="h-10 rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={decision.decidiendo}
              onClick={() => setDevolviendo(true)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 ${ENFOQUE}`}
            >
              <Icono glifo={Iconos.accion.devolver} tamano="sm" /> Devolver
            </button>
            <button
              type="button"
              disabled={decision.decidiendo}
              onClick={decision.onAprobar}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = MARCA_CLARA }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = MARCA }}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 ${ENFOQUE}`}
              style={{ backgroundColor: MARCA }}
            >
              <Icono glifo={Iconos.estado.aprobado} tamano="sm" /> {decision.decidiendo ? 'Aprobando…' : 'Aprobar'}
            </button>
          </div>
        )
      )}
    </div>
  )
}
