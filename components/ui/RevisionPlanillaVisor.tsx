'use client'

/**
 * components/ui/RevisionPlanillaVisor.tsx — Revisar la planilla SIN salir de la pantalla.
 *
 * Antes: abrir la planilla en una pestaña nueva, leer el número, el mes y el IBC, volver, y confirmar cada dato en su
 * propio modal. Ahora el documento y los datos están lado a lado (en el teléfono, uno sobre otro):
 *
 *   · A un lado, el PDF (con la contraseña probada sola, si la trae) y, resaltados encima, los datos que el sistema
 *     reconoce en él.
 *   · Al otro, el cotejo: por cada dato, lo que dice el sistema, lo que dice la planilla y la acción que corresponde
 *     —confirmar, cambiar a lo que dice el documento, o elegir otro—.
 *   · Abajo, la decisión: «Todo coincide · Aprobar» o Devolver, con el motivo a un toque.
 *
 * La lectura (`lib/lectura-planilla.ts`) COMPARA, no decide: cuando no encuentra el dato, o el documento es una imagen,
 * está dañado o ni siquiera parece una planilla, lo dice —con un aviso arriba y «compáralo tú» en cada fila— y deja la
 * comparación a quien revisa. Cambiar el mes o el IBC, aprobar y devolver son los mismos manejadores del panel de
 * revisión: aquí solo cambia la forma de llegar a ellos.
 *
 * Se monta en un portal para no heredar el recorte (`overflow-hidden`) del desplegable donde vive el panel. Y va dentro
 * de un límite de error: si algo fallara al dibujarlo, no se lleva la pantalla del periodo; ofrece abrir el documento aparte.
 */

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DialogoBase, DialogoMes, nombreMes } from '@/components/ui/DialogosRevision'
import Icono from '@/components/ui/Icono'
import PaginasPdf, { identidadDelArchivo, type EstadoPdf, type Marca } from '@/components/ui/PaginasPdf'
import type { DatoBase, DatoMes, DecisionRevision } from '@/components/ui/PanelRevisionPlanilla'
import { leerPlanilla, type Esperado, type Hallazgo, type Lectura } from '@/lib/lectura-planilla'
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
  /** Cédula del contratista: si aparece en la planilla, es de él. */
  cedula?: string | null
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
  'La planilla es de otro año.',
  'El IBC de la planilla no coincide con el declarado.',
  'El documento no es una planilla de seguridad social.',
  'La planilla no es de este contratista.',
  'El documento no se ve bien: súbelo de nuevo.',
]
const MOTIVO_NO_ES_PLANILLA = 'El documento no es una planilla de seguridad social.'

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

/** Por qué no hay lectura, en una frase corta para cada fila. */
function sinLeer(lectura: Lectura | null, noAbrio: EstadoPdf | null, haySubida: boolean): string {
  if (!haySubida) return 'La planilla no se ha subido.'
  if (noAbrio) return 'No se pudo abrir la planilla: compáralo tú.'
  switch (lectura?.calidad) {
    case 'sin_texto': return 'El documento es una imagen: compáralo tú.'
    case 'ilegible': return 'El texto no se lee: compáralo tú.'
    case 'no_parece_planilla': return 'No parece una planilla: compáralo tú.'
    default: return 'No lo encuentro en el documento: compáralo tú.'
  }
}

/** El aviso de arriba cuando la lectura no puede ayudar, con su tono. */
function avisoDeCalidad(lectura: Lectura | null, noAbrio: EstadoPdf | null, haySubida: boolean): { tono: 'aviso' | 'alerta'; texto: string } | null {
  if (!haySubida) return { tono: 'aviso', texto: 'La planilla no se ha subido todavía.' }
  if (noAbrio) return { tono: 'aviso', texto: 'No se pudo abrir la planilla, así que no hay lectura automática. Compara los datos a ojo.' }
  switch (lectura?.calidad) {
    case 'sin_texto': return { tono: 'aviso', texto: 'Este documento es una imagen (un escaneo o una foto): no puedo leerlo. Compara los datos a ojo.' }
    case 'ilegible': return { tono: 'aviso', texto: 'El texto de este documento no se puede leer (¿la fuente está dañada?). Compara los datos a ojo.' }
    case 'no_parece_planilla': return { tono: 'alerta', texto: 'Este documento no parece una planilla de seguridad social. Revisa que sea el archivo correcto.' }
    default: return null
  }
}

function RevisionPlanillaVisor({
  titulo, subtitulo, planilla, soporte, inicial, claves, cedula, numero, mes, base, decision, onCerrar,
}: Props) {
  const [pestana, setPestana] = useState<DocumentoVisor['id']>(inicial)
  // El soporte no se descarga hasta que se mira por primera vez (puede pesar y el teléfono puede ir con datos).
  const [soporteVisto, setSoporteVisto] = useState(inicial === 'soporte')
  const [textoPlanilla, setTextoPlanilla] = useState<string[] | null>(null)
  // Si la planilla no se pudo ni abrir (cifrada con una clave desconocida, o dañada), el cotejo lo dice así.
  const [noAbrio, setNoAbrio] = useState<EstadoPdf | null>(null)
  const [activa, setActiva] = useState<string | null>(null)
  // Los datos que se pudieron señalar sobre el documento: «ver en el documento» solo se ofrece para esos.
  const [senalables, setSenalables] = useState<Set<string>>(new Set())
  const [dialogo, setDialogo] = useState<'mes' | 'base' | null>(null)
  const [devolviendo, setDevolviendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  const documento = pestana === 'planilla' ? planilla : soporte
  const haySubida = !!planilla.url

  // Si el contratista reemplaza la planilla mientras se revisa (el ARCHIVO cambia, no solo la firma), se empieza de nuevo.
  const archivoPlanilla = planilla.url ? identidadDelArchivo(planilla.url) : null
  useEffect(() => { setTextoPlanilla(null); setNoAbrio(null) }, [archivoPlanilla])

  // Lo declarado, con lo que hace falta para juzgar el año y la persona.
  const esperado: Esperado = useMemo(
    () => ({ numero, mes: mes.valor, anio: mes.anio, mesInforme: mes.mesDelInforme, base: base.valor, piso: base.piso, cedula }),
    [numero, mes.valor, mes.anio, mes.mesDelInforme, base.valor, base.piso, cedula],
  )

  // La lectura se rehace sola cuando cambia lo declarado (p. ej. al cambiar la base): el cotejo siempre es con lo vigente.
  const lectura: Lectura | null = useMemo(() => {
    if (!haySubida) return leerPlanilla([], esperado)
    if (!textoPlanilla) return null
    try { return leerPlanilla(textoPlanilla, esperado) } catch { return leerPlanilla([], esperado) }
  }, [haySubida, textoPlanilla, esperado])

  // Lo que se resalta sobre el documento: los datos reconocidos, en verde si coinciden y en ámbar si difieren.
  const marcas: Marca[] = useMemo(() => {
    if (!lectura?.hayTexto || pestana !== 'planilla') return []
    const lista: Marca[] = []
    for (const [id, h] of [['numero', lectura.numero], ['mes', lectura.mes], ['ibc', lectura.ibc], ['persona', lectura.persona]] as const) {
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

  const elegirPestana = (id: DocumentoVisor['id']) => {
    setPestana(id)
    if (id === 'soporte') setSoporteVisto(true)
    setActiva(null)
  }

  const ver = (id: string) => {
    setPestana('planilla')
    // Un clic repetido sobre la misma fila debe volver a llevar la vista: se limpia y se vuelve a poner.
    setActiva(null)
    requestAnimationFrame(() => setActiva(id))
  }

  // ── Los datos ──
  const leyendo = haySubida && lectura === null
  const estado = (h: Hallazgo | undefined): Hallazgo['veredicto'] | 'leyendo' => (leyendo || !h ? 'leyendo' : h.veredicto)
  const ayudaSinLeer = sinLeer(lectura, noAbrio, haySubida)
  const aviso = leyendo ? null : avisoDeCalidad(lectura, noAbrio, haySubida)

  const hNumero = lectura?.numero
  const hMes = lectura?.mes
  const hIbc = lectura?.ibc
  const hPersona = lectura?.persona

  const mesPlanilla = hMes?.mes ? nombreMes(hMes.mes) : null
  const otroAnio = !!hMes?.otroAnio
  const puedeCambiarMes = mes.puedeCambiar && !mes.guardando
  const puedeCambiarBase = base.puedeCambiar && !base.guardando

  const todoCoincide = !!lectura?.hayTexto && hNumero?.veredicto === 'coincide' && hMes?.veredicto === 'coincide' && hIbc?.veredicto === 'coincide'
  // La cédula del contratista aparecía en TODAS las planillas legibles (291 de 291): si falta, es una señal (planilla de otra
  // persona o un operador que la oculta), no un detalle.
  const personaFalta = !!cedula && lectura?.calidad === 'ok' && hPersona?.veredicto !== 'coincide'
  const hayDiferencias = hMes?.veredicto === 'distinto' || hIbc?.veredicto === 'distinto' || personaFalta
  const sinLectura = !!lectura && !lectura.hayTexto

  async function aprobar() {
    setTrabajando(true)
    try {
      // Si el mes que muestra el documento es el del sistema y aún no está confirmado, aprobar lo confirma: es lo que el
      // revisor acaba de comprobar con sus ojos. Si difiere, no se decide por él. Y si confirmarlo falla, no se aprueba.
      if (hMes?.veredicto === 'coincide' && !mes.confirmado && puedeCambiarMes) {
        if ((await mes.onCambiar(mes.valor)) === false) return
      }
      const ok = await decision.onAprobar()
      if (ok !== false) onCerrar()
    } finally {
      setTrabajando(false)
    }
  }

  async function devolver() {
    if (!motivo.trim()) return
    setTrabajando(true)
    try {
      const ok = await decision.onDevolver(motivo.trim())
      if (ok !== false) onCerrar()
    } finally {
      setTrabajando(false)
    }
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
              onClick={() => elegirPestana(d.id)}
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
                onMarcas={setSenalables}
                onEstado={e => {
                  setNoAbrio(e === 'error' || e === 'protegido' ? e : null)
                  // Sin poder abrirla no habrá texto: la lectura deja de «leer» y lo dice.
                  if (e === 'error' || e === 'protegido') setTextoPlanilla([])
                }}
              />
            </div>
          )}
          {soporte.url && soporteVisto && (
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

            {aviso && (
              <div
                role="alert"
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug ${
                  aviso.tono === 'alerta' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
              >
                <span className="mt-px shrink-0"><Icono glifo={Iconos.estado.advertencia} tamano="sm" /></span>
                <div className="min-w-0 flex-1">
                  <p>{aviso.texto}</p>
                  {lectura?.calidad === 'no_parece_planilla' && decision.puedeDecidir && !devolviendo && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => { setMotivo(MOTIVO_NO_ES_PLANILLA); setDevolviendo(true) }}
                      className="mt-1.5 font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    >
                      Devolver por esto
                    </button>
                  )}
                </div>
              </div>
            )}

            <FilaCotejo
              etiqueta="N.° de planilla"
              sistema={numero?.trim() || 'Sin número'}
              estado={estado(hNumero)}
              tono={hNumero?.veredicto === 'coincide' ? 'bien' : 'neutro'}
              mensaje={leyendo ? 'Leyendo el documento…' : hNumero?.veredicto === 'coincide' ? 'Aparece en la planilla.' : numero?.trim() ? ayudaSinLeer : 'El contratista no ha escrito el número.'}
              onVer={senalables.has('numero') ? () => ver('numero') : undefined}
            />

            <FilaCotejo
              etiqueta="Mes de cotización"
              sistema={<>{nombreMes(mes.valor) || '—'}{mes.confirmado && <span className="ml-2 text-xs font-medium text-emerald-700">Confirmado</span>}</>}
              estado={estado(hMes)}
              tono={hMes?.veredicto === 'coincide' ? 'bien' : hMes?.veredicto === 'distinto' ? 'aviso' : 'neutro'}
              mensaje={
                leyendo ? 'Leyendo el documento…'
                  : hMes?.veredicto === 'coincide' ? `La planilla dice ${mesPlanilla}${hMes.anio ? ` de ${hMes.anio}` : ''}.`
                    : otroAnio ? `La planilla dice ${mesPlanilla} de ${hMes?.anio}, pero el informe es de ${mes.anio}: es de otro año.`
                      : hMes?.veredicto === 'distinto' ? `La planilla dice ${mesPlanilla}, no ${nombreMes(mes.valor)}. Es un pago por mes vencido: válido si es el correcto.`
                        : ayudaSinLeer
              }
              onVer={senalables.has('mes') ? () => ver('mes') : undefined}
            >
              {hMes?.veredicto === 'distinto' && !otroAnio && hMes.mes && puedeCambiarMes && (
                <button type="button" disabled={ocupado} onClick={() => mes.onCambiar(hMes.mes!)} className={`${BOTON} text-white`} style={{ backgroundColor: MARCA }}>
                  Confirmar {mesPlanilla}
                </button>
              )}
              {hMes?.veredicto === 'coincide' && !mes.confirmado && puedeCambiarMes && (
                <button type="button" disabled={ocupado} onClick={() => mes.onCambiar(mes.valor)} className={`${BOTON} text-white`} style={{ backgroundColor: MARCA }}>
                  Confirmar {nombreMes(mes.valor)}
                </button>
              )}
              {puedeCambiarMes && !otroAnio && (
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
              onVer={senalables.has('ibc') ? () => ver('ibc') : undefined}
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

            {/* La persona: solo informa. «No aparece» no prueba nada (algunos operadores ocultan la cédula). */}
            {cedula && lectura?.calidad === 'ok' && (
              <FilaCotejo
                etiqueta="Cédula del contratista"
                sistema={hPersona?.veredicto === 'coincide' ? 'Aparece en la planilla' : 'No aparece en la planilla'}
                estado={personaFalta ? 'distinto' : estado(hPersona)}
                tono={hPersona?.veredicto === 'coincide' ? 'bien' : 'aviso'}
                mensaje={hPersona?.veredicto === 'coincide' ? 'La planilla es de esta persona.' : 'Verifica que la planilla sea de este contratista (algunos operadores ocultan la cédula).'}
                onVer={senalables.has('persona') ? () => ver('persona') : undefined}
              />
            )}

            <p className="hidden pt-1 text-[11px] leading-snug text-gray-400 lg:block">
              La lectura es una ayuda: la hace tu navegador y el documento no sale del sistema. La decisión es tuya.
            </p>
          </div>

          {/* La decisión, siempre a la vista */}
          {decision.puedeDecidir && (
            <div className="shrink-0 space-y-2 border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
              {decision.estado === 'aprobada' && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Icono glifo={Iconos.estado.aprobado} tamano="sm" /> Esta planilla ya está aprobada.</p>
              )}
              {decision.estado === 'rechazada' && decision.motivoAnterior && (
                <p className="text-xs text-red-600">Devuelta antes: {decision.motivoAnterior}</p>
              )}
              {!devolviendo && (hayDiferencias
                ? <p className="text-xs leading-snug text-amber-800">Hay algo que no coincide con el documento. Corrígelo o aprueba si es lo correcto.</p>
                : sinLectura && haySubida
                  ? <p className="text-xs leading-snug text-amber-800">Sin lectura automática: compara los datos a ojo antes de aprobar.</p>
                  : null)}
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

/**
 * Si algo fallara al dibujar la revisión, no se lleva la pantalla del periodo con él: se avisa y se ofrece lo de siempre,
 * abrir el documento en una pestaña nueva.
 */
class LimiteDeError extends Component<{ children: ReactNode; onCerrar: () => void; url: string | null }, { fallo: boolean }> {
  state = { fallo: false }

  static getDerivedStateFromError() { return { fallo: true } }

  componentDidCatch(error: unknown) { console.error('Revisión de la planilla en pantalla:', error) }

  render() {
    if (!this.state.fallo) return this.props.children
    return createPortal(
      <div role="alertdialog" aria-modal="true" aria-label="No se pudo abrir la revisión" className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl">
          <p className="text-sm font-semibold text-gray-900">No se pudo abrir la revisión en pantalla</p>
          <p className="mt-1 text-xs text-gray-500">Puedes revisar la planilla abriéndola en una pestaña nueva.</p>
          <div className="mt-4 flex justify-center gap-2">
            {this.props.url && (
              <a href={this.props.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">
                Abrir el documento
              </a>
            )}
            <button type="button" onClick={this.props.onCerrar} className="h-9 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50">
              Cerrar
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }
}

export default function RevisionPlanillaVisorSeguro(props: Props) {
  return (
    <LimiteDeError onCerrar={props.onCerrar} url={props.planilla.url ?? props.soporte.url}>
      <RevisionPlanillaVisor {...props} />
    </LimiteDeError>
  )
}
