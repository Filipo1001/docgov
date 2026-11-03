'use client'

/**
 * La ventana de revisión de /dashboard/informes: los documentos de un informe y la decisión, sin salir de la pantalla.
 *
 * Una sola ventana con pestañas —Informe · Cuenta de cobro · Planilla · Soporte de pago · Acta de supervisión · Acta de
 * pago, solo las que existen (las actas, desde que se aprueba)— en vez de un visor por documento:
 * quien revisa mira el informe, salta a la planilla y vuelve, sin abrir y cerrar ventanas. Arriba, la persona (foto,
 * nombre, contrato, valor y mes) y el zoom; abajo, la decisión de lo que está mirando:
 *   · en el informe y los demás documentos del sistema: Devolver y «Aprobar y seguir» (que pasa solo al siguiente);
 *   · en la planilla o el soporte: aprobar o devolver la planilla, con el motivo ahí mismo.
 * ‹ › (o las flechas del teclado, desde la pantalla) pasan de informe. Al pasar, se queda en la misma pestaña si el
 * siguiente también tiene ese documento: revisar todas las planillas del mes es planilla tras planilla.
 *
 * Los documentos se dibujan con el mismo lector de la revisión de planilla (`PaginasPdf`): página a página, con zoom, y
 * probando sola la cédula si la planilla viene cifrada. El informe es el documento oficial (con QR y anexos): la primera
 * vez tarda unos segundos en armarse; si no se puede armar (a un borrador le faltan datos), se dice por qué.
 *
 * El cotejo de mes e IBC de la planilla sigue en la página del periodo («Cotejo completo»): mueve cifras de las actas.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import PaginasPdf, { type EstadoPdf } from '@/components/ui/PaginasPdf'
import Avatar from '@/components/ui/Avatar'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'
import { useModalAccesible } from '@/lib/use-modal'
import { capitalizarNombre } from '@/lib/format'
import { pesos } from '@/lib/valor-contrato'
import { conLimite } from '@/lib/con-limite'
import { obtenerPlanillaInforme } from '@/app/actions/informes'
import { revisarPlanilla } from '@/app/actions/periodos'
import type { Periodo } from '@/lib/types'

export type PestanaRevision = 'informe' | 'cuenta-cobro' | 'planilla' | 'soporte' | 'acta-supervision' | 'acta-pago'

/** Los que arma el sistema (con su ruta en /api/pdf); planilla y soporte son archivos que sube el contratista. */
const GENERADOS = new Set<PestanaRevision>(['informe', 'cuenta-cobro', 'acta-supervision', 'acta-pago'])
const esDeLaPlanilla = (p: PestanaRevision) => p === 'planilla' || p === 'soporte'

const PESTANAS: { id: PestanaRevision; etiqueta: string; corta: string; icono: LucideIcon }[] = [
  { id: 'informe', etiqueta: 'Informe de actividades', corta: 'Informe', icono: Iconos.documentos.informe },
  { id: 'cuenta-cobro', etiqueta: 'Cuenta de cobro', corta: 'Cuenta', icono: Iconos.documentos.cuentaCobro },
  { id: 'planilla', etiqueta: 'Planilla', corta: 'Planilla', icono: Iconos.documentos.planilla },
  { id: 'soporte', etiqueta: 'Soporte de pago', corta: 'Soporte', icono: Iconos.documentos.soportePago },
  { id: 'acta-supervision', etiqueta: 'Acta de supervisión', corta: 'Acta sup.', icono: Iconos.documentos.actaSupervision },
  { id: 'acta-pago', etiqueta: 'Acta de pago', corta: 'Acta pago', icono: Iconos.documentos.actaPago },
]

const ZOOMS = [1, 1.25, 1.5, 2]

const REVISION_PLANILLA = {
  pendiente: { texto: 'Planilla por revisar', color: 'text-amber-800', icono: Iconos.estado.enEspera },
  aprobada: { texto: 'Planilla aprobada', color: 'text-emerald-700', icono: Iconos.estado.aprobado },
  rechazada: { texto: 'Planilla devuelta', color: 'text-red-700', icono: Iconos.accion.devolver },
} as const

/** El estado del informe en palabras, con su color: lo que se lee en el pie. */
export interface EstadoInforme { texto: string; color: string }

export default function RevisionDocumentos({
  periodo,
  pestanaInicial,
  posicion,
  estado,
  quedan,
  onAnterior,
  onSiguiente,
  onCerrar,
  bloqueado,
  puedeAprobar,
  aprobando,
  onAprobar,
  puedeDevolver,
  onDevolver,
  onPlanillaCambio,
}: {
  periodo: Periodo
  pestanaInicial: PestanaRevision
  /** Dónde está en la lista (0 = primero). */
  posicion: { i: number; total: number }
  estado: EstadoInforme
  /** Cuántos quedan por revisar en la lista. */
  quedan: number
  onAnterior: () => void
  onSiguiente: () => void
  onCerrar: () => void
  /** Hay otra ventana encima (devolver): Escape y tocar fuera no cierran esta. */
  bloqueado: boolean
  puedeAprobar: boolean
  aprobando: boolean
  onAprobar: () => void
  puedeDevolver: boolean
  onDevolver: () => void
  onPlanillaCambio: (revision: 'aprobada' | 'rechazada', comentario: string | null) => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const tienePlanilla = !!periodo.planilla_ss_url
  const tieneSoporte = !!periodo.soporte_pago_url
  // Las actas existen desde que se aprueba; la cuenta de cobro y el informe, siempre.
  const hayActas = periodo.estado === 'aprobado' || periodo.estado === 'radicado'
  const disponible = (p: PestanaRevision) =>
    p === 'planilla' ? tienePlanilla : p === 'soporte' ? tieneSoporte : p.startsWith('acta-') ? hayActas : true

  const [pestanaElegida, setPestana] = useState<PestanaRevision>(pestanaInicial)
  // Al pasar a un informe sin ese documento, se muestra el informe (sin perder la elección para el siguiente).
  const pestana = disponible(pestanaElegida) ? pestanaElegida : 'informe'
  const [zoom, setZoom] = useState(1)
  const [estadoDoc, setEstadoDoc] = useState<EstadoPdf>('cargando')
  const [explicacion, setExplicacion] = useState<string | null>(null)
  const [devolviendoPlanilla, setDevolviendoPlanilla] = useState(false)
  const [motivoPlanilla, setMotivoPlanilla] = useState('')
  const [guardandoPlanilla, setGuardandoPlanilla] = useState(false)

  const cerrar = () => { if (!bloqueado && !guardandoPlanilla) onCerrar() }
  useModalAccesible(panel, cerrar, bloqueado || guardandoPlanilla)

  // Lo de la planilla (documentos firmados y su revisión) se pide solo si la hay.
  const clavePlanilla = ['planilla-informe', periodo.id]
  const planilla = useQuery({
    queryKey: clavePlanilla,
    queryFn: () => conLimite(obtenerPlanillaInforme(periodo.id), 'Planilla del informe', 12_000),
    enabled: tienePlanilla || tieneSoporte,
  })

  const documento: { url: string; esPdf: boolean } | null =
    GENERADOS.has(pestana)
      ? { url: `/api/pdf/${periodo.id}/${pestana}`, esPdf: true }
      : (pestana === 'planilla' ? planilla.data?.planilla : planilla.data?.soporte) ?? null

  // Otro documento: zoom al ajuste y sin la explicación del anterior.
  const claveDocumento = `${periodo.id}:${pestana}`
  const [documentoVisto, setDocumentoVisto] = useState(claveDocumento)
  if (documentoVisto !== claveDocumento) {
    setDocumentoVisto(claveDocumento)
    setEstadoDoc('cargando')
    setZoom(1)
    setExplicacion(null)
    setDevolviendoPlanilla(false)
  }

  // Si un documento del sistema no se pudo armar, el servidor dice por qué (por ejemplo, a un borrador le faltan datos).
  useEffect(() => {
    if (estadoDoc !== 'error' || !GENERADOS.has(pestana)) return
    let cancelado = false
    fetch(`/api/pdf/${periodo.id}/${pestana}`)
      // Solo «datos incompletos» (422) se explica así; otro fallo queda con el aviso del lector y su «Reintentar».
      .then(async r => (r.status === 422 ? ((await r.json()) as { error?: string }).error ?? null : null))
      .catch(() => null)
      .then(texto => { if (!cancelado) setExplicacion(texto) })
    return () => { cancelado = true }
  }, [estadoDoc, pestana, periodo.id])

  const nombre = capitalizarNombre(periodo.contrato?.contratista?.nombre_completo ?? '') || 'Sin nombre'
  const datosPlanilla = planilla.data
  const planillaEnRevision = !!datosPlanilla && !datosPlanilla.esHistorico && (datosPlanilla.estado === 'enviado' || datosPlanilla.estado === 'revision')
  const puedeAprobarPlanilla = !!datosPlanilla?.planilla && !datosPlanilla.esHistorico
    && (planillaEnRevision || datosPlanilla.estado === 'aprobado') && datosPlanilla.revision !== 'aprobada'
  const puedeDevolverPlanilla = !!datosPlanilla?.planilla && planillaEnRevision && datosPlanilla.revision !== 'rechazada'

  async function decidirPlanilla(revision: 'aprobada' | 'rechazada') {
    const comentario = revision === 'rechazada' ? motivoPlanilla.trim() : null
    if (revision === 'rechazada' && !comentario) return
    setGuardandoPlanilla(true)
    const res = await revisarPlanilla(periodo.id, revision, comentario ?? undefined)
    setGuardandoPlanilla(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(revision === 'aprobada' ? 'Planilla aprobada' : 'Planilla devuelta al contratista')
    onPlanillaCambio(revision, comentario)
    setDevolviendoPlanilla(false)
    void queryClient.invalidateQueries({ queryKey: clavePlanilla })
  }

  const botonIcono = 'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-gray-950/60 backdrop-blur-sm sm:p-4"
      onPointerDown={(e) => { if (e.target === e.currentTarget) cerrar() }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="revision-titulo"
        className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:rounded-2xl"
      >
        {/* ── Cabecera: la persona, y las herramientas del documento. ── */}
        <header className="border-b border-gray-200">
          <div className="flex items-center gap-3 px-4 pb-3 pt-3.5 sm:px-5">
            <Avatar nombre={nombre} foto={periodo.contrato?.contratista?.foto_url ?? null} clases="h-11 w-11 text-sm" />
            <div className="min-w-0 flex-1">
              <h2 id="revision-titulo" className="truncate text-[15px] font-semibold leading-tight text-gray-900">{nombre}</h2>
              <p className="mt-0.5 truncate text-sm tabular-nums text-gray-500">
                <span className="font-semibold text-gray-700">CN {periodo.contrato?.numero ?? '—'}</span>
                {' · '}{pesos(periodo.valor_cobro ?? null)}
                {' · '}{periodo.mes.charAt(0).toUpperCase() + periodo.mes.slice(1).toLowerCase()} {periodo.anio}
              </p>
            </div>

            <div className="hidden items-center gap-0.5 rounded-xl border border-gray-200 p-0.5 sm:flex" role="group" aria-label="Zoom">
              <button type="button" onClick={() => setZoom(z => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)])} disabled={zoom === ZOOMS[0]} aria-label="Alejar" className={botonIcono}>
                <Icono glifo={Iconos.accion.alejar} tamano="sm" />
              </button>
              <button type="button" onClick={() => setZoom(1)} className="min-w-[3.25rem] rounded-lg px-1.5 py-1.5 text-xs font-semibold tabular-nums text-gray-600 hover:bg-gray-100" title="Ajustar al ancho">
                {Math.round(zoom * 100)} %
              </button>
              <button type="button" onClick={() => setZoom(z => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Acercar" className={botonIcono}>
                <Icono glifo={Iconos.accion.acercar} tamano="sm" />
              </button>
            </div>
            {documento && (
              <a href={documento.url} download target="_blank" rel="noopener" aria-label="Descargar este documento" title="Descargar" className={botonIcono}>
                <Icono glifo={Iconos.documentos.descargar} tamano="md" />
              </a>
            )}
            <button type="button" onClick={cerrar} aria-label="Cerrar" className={botonIcono}>
              <Icono glifo={Iconos.accion.cerrar} tamano="md" />
            </button>
          </div>

          {/* Las pestañas: solo los documentos que existen. */}
          <div role="tablist" aria-label="Documentos del informe" className="-mb-px flex gap-1 overflow-x-auto px-3 sm:px-4">
            {PESTANAS.filter(p => disponible(p.id)).map(p => {
              const activa = pestana === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setPestana(p.id)}
                  className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 ${
                    activa ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Icono glifo={p.icono} tamano="sm" />
                  <span className="sm:hidden">{p.corta}</span>
                  <span className="hidden sm:inline">{p.etiqueta}</span>
                  {p.id === 'planilla' && datosPlanilla?.revision === 'pendiente' && (
                    <span aria-label="por revisar" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
              )
            })}
          </div>
        </header>

        {/* ── El documento, como hojas sobre la mesa. ── */}
        <div className="relative min-h-0 flex-1 overflow-auto bg-[#eef0f3] px-3 py-5 sm:px-8 sm:py-7">
          {explicacion ? (
            <div className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-700">
                <Icono glifo={Iconos.estado.advertencia} tamano="md" />
              </span>
              <p className="mt-3 text-sm font-semibold text-gray-900">Este documento todavía no se puede armar</p>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{explicacion}</p>
            </div>
          ) : esDeLaPlanilla(pestana) && planilla.isLoading ? (
            <HojaCargando texto="Abriendo la planilla…" />
          ) : esDeLaPlanilla(pestana) && planilla.isError && !datosPlanilla ? (
            <Aviso texto="No se pudo abrir la planilla.">
              <button type="button" onClick={() => planilla.refetch()} className="mt-3 min-h-10 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                Reintentar
              </button>
            </Aviso>
          ) : !documento ? (
            <Aviso texto="Este documento no está disponible." />
          ) : documento.esPdf ? (
            <div className="relative">
              {estadoDoc === 'cargando' && (
                <div className="absolute inset-x-0 top-0 z-10">
                  <HojaCargando texto={pestana === 'informe' ? 'Preparando el informe de actividades…' : 'Abriendo el documento…'} />
                </div>
              )}
              <div className={`[&_canvas]:rounded-sm [&_canvas]:shadow-[0_1px_3px_rgba(16,24,40,0.08),0_8px_24px_-6px_rgba(16,24,40,0.18)] ${estadoDoc === 'cargando' ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}>
                <PaginasPdf
                  key={documento.url}
                  url={documento.url}
                  zoom={zoom}
                  claves={esDeLaPlanilla(pestana) && datosPlanilla?.cedula ? [datosPlanilla.cedula] : []}
                  onEstado={setEstadoDoc}
                />
              </div>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- dirección firmada y temporal: no pasa por el optimizador
            <img
              src={documento.url}
              alt={pestana === 'soporte' ? 'Soporte de pago' : 'Planilla de seguridad social'}
              style={{ width: `${zoom * 100}%` }}
              className="mx-auto block max-w-none rounded-sm bg-white shadow-[0_8px_24px_-6px_rgba(16,24,40,0.18)] sm:max-w-[64rem]"
            />
          )}
        </div>

        {/* ── La decisión de lo que se está mirando. ── */}
        <footer className="border-t border-gray-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {esDeLaPlanilla(pestana) && devolviendoPlanilla ? (
            <form onSubmit={(e) => { e.preventDefault(); void decidirPlanilla('rechazada') }} className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="motivo-planilla" className="mb-1 block text-sm font-medium text-gray-700">
                  ¿Qué debe corregir en la planilla? <span className="font-normal text-gray-500">(lo leerá el contratista)</span>
                </label>
                <input
                  id="motivo-planilla"
                  autoFocus
                  value={motivoPlanilla}
                  onChange={e => setMotivoPlanilla(e.target.value)}
                  placeholder="Por ejemplo: la planilla es de agosto y el informe es de septiembre."
                  className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/15"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDevolviendoPlanilla(false)} disabled={guardandoPlanilla} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                  Cancelar
                </button>
                <button type="submit" disabled={guardandoPlanilla || !motivoPlanilla.trim()} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                  {guardandoPlanilla ? 'Devolviendo…' : 'Devolver planilla'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
              <div className="flex items-center gap-1">
                <button type="button" onClick={onAnterior} disabled={posicion.i === 0} aria-label="Informe anterior" className={botonIcono}>
                  <Icono glifo={Iconos.accion.retroceder} tamano="md" />
                </button>
                <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums text-gray-500">
                  {posicion.i + 1} de {posicion.total}
                </span>
                <button type="button" onClick={onSiguiente} disabled={posicion.i >= posicion.total - 1} aria-label="Informe siguiente" className={botonIcono}>
                  <Icono glifo={Iconos.accion.avanzar} tamano="md" />
                </button>
              </div>

              <p className="min-w-0 flex-1 text-sm">
                {!esDeLaPlanilla(pestana) || !datosPlanilla?.revision ? (
                  <span className={`font-semibold ${estado.color}`}>{estado.texto}</span>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 font-semibold ${REVISION_PLANILLA[datosPlanilla.revision].color}`}>
                    <Icono glifo={REVISION_PLANILLA[datosPlanilla.revision].icono} tamano="sm" />
                    {REVISION_PLANILLA[datosPlanilla.revision].texto}
                    {datosPlanilla.numero && <span className="hidden font-normal tabular-nums text-gray-500 sm:inline">· N.º {datosPlanilla.numero}</span>}
                  </span>
                )}
                {!esDeLaPlanilla(pestana) && quedan > 0 && <span className="text-gray-500"> · quedan {quedan}<span className="hidden sm:inline"> por revisar</span></span>}
                {esDeLaPlanilla(pestana) && (
                  <Link
                    href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
                    className="ml-2 hidden text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline sm:inline"
                  >
                    Cotejo completo (mes e IBC)
                  </Link>
                )}
              </p>

              <div className="flex w-full justify-end gap-2 sm:w-auto">
                {!esDeLaPlanilla(pestana) ? (
                  <>
                    {puedeDevolver && (
                      <button type="button" onClick={onDevolver} className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-red-700 transition-colors hover:border-red-200 hover:bg-red-50">
                        Devolver
                      </button>
                    )}
                    {puedeAprobar && (
                      <button type="button" onClick={onAprobar} disabled={aprobando} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60">
                        <Icono glifo={Iconos.estado.ok} tamano="sm" />
                        {aprobando ? 'Aprobando…' : posicion.i < posicion.total - 1 ? 'Aprobar y seguir' : 'Aprobar'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {puedeDevolverPlanilla && (
                      <button type="button" onClick={() => { setMotivoPlanilla(''); setDevolviendoPlanilla(true) }} className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-red-700 transition-colors hover:border-red-200 hover:bg-red-50">
                        Devolver planilla
                      </button>
                    )}
                    {puedeAprobarPlanilla && (
                      <button type="button" onClick={() => decidirPlanilla('aprobada')} disabled={guardandoPlanilla} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60">
                        <Icono glifo={Iconos.estado.ok} tamano="sm" />
                        {guardandoPlanilla ? 'Guardando…' : 'Aprobar planilla'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}

/** Mientras llega el documento: una hoja en blanco con renglones que brillan, y qué se está haciendo. */
function HojaCargando({ texto }: { texto: string }) {
  return (
    <div role="status" className="mx-auto max-w-[44rem]">
      <div className="aspect-[8.5/11] w-full rounded-sm bg-white p-[8%] shadow-[0_8px_24px_-6px_rgba(16,24,40,0.18)]">
        <div className="flex items-center justify-between">
          <div className="sk h-10 w-10 rounded-full" />
          <div className="sk h-3 w-1/3 rounded" />
        </div>
        <div className="sk mx-auto mt-8 h-4 w-1/2 rounded" />
        <div className="mt-8 space-y-3">
          {[92, 86, 95, 70, 88, 60].map((w, i) => <div key={i} className="sk h-2.5 rounded" style={{ width: `${w}%` }} />)}
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <div key={i} className="sk aspect-[4/3] rounded" />)}
        </div>
      </div>
      <p className="mt-4 text-center text-sm font-medium text-gray-600">{texto}</p>
    </div>
  )
}

function Aviso({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-medium text-gray-900">{texto}</p>
      {children}
    </div>
  )
}
