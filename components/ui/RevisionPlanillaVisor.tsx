'use client'

/**
 * components/ui/RevisionPlanillaVisor.tsx — Revisar la planilla SIN salir de la pantalla.
 *
 * Antes: abrir la planilla en una pestaña nueva, leer el número, el mes y el IBC, volver, y confirmar cada dato en su
 * propio modal. Ahora el documento y los tres datos están lado a lado (en el teléfono, uno sobre otro):
 *
 *   · A un lado, el PDF (con la contraseña probada sola, si la trae) y, resaltados encima, los datos que el sistema
 *     reconoce en él.
 *   · Al otro, el cotejo: por cada dato, lo que dice el sistema, lo que dice la planilla y la acción que corresponde
 *     —confirmar, cambiar a lo que dice el documento, o elegir otro—.
 *   · Abajo, la decisión: «Todo coincide · Aprobar» o Devolver, con el motivo a un toque.
 *
 * La lectura (`lib/lectura-planilla.ts`) COMPARA, no decide: cuando no encuentra el dato, o el documento es una imagen,
 * lo dice y deja la comparación a quien revisa. Cambiar el mes o el IBC, aprobar y devolver son los mismos manejadores
 * del panel de revisión: aquí solo cambia la forma de llegar a ellos.
 *
 * Se monta en un portal para no heredar el recorte (`overflow-hidden`) del desplegable donde vive el panel.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DialogoBase, DialogoMes, nombreMes } from '@/components/ui/DialogosRevision'
import Icono from '@/components/ui/Icono'
import PaginasPdf, { type EstadoPdf, type Marca } from '@/components/ui/PaginasPdf'
import type { DatoBase, DatoMes, DecisionRevision } from '@/components/ui/PanelRevisionPlanilla'
import { leerPlanilla, type Hallazgo, type Lectura } from '@/lib/lectura-planilla'
import { Iconos, type LucideIcon } from '@/lib/iconos'
import { MARCA, MARCA_CLARA } from '@/lib/marca'

export interface DocumentoVisor {
  id: 'planilla' | 'soporte'
  etiqueta: string
  icono: LucideIcon
  /** Dirección ya firmada; null si no está subido. */
  url: string | null
}

interface Props {
  titulo: string
  subtitulo?: string
  planilla: DocumentoVisor
  soporte: DocumentoVisor
  inicial: DocumentoVisor['id']
  /** Contraseñas a probar si el PDF viene cifrado (la cédula del contratista). */
  claves: string[]
  numero: string | null
  mes: DatoMes
  base: DatoBase
  decision: DecisionRevision
  onCerrar: () => void
}

const USABLES = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
const CAPA_DIALOGOS = 'z-[90]'
const pesos = (n: number) => `$ ${n.toLocaleString('es-CO')}`

const BOTON = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1'
const BOTON_SECUNDARIO = `${BOTON} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`

/** Frases para devolver con un toque. Se suman al motivo que ya se haya escrito. */
const MOTIVOS = [
  'El número de planilla no coincide con el del documento.',
  'La planilla es de un mes distinto al que corresponde.',
  'El IBC de la planilla no coincide con el declarado.',
  'El documento no se ve bien o no es una planilla.',
]

type Tono = 'bien' | 'aviso' | 'neutro'

function FilaCotejo({
  etiqueta, sistema, estado, mensaje, tono, onVer, children,
}: {
  etiqueta: string
  sistema: ReactNode
  estado: Hallazgo['veredicto'] | 'leyendo'
  mensaje: string
  tono: Tono
  /** Llevar el documento hasta el dato; ausente si no hay nada que resaltar. */
  onVer?: () => void
  children?: ReactNode
}) {
  const color = tono === 'bien' ? 'border-emerald-200 bg-emerald-50/50' : tono === 'aviso' ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-gray-50'
  const glifo = estado === 'coincide' ? Iconos.estado.aprobado : estado === 'distinto' ? Iconos.estado.advertencia : Iconos.estado.pendiente
  const colorGlifo = estado === 'coincide' ? 'text-emerald-600' : estado === 'distinto' ? 'text-amber-600' : 'text-gray-400'
  return (
    <div className={`rounded-xl border p-2.5 sm:p-3 ${color}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 ${colorGlifo}`}><Icono glifo={glifo} tamano="md" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500">{etiqueta}</p>
          <p className="text-sm font-semibold text-gray-900">{sistema}</p>
          <p className={`mt-0.5 text-xs leading-snug ${tono === 'aviso' ? 'text-amber-800' : 'text-gray-600'}`} aria-live="polite">{mensaje}</p>
        </div>
        {onVer && (
          <button
            type="button"
            onClick={onVer}
            aria-label={`Ver ${etiqueta.toLowerCase()} en el documento`}
            title="Ver en el documento"
            className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-white hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <Icono glifo={Iconos.accion.buscar} tamano="sm" />
          </button>
        )}
      </div>
      {children && <div className="mt-2 flex flex-wrap gap-2 pl-9">{children}</div>}
    </div>
  )
}

export default function RevisionPlanillaVisor({
  titulo, subtitulo, planilla, soporte, inicial, claves, numero, mes, base, decision, onCerrar,
}: Props) {
  const [pestana, setPestana] = useState<DocumentoVisor['id']>(inicial)
  const [textoPlanilla, setTextoPlanilla] = useState<string[] | null>(null)
  // Si la planilla no se pudo ni abrir (protegida con una clave que no es la cédula, o dañada), el cotejo lo dice así y no «es una imagen».
  const [noAbrio, setNoAbrio] = useState<EstadoPdf | null>(null)
  const [activa, setActiva] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<'mes' | 'base' | null>(null)
  const [devolviendo, setDevolviendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  const documento = pestana === 'planilla' ? planilla : soporte

  // La lectura se rehace sola cuando cambia lo declarado (p. ej. al cambiar la base): el cotejo siempre es con lo vigente.
  const lectura: Lectura | null = useMemo(() => {
    if (!planilla.url) return leerPlanilla([], { numero, mes: mes.valor, base: base.valor, piso: base.piso })
    return textoPlanilla ? leerPlanilla(textoPlanilla, { numero, mes: mes.valor, base: base.valor, piso: base.piso }) : null
  }, [planilla.url, textoPlanilla, numero, mes.valor, base.valor, base.piso])

  // Lo que se resalta sobre el documento: los tres datos reconocidos, en verde si coinciden y en ámbar si difieren.
  const marcas: Marca[] = useMemo(() => {
    if (!lectura?.hayTexto || pestana !== 'planilla') return []
    const lista: Marca[] = []
    for (const [id, h] of [['numero', lectura.numero], ['mes', lectura.mes], ['ibc', lectura.ibc]] as const) {
      if (h.fragmento && h.veredicto !== 'sin_comprobar') lista.push({ id, fragmento: h.fragmento, tono: h.veredicto === 'coincide' ? 'ok' : 'aviso' })
    }
    return lista
  }, [lectura, pestana])

  // Foco: entra al abrir y vuelve a donde estaba al cerrar; el fondo no se desplaza.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previo; antes?.focus?.() }
  }, [])

  // Escape cierra, salvo que haya un modal encima o se esté guardando.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialogo && !trabajando && !decision.decidiendo) onCerrar()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [dialogo, trabajando, decision.decidiendo, onCerrar])

  const atraparTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current || dialogo) return
    const usables = [...panel.current.querySelectorAll<HTMLElement>(USABLES)].filter(el => el.offsetParent !== null)
    if (usables.length === 0) return
    const primero = usables[0]
    const ultimo = usables[usables.length - 1]
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel.current)) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
  }

  const ver = (id: string) => {
    setPestana('planilla')
    // Un clic repetido sobre la misma fila debe volver a llevar la vista: se limpia y se vuelve a poner.
    setActiva(null)
    requestAnimationFrame(() => setActiva(id))
  }

  // ── Los tres datos ──
  const leyendo = !!planilla.url && lectura === null
  const sinTexto = lectura !== null && !lectura.hayTexto
  const estado = (h: Hallazgo | undefined): Hallazgo['veredicto'] | 'leyendo' => (leyendo || !h ? 'leyendo' : h.veredicto)
  const ayudaSinLeer = noAbrio ? 'No se pudo abrir la planilla para leerla: compáralo tú.' : sinTexto ? 'El documento es una imagen o no tiene texto: compáralo tú.' : 'No lo encuentro en el documento: compáralo tú.'

  const hNumero = lectura?.numero
  const hMes = lectura?.mes
  const hIbc = lectura?.ibc

  const mesPlanilla = hMes?.mes ? nombreMes(hMes.mes) : null
  const puedeCambiarMes = mes.puedeCambiar && !mes.guardando
  const puedeCambiarBase = base.puedeCambiar && !base.guardando

  const todoCoincide = !!lectura?.hayTexto && hNumero?.veredicto === 'coincide' && hMes?.veredicto === 'coincide' && hIbc?.veredicto === 'coincide'
  const hayDiferencias = hMes?.veredicto === 'distinto' || hIbc?.veredicto === 'distinto'

  async function aprobar() {
    setTrabajando(true)
    // Si el mes que muestra el documento es el del sistema y aún no está confirmado, aprobar lo confirma: es lo que el
    // revisor acaba de comprobar con sus ojos. Si difiere, no se decide por él.
    if (hMes?.veredicto === 'coincide' && !mes.confirmado && puedeCambiarMes) await mes.onCambiar(mes.valor)
    const ok = await decision.onAprobar()
    setTrabajando(false)
    if (ok !== false) onCerrar()
  }

  async function devolver() {
    if (!motivo.trim()) return
    setTrabajando(true)
    const ok = await decision.onDevolver(motivo.trim())
    setTrabajando(false)
    if (ok !== false) onCerrar()
  }

  const ocupado = trabajando || decision.decidiendo

  return createPortal(
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Revisar planilla: ${titulo}`}
      onKeyDown={atraparTab}
      className="fixed inset-0 z-[70] flex flex-col bg-gray-100 outline-none"
    >
      {/* Barra superior: qué se revisa, qué documento se ve y cómo salir */}
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 sm:gap-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{titulo}</p>
          {subtitulo && <p className="truncate text-xs text-gray-500">{subtitulo}</p>}
        </div>
        <div role="tablist" aria-label="Documento" className="flex shrink-0 rounded-lg bg-gray-100 p-0.5">
          {[planilla, soporte].map(d => (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={pestana === d.id}
              disabled={!d.url}
              onClick={() => { setPestana(d.id); setActiva(null) }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-40 ${
                pestana === d.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icono glifo={d.icono} tamano="sm" />
              <span className="hidden sm:inline">{d.etiqueta}</span>
              <span className="sm:hidden">{d.id === 'planilla' ? 'Planilla' : 'Soporte'}</span>
            </button>
          ))}
        </div>
        {documento.url && (
          <a
            href={documento.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir en una pestaña nueva"
            aria-label="Abrir el documento en una pestaña nueva"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <Icono glifo={Iconos.accion.abrirFuera} tamano="sm" />
          </a>
        )}
        <button
          type="button"
          onClick={onCerrar}
          disabled={ocupado}
          aria-label="Cerrar la revisión"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-40"
        >
          <Icono glifo={Iconos.accion.cerrar} tamano="md" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* El documento */}
        <section aria-label="Documento" className="min-h-[22dvh] flex-1 overflow-y-auto overscroll-contain bg-gray-200 p-2 sm:p-4">
          {/* Los dos documentos quedan montados y solo se oculta el que no se ve: así el texto de la planilla se lee
              aunque se abra primero el soporte, y cambiar de pestaña no vuelve a descargar nada. */}
          {planilla.url && (
            <div hidden={pestana !== 'planilla'}>
              <PaginasPdf
                url={planilla.url}
                claves={claves}
                marcas={marcas}
                activa={pestana === 'planilla' ? activa : null}
                onTexto={setTextoPlanilla}
                onEstado={e => { setNoAbrio(e === 'error' || e === 'protegido' ? e : null); if (e === 'error' || e === 'protegido') setTextoPlanilla([]) }}
              />
            </div>
          )}
          {soporte.url && (
            <div hidden={pestana !== 'soporte'}>
              <PaginasPdf url={soporte.url} claves={claves} />
            </div>
          )}
          {!documento.url && <p className="grid h-full place-items-center text-sm text-gray-500">Este documento no se ha subido.</p>}
        </section>

        {/* El cotejo y la decisión */}
        <aside
          aria-label="Cotejo de la planilla"
          className="flex max-h-[60dvh] shrink-0 flex-col border-t border-gray-200 bg-white lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0"
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 sm:space-y-2.5 sm:p-4">
            <p className="hidden text-xs leading-snug text-gray-500 lg:block">
              {pestana === 'soporte' ? 'Estás viendo el soporte del pago. Los datos de abajo se comparan con la planilla.' : 'Esto es lo que dice el sistema, comparado con lo que dice la planilla.'}
            </p>

            <FilaCotejo
              etiqueta="N.° de planilla"
              sistema={numero?.trim() || 'Sin número'}
              estado={estado(hNumero)}
              tono={hNumero?.veredicto === 'coincide' ? 'bien' : 'neutro'}
              mensaje={leyendo ? 'Leyendo el documento…' : hNumero?.veredicto === 'coincide' ? 'Aparece en la planilla.' : numero?.trim() ? ayudaSinLeer : 'El contratista no ha escrito el número.'}
              onVer={hNumero?.veredicto === 'coincide' ? () => ver('numero') : undefined}
            />

            <FilaCotejo
              etiqueta="Mes de cotización"
              sistema={<>{nombreMes(mes.valor) || '—'}{mes.confirmado && <span className="ml-2 text-xs font-medium text-emerald-700">Confirmado</span>}</>}
              estado={estado(hMes)}
              tono={hMes?.veredicto === 'coincide' ? 'bien' : hMes?.veredicto === 'distinto' ? 'aviso' : 'neutro'}
              mensaje={
                leyendo ? 'Leyendo el documento…'
                  : hMes?.veredicto === 'coincide' ? `La planilla dice ${mesPlanilla}.`
                    : hMes?.veredicto === 'distinto' ? `La planilla dice ${mesPlanilla}, no ${nombreMes(mes.valor)}. Es un pago por mes vencido: válido si es el correcto.`
                      : ayudaSinLeer
              }
              onVer={hMes?.veredicto && hMes.veredicto !== 'sin_comprobar' ? () => ver('mes') : undefined}
            >
              {hMes?.veredicto === 'distinto' && hMes.mes && puedeCambiarMes && (
                <button type="button" disabled={ocupado} onClick={() => mes.onCambiar(hMes.mes!)} className={`${BOTON} text-white`} style={{ backgroundColor: MARCA }}>
                  Confirmar {mesPlanilla}
                </button>
              )}
              {hMes?.veredicto === 'coincide' && !mes.confirmado && puedeCambiarMes && (
                <button type="button" disabled={ocupado} onClick={() => mes.onCambiar(mes.valor)} className={`${BOTON} text-white`} style={{ backgroundColor: MARCA }}>
                  Confirmar {nombreMes(mes.valor)}
                </button>
              )}
              {puedeCambiarMes && (
                <button type="button" disabled={ocupado} onClick={() => setDialogo('mes')} className={BOTON_SECUNDARIO}>
                  <Icono glifo={Iconos.accion.editar} tamano="sm" /> {hMes?.veredicto === 'distinto' || hMes?.veredicto === 'coincide' ? 'Otro mes' : 'Elegir mes'}
                </button>
              )}
              {!mes.puedeCambiar && <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Icono glifo={Iconos.estado.bloqueado} tamano="sm" /> No puedes cambiarlo ahora.</span>}
            </FilaCotejo>

            <FilaCotejo
              etiqueta="Base de cotización (IBC)"
              sistema={<>{pesos(base.valor)}<span className="ml-2 text-xs font-medium text-gray-500">{base.personalizada ? 'Personalizada' : 'Por defecto'}</span></>}
              estado={estado(hIbc)}
              tono={hIbc?.veredicto === 'coincide' ? 'bien' : hIbc?.veredicto === 'distinto' ? 'aviso' : 'neutro'}
              mensaje={
                leyendo ? 'Leyendo el documento…'
                  : hIbc?.veredicto === 'coincide' ? 'Coincide con la planilla.'
                    : hIbc?.veredicto === 'distinto' && hIbc.valor != null ? `La planilla muestra ${pesos(hIbc.valor)}.`
                      : ayudaSinLeer
              }
              onVer={hIbc?.veredicto && hIbc.veredicto !== 'sin_comprobar' ? () => ver('ibc') : undefined}
            >
              {hIbc?.veredicto === 'distinto' && hIbc.valor != null && puedeCambiarBase && (
                <button type="button" disabled={ocupado} onClick={() => base.onGuardar(hIbc.valor!)} className={`${BOTON} text-white`} style={{ backgroundColor: MARCA }}>
                  Usar {pesos(hIbc.valor)}
                </button>
              )}
              {puedeCambiarBase && (
                <button type="button" disabled={ocupado} onClick={() => setDialogo('base')} className={BOTON_SECUNDARIO}>
                  <Icono glifo={Iconos.accion.editar} tamano="sm" /> Otro valor
                </button>
              )}
              {!base.puedeCambiar && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Icono glifo={Iconos.estado.bloqueado} tamano="sm" /> {base.motivoBloqueo ?? 'No puedes cambiarla ahora.'}
                </span>
              )}
            </FilaCotejo>

            <p className="hidden pt-1 text-[11px] leading-snug text-gray-400 lg:block">
              La lectura es una ayuda: la hace tu navegador y el documento no sale del sistema. La decisión es tuya.
            </p>
          </div>

          {/* La decisión, siempre a la vista */}
          {decision.puedeDecidir && (
            <div className="shrink-0 space-y-2 border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
              {decision.estado === 'rechazada' && decision.motivoAnterior && (
                <p className="text-xs text-red-600">Devuelta antes: {decision.motivoAnterior}</p>
              )}
              {hayDiferencias && !devolviendo && (
                <p className="text-xs leading-snug text-amber-800">Hay datos distintos al documento. Corrígelos o aprueba si es lo correcto.</p>
              )}
              {devolviendo ? (
                <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3">
                  <label htmlFor="motivo-devolucion-visor" className="text-xs font-semibold text-red-700">Motivo de la devolución</label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOTIVOS.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMotivo(v => (v.includes(m) ? v : `${v.trim()}${v.trim() ? ' ' : ''}${m}`))}
                        className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="motivo-devolucion-visor"
                    autoFocus
                    rows={3}
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Explica al contratista qué debe corregir…"
                    className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-red-300"
                  />
                  <div className="flex gap-2">
                    <button type="button" disabled={ocupado || !motivo.trim()} onClick={devolver} className="h-10 flex-1 rounded-xl bg-red-600 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                      {ocupado ? 'Devolviendo…' : 'Confirmar devolución'}
                    </button>
                    <button type="button" onClick={() => { setDevolviendo(false); setMotivo('') }} className="h-10 rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-600 transition-colors hover:bg-gray-50">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => setDevolviendo(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                  >
                    <Icono glifo={Iconos.accion.devolver} tamano="sm" /> Devolver
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={aprobar}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = MARCA_CLARA }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = MARCA }}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
                    style={{ backgroundColor: MARCA }}
                  >
                    <Icono glifo={Iconos.estado.aprobado} tamano="sm" />
                    {ocupado ? 'Aprobando…' : todoCoincide ? 'Todo coincide · Aprobar' : 'Aprobar'}
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {dialogo === 'mes' && (
        <DialogoMes
          capa={CAPA_DIALOGOS}
          valor={mes.valor}
          confirmado={mes.confirmado}
          opciones={mes.opciones}
          mesDelInforme={mes.mesDelInforme}
          anio={mes.anio}
          guardando={mes.guardando}
          onConfirmar={m => { setDialogo(null); void mes.onCambiar(m) }}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'base' && (
        <DialogoBase
          capa={CAPA_DIALOGOS}
          valor={base.valor}
          porDefecto={base.porDefecto}
          personalizada={base.personalizada}
          explicacion={base.explicacion}
          piso={base.piso}
          guardando={base.guardando}
          onGuardar={v => { setDialogo(null); base.onGuardar(v) }}
          onRestablecer={() => { setDialogo(null); base.onRestablecer() }}
          onCerrar={() => setDialogo(null)}
        />
      )}
    </div>,
    document.body,
  )
}
