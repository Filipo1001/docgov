'use client'

/**
 * La planilla de seguridad social de un informe, en una ventana sobre /dashboard/informes.
 *
 * Muestra el documento (y el soporte de pago, si lo hay) y deja aprobarla o devolverla con un motivo ahí mismo. Si el PDF
 * viene cifrado, prueba sola la cédula del contratista, como en la página del periodo.
 *
 * Lo que NO hace: el cotejo dato por dato (número, mes de cotización e IBC, con la lectura del documento). Ese vive en la
 * página del periodo y se llega con «Cotejo completo»: cambiar el mes o el IBC mueve cifras de las actas, y no conviene
 * hacerlo desde una vista rápida.
 *
 * Las reglas son las de siempre, en el servidor (`revisarPlanilla`): devolver solo mientras el informe está enviado o en
 * revisión (después, la contratista no podría reemplazarla); aprobar también con el informe ya aprobado.
 */

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import PaginasPdf from '@/components/ui/PaginasPdf'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { useModalAccesible } from '@/lib/use-modal'
import { capitalizarNombre } from '@/lib/format'
import { conLimite } from '@/lib/con-limite'
import { obtenerPlanillaInforme } from '@/app/actions/informes'
import { revisarPlanilla } from '@/app/actions/periodos'

type Pestana = 'planilla' | 'soporte'

const REVISION: Record<'pendiente' | 'aprobada' | 'rechazada', { texto: string; color: string }> = {
  pendiente: { texto: 'Por revisar', color: 'text-amber-800' },
  aprobada: { texto: 'Aprobada', color: 'text-emerald-700' },
  rechazada: { texto: 'Devuelta', color: 'text-red-700' },
}

export default function PlanillaInforme({
  periodoId,
  nombre,
  contrato,
  hrefPeriodo,
  onCambio,
  onCerrar,
}: {
  periodoId: string
  nombre: string
  contrato: string
  /** La página del periodo, donde está el cotejo completo. */
  hrefPeriodo: string
  /** Tras aprobar o devolver: para que la tarjeta cambie al instante. */
  onCambio: (revision: 'aprobada' | 'rechazada', comentario: string | null) => void
  onCerrar: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [pestana, setPestana] = useState<Pestana>('planilla')
  const [devolviendo, setDevolviendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  useModalAccesible(panel, onCerrar, guardando)

  const clave = ['planilla-informe', periodoId]
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: clave,
    queryFn: () => conLimite(obtenerPlanillaInforme(periodoId), 'Planilla del informe', 12_000),
  })

  const documento = pestana === 'soporte' ? data?.soporte : data?.planilla
  const enRevision = !!data && !data.esHistorico && (data.estado === 'enviado' || data.estado === 'revision')
  const puedeAprobar = !!data?.planilla && !data.esHistorico && (enRevision || data.estado === 'aprobado') && data.revision !== 'aprobada'
  const puedeDevolver = !!data?.planilla && enRevision && data.revision !== 'rechazada'

  async function decidir(revision: 'aprobada' | 'rechazada') {
    const comentario = revision === 'rechazada' ? motivo.trim() : null
    if (revision === 'rechazada' && !comentario) return
    setGuardando(true)
    const res = await revisarPlanilla(periodoId, revision, comentario ?? undefined)
    setGuardando(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(revision === 'aprobada' ? 'Planilla aprobada' : 'Planilla devuelta al contratista')
    onCambio(revision, comentario)
    setDevolviendo(false)
    void queryClient.invalidateQueries({ queryKey: clave })
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar() }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-planilla"
        className="flex h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[92dvh] sm:rounded-2xl"
      >
        {/* Cabecera: quién, y las dos pestañas si hay soporte de pago. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-4 py-3 sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600">
            <Icono glifo={Iconos.documentos.planilla} tamano="md" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="titulo-planilla" className="text-base font-semibold leading-tight text-gray-900">Planilla de seguridad social</h3>
            <p className="mt-0.5 truncate text-sm text-gray-500">
              {capitalizarNombre(nombre)} · CN {contrato}
              {data?.numero && <span className="tabular-nums"> · Planilla N.º {data.numero}</span>}
            </p>
          </div>
          {data?.soporte && (
            <div role="tablist" aria-label="Documento" className="order-last flex w-full gap-1 rounded-lg bg-gray-100 p-1 sm:order-none sm:w-auto">
              {(['planilla', 'soporte'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={pestana === p}
                  onClick={() => setPestana(p)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
                    pestana === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {p === 'planilla' ? 'Planilla' : 'Soporte de pago'}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
          >
            <Icono glifo={Iconos.accion.cerrar} tamano="md" />
          </button>
        </div>

        {/* El documento. */}
        <div className="relative flex-1 overflow-y-auto bg-gray-100 p-3 sm:p-5">
          {isLoading ? (
            <div role="status" className="grid h-full place-items-center text-sm text-gray-500">Abriendo la planilla…</div>
          ) : isError && !data ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="text-sm font-medium text-gray-900">No se pudo abrir la planilla.</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="mt-3 min-h-10 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isFetching ? 'Reintentando…' : 'Reintentar'}
                </button>
              </div>
            </div>
          ) : !documento ? (
            <div className="grid h-full place-items-center text-sm text-gray-500">
              {pestana === 'soporte' ? 'No hay soporte de pago.' : 'El contratista todavía no ha subido la planilla.'}
            </div>
          ) : documento.esPdf ? (
            <div className="mx-auto max-w-3xl">
              <PaginasPdf key={documento.url} url={documento.url} claves={data?.cedula ? [data.cedula] : []} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- dirección firmada y temporal: no pasa por el optimizador
            <img src={documento.url} alt={pestana === 'soporte' ? 'Soporte de pago' : 'Planilla de seguridad social'} className="mx-auto max-w-full rounded-lg bg-white shadow-sm" />
          )}
        </div>

        {/* La decisión. */}
        <div className="border-t border-gray-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {devolviendo ? (
            <form onSubmit={(e) => { e.preventDefault(); void decidir('rechazada') }} className="space-y-2.5">
              <label htmlFor="motivo-planilla" className="block text-sm font-medium text-gray-700">
                ¿Qué debe corregir en la planilla? <span className="font-normal text-gray-500">(lo leerá el contratista)</span>
              </label>
              <textarea
                id="motivo-planilla"
                autoFocus
                rows={2}
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Por ejemplo: la planilla es de agosto y el informe es de septiembre."
                className="w-full resize-y rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/15"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDevolviendo(false)} disabled={guardando} className="min-h-10 rounded-xl px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando || !motivo.trim()} className="min-h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                  {guardando ? 'Devolviendo…' : 'Devolver planilla'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {data?.revision && (
                <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${REVISION[data.revision].color}`}>
                  <Icono glifo={data.revision === 'aprobada' ? Iconos.estado.aprobado : data.revision === 'rechazada' ? Iconos.accion.devolver : Iconos.estado.enEspera} tamano="sm" />
                  {REVISION[data.revision].texto}
                  {data.revision === 'rechazada' && data.comentario && (
                    <span className="font-normal text-gray-500">· «{data.comentario}»</span>
                  )}
                </p>
              )}
              <Link href={hrefPeriodo} className="text-sm font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">
                Cotejo completo (mes e IBC)
              </Link>
              <div className="ml-auto flex gap-2">
                {puedeDevolver && (
                  <button type="button" onClick={() => { setMotivo(''); setDevolviendo(true) }} disabled={guardando} className="min-h-10 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50">
                    Devolver
                  </button>
                )}
                {puedeAprobar && (
                  <button type="button" onClick={() => decidir('aprobada')} disabled={guardando} className="min-h-10 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
                    {guardando ? 'Guardando…' : 'Aprobar planilla'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
