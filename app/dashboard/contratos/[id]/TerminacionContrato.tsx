'use client'

/**
 * Terminación anticipada del contrato, en su ficha (migración 081).
 *
 * Dos caras:
 *   · Si el contrato terminó, todos los que ven la ficha leen cuándo, por qué y con qué acto; quien la gestiona puede
 *     deshacerla (con motivo) mientras el periodo recortado no se haya presentado.
 *   · Si no, admin, contratación y el supervisor del contrato pueden registrarla. Antes de confirmar se ve qué pasará:
 *     qué meses se anulan, cuál se recorta y por cuánto (el proporcional se propone y se puede corregir), qué informes
 *     siguen pendientes y qué lo impide. Es la misma cuenta que hace la base, que vuelve a comprobarlo todo.
 */

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  previsualizarTerminacion,
  registrarTerminacion,
  revertirTerminacion,
  type TerminacionVigente,
} from '@/app/actions/terminacion-contrato'
import {
  CAUSALES_TERMINACION,
  causalTerminacion,
  diaAnterior,
  fechaLarga,
  type PlanTerminacion,
  type PeriodoParaTerminar,
} from '@/lib/terminacion-contrato'
import { ESTADO_LABEL } from '@/lib/constants'
import { capitalizarNombre } from '@/lib/format'
import type { EstadoPeriodo } from '@/lib/types'

const CAMPO = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60'
const ETIQUETA = 'block text-xs font-medium text-gray-500 mb-1'

const plata = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`
const nombreMes = (p: PeriodoParaTerminar) => `${p.mes.charAt(0)}${p.mes.slice(1).toLowerCase()} ${p.anio}`
const lista = (ps: PeriodoParaTerminar[]) => ps.map(nombreMes).join(', ')

export default function TerminacionContrato({
  contrato,
  terminacion,
  puedeGestionar,
}: {
  contrato: { id: string; numero: string; estado: string; fecha_inicio: string; fecha_fin: string }
  terminacion: TerminacionVigente | null
  puedeGestionar: boolean
}) {
  if (terminacion) return <Terminado contratoId={contrato.id} terminacion={terminacion} puedeGestionar={puedeGestionar} />
  if (!puedeGestionar || !['vigente', 'suspendido'].includes(contrato.estado)) return null
  return <Registrar contrato={contrato} />
}

// ─── Ya terminado ────────────────────────────────────────────────────────────

function Terminado({
  contratoId, terminacion: t, puedeGestionar,
}: { contratoId: string; terminacion: TerminacionVigente; puedeGestionar: boolean }) {
  const router = useRouter()
  const [deshaciendo, setDeshaciendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const causal = causalTerminacion(t.causal)

  async function deshacer() {
    setEnviando(true)
    const res = await revertirTerminacion(contratoId, motivo)
    setEnviando(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Se deshizo la terminación: el contrato y sus periodos vuelven a como estaban')
    setDeshaciendo(false)
    setMotivo('')
    router.refresh()
  }

  return (
    <section aria-labelledby="terminacion-titulo" className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
        <h3 id="terminacion-titulo" className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Terminación anticipada
        </h3>
        <p className="text-xs text-gray-400">
          Registrada por {capitalizarNombre(t.registradaPor)} · {new Date(t.registradaEn).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div className="min-w-0">
          <dt className="text-gray-400 text-xs">Último día de ejecución</dt>
          <dd className="font-medium text-gray-900">{fechaLarga(t.fechaTerminacion)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-gray-400 text-xs">Causal</dt>
          <dd className="font-medium text-gray-900">{t.causalNombre}</dd>
          {causal?.norma && <dd className="text-xs text-gray-400">{causal.norma}</dd>}
        </div>
        <div className="min-w-0">
          <dt className="text-gray-400 text-xs">Acto</dt>
          <dd className="font-medium text-gray-900">
            {t.numeroActo || t.fechaActo
              ? [t.numeroActo && `N.º ${t.numeroActo}`, t.fechaActo && `del ${fechaLarga(t.fechaActo)}`].filter(Boolean).join(' ')
              : '—'}
          </dd>
        </div>
      </dl>

      {t.observacion && <p className="text-sm text-gray-600 mt-4 whitespace-pre-line [overflow-wrap:anywhere]">{t.observacion}</p>}

      <p className="text-xs text-gray-500 mt-4">
        {t.periodosAnulados > 0
          ? `${t.periodosAnulados === 1 ? 'El periodo posterior quedó anulado' : `Los ${t.periodosAnulados} periodos posteriores quedaron anulados`}: no piden informe ni generan recordatorios. `
          : ''}
        Los informes hasta el último día de ejecución siguen pendientes: con ellos se paga lo ejecutado.
      </p>

      {puedeGestionar && (
        !deshaciendo ? (
          <button
            type="button"
            onClick={() => setDeshaciendo(true)}
            className="mt-4 text-sm font-medium text-gray-500 hover:text-gray-800 underline decoration-gray-300 underline-offset-2 transition-colors"
          >
            Deshacer la terminación
          </button>
        ) : (
          <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs text-gray-500">
              Para un registro hecho por error. Los periodos anulados vuelven a su estado y el recortado a su fecha y su valor.
              No se puede si el informe del mes recortado ya se presentó.
            </p>
            <div>
              <label htmlFor="terminacion-motivo-reversion" className={ETIQUETA}>
                Por qué se deshace <span className="text-red-500">*</span>
              </label>
              <textarea
                id="terminacion-motivo-reversion"
                rows={2}
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej. Se registró en el contrato equivocado"
                className={`${CAMPO} resize-none`}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={deshacer}
                disabled={enviando || !motivo.trim()}
                className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                {enviando ? 'Deshaciendo…' : 'Deshacer terminación'}
              </button>
              <button
                type="button"
                onClick={() => { setDeshaciendo(false); setMotivo('') }}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )
      )}
    </section>
  )
}

// ─── Registrar ───────────────────────────────────────────────────────────────

function Registrar({ contrato }: { contrato: { id: string; numero: string; fecha_inicio: string; fecha_fin: string } }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [causal, setCausal] = useState('')
  const [sinEjecucion, setSinEjecucion] = useState(false)
  const [fechaEscrita, setFechaEscrita] = useState('')
  const [fechaActo, setFechaActo] = useState('')
  const [numeroActo, setNumeroActo] = useState('')
  const [observacion, setObservacion] = useState('')
  const [valor, setValor] = useState('')
  const [plan, setPlan] = useState<PlanTerminacion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const pedido = useRef(0)

  const fecha = sinEjecucion ? diaAnterior(contrato.fecha_inicio) : fechaEscrita
  const elegida = causalTerminacion(causal)

  // La vista previa se pide al servidor cada vez que cambia el día: es la misma cuenta que hará la base. Si llegan dos
  // respuestas cruzadas (se cambió la fecha dos veces seguidas), solo cuenta la del último pedido.
  async function pedirPlan(dia: string) {
    const este = ++pedido.current
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) { setPlan(null); setCargando(false); return }
    setCargando(true)
    const res = await previsualizarTerminacion(contrato.id, dia)
    if (este !== pedido.current) return
    setCargando(false)
    if (res.error) { setPlan({ error: res.error, anulados: [], recortado: null, bloqueos: [], pendientes: [] }); return }
    setPlan(res.data ?? null)
    setValor(res.data?.recortado ? String(res.data.recortado.valorPropuesto) : '')
  }

  const valorNumero = valor.trim() === '' ? null : Number(valor.replace(/[^\d]/g, ''))
  const tope = plan?.recortado ? Number(plan.recortado.periodo.valor_cobro) : null
  const valorInvalido = !!plan?.recortado && (valorNumero === null || !Number.isFinite(valorNumero) || valorNumero > (tope ?? 0))

  const listo = useMemo(() =>
    !!elegida && !!plan && !plan.error && plan.bloqueos.length === 0 && !valorInvalido && !cargando
    && (elegida.id !== 'otra' || !!observacion.trim()),
  [elegida, plan, valorInvalido, cargando, observacion])

  function cerrar() {
    pedido.current++
    setAbierto(false)
    setCausal(''); setSinEjecucion(false); setFechaEscrita(''); setFechaActo(''); setNumeroActo('')
    setObservacion(''); setValor(''); setPlan(null)
  }

  async function registrar() {
    setEnviando(true)
    const res = await registrarTerminacion({
      contratoId: contrato.id,
      causal,
      fecha,
      fechaActo: fechaActo || null,
      numeroActo: numeroActo || null,
      observacion: observacion || null,
      valorAjustado: plan?.recortado ? valorNumero : null,
    })
    setEnviando(false)
    if (res.error) { toast.error(res.error); return }
    const n = res.data?.anulados ?? 0
    toast.success(n > 0
      ? `Terminación registrada. ${n === 1 ? 'Un periodo quedó anulado' : `${n} periodos quedaron anulados`}.`
      : 'Terminación registrada.')
    cerrar()
    router.refresh()
  }

  if (!abierto) {
    return (
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="text-sm font-medium text-gray-500 hover:text-gray-800 underline decoration-gray-300 underline-offset-2 transition-colors"
        >
          Registrar terminación anticipada
        </button>
      </div>
    )
  }

  return (
    <section aria-labelledby="registrar-terminacion-titulo" className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <h3 id="registrar-terminacion-titulo" className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-1">
        Registrar terminación anticipada
      </h3>
      <p className="text-xs text-gray-500 mb-4 max-w-2xl">
        Deja constancia del acto que terminó el contrato N.º {contrato.numero} antes del {fechaLarga(contrato.fecha_fin)}.
        Los meses posteriores al último día de ejecución dejan de pedir informe y de generar avisos; los anteriores siguen
        pendientes. Se puede deshacer si se registra por error.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="terminacion-causal" className={ETIQUETA}>Causal <span className="text-red-500">*</span></label>
          <select id="terminacion-causal" value={causal} onChange={e => setCausal(e.target.value)} className={CAMPO}>
            <option value="">Elige la causal…</option>
            {CAUSALES_TERMINACION.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {elegida && (
            <p className="text-[11px] text-gray-500 mt-1">
              {elegida.norma && <span className="font-medium text-gray-600">{elegida.norma}. </span>}
              {elegida.ayuda}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="terminacion-fecha" className={ETIQUETA}>Último día de ejecución <span className="text-red-500">*</span></label>
            <input
              id="terminacion-fecha"
              type="date"
              value={fecha}
              min={contrato.fecha_inicio}
              max={diaAnterior(contrato.fecha_fin)}
              disabled={sinEjecucion}
              onChange={e => { setFechaEscrita(e.target.value); pedirPlan(e.target.value) }}
              className={CAMPO}
            />
            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500">
              <input
                type="checkbox"
                checked={sinEjecucion}
                onChange={e => {
                  setSinEjecucion(e.target.checked)
                  pedirPlan(e.target.checked ? diaAnterior(contrato.fecha_inicio) : fechaEscrita)
                }}
                className="rounded border-gray-300"
              />
              No llegó a ejecutarse
            </label>
          </div>
          <div>
            <label htmlFor="terminacion-numero-acto" className={ETIQUETA}>
              N.º {elegida?.acto === 'resolución' ? 'de la resolución' : 'del acta'}
            </label>
            <input
              id="terminacion-numero-acto"
              type="text"
              value={numeroActo}
              onChange={e => setNumeroActo(e.target.value)}
              placeholder="Opcional"
              className={CAMPO}
            />
          </div>
          <div>
            <label htmlFor="terminacion-fecha-acto" className={ETIQUETA}>Fecha del acto</label>
            <input
              id="terminacion-fecha-acto"
              type="date"
              value={fechaActo}
              onChange={e => setFechaActo(e.target.value)}
              className={CAMPO}
            />
          </div>
        </div>

        <div>
          <label htmlFor="terminacion-observacion" className={ETIQUETA}>
            Observación {elegida?.id === 'otra' && <span className="text-red-500">*</span>}
          </label>
          <textarea
            id="terminacion-observacion"
            rows={2}
            value={observacion}
            onChange={e => setObservacion(e.target.value)}
            placeholder={elegida?.id === 'otra' ? 'Explica la causal' : 'Opcional. Ej. Renuncia presentada el 30 de septiembre y aceptada por la entidad'}
            className={`${CAMPO} resize-none`}
          />
        </div>

        <VistaPrevia plan={plan} cargando={cargando} valor={valor} setValor={setValor} valorInvalido={valorInvalido} />

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={registrar}
            disabled={!listo || enviando}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {enviando ? 'Registrando…' : 'Registrar terminación'}
          </button>
          <button type="button" onClick={cerrar} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </section>
  )
}

export function VistaPrevia({
  plan, cargando, valor, setValor, valorInvalido,
}: {
  plan: PlanTerminacion | null
  cargando: boolean
  valor: string
  setValor: (v: string) => void
  valorInvalido: boolean
}) {
  if (!plan) {
    return cargando
      ? <p className="text-xs text-gray-400">Calculando qué pasa con los periodos…</p>
      : null
  }
  if (plan.error) return <p role="alert" className="text-sm text-red-700">{plan.error}</p>

  const r = plan.recortado
  return (
    <div className={`rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2 text-sm transition-opacity ${cargando ? 'opacity-60' : ''}`} aria-live="polite">
      {plan.bloqueos.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <p className="font-medium">No se puede terminar ese día.</p>
          <p className="text-xs mt-0.5">
            Estos informes van más allá del último día y ya se presentaron:{' '}
            {plan.bloqueos.map(p => `${nombreMes(p)} (${p.es_historico ? 'histórico' : (ESTADO_LABEL[p.estado as EstadoPeriodo] ?? p.estado).toLowerCase()})`).join(', ')}.
            Lo presentado no se reescribe: hay que devolverlos primero, o elegir un día posterior a su fin.
          </p>
        </div>
      )}

      {/* Con algo que lo impide, el resto del plan no pasaría: se muestra solo el porqué. */}
      {plan.bloqueos.length === 0 && <>
      <p className="text-gray-700">
        {plan.anulados.length > 0
          ? <>Quedan <strong className="font-semibold">anulados</strong>: {lista(plan.anulados)}.</>
          : 'Ningún periodo queda anulado.'}
      </p>

      {r && (
        <div className="text-gray-700">
          <p>
            <strong className="font-semibold">{nombreMes(r.periodo)}</strong> queda recortado: va hasta el {fechaLarga(r.fechaFinNueva)}{' '}
            ({r.dias} {r.dias === 1 ? 'día' : 'días'} de 30).
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
            <div>
              <label htmlFor="terminacion-valor" className={ETIQUETA}>Valor de {nombreMes(r.periodo)}</label>
              <input
                id="terminacion-valor"
                inputMode="numeric"
                value={valor === '' ? '' : Number(valor.replace(/[^\d]/g, '') || 0).toLocaleString('es-CO')}
                onChange={e => setValor(e.target.value.replace(/[^\d]/g, ''))}
                aria-invalid={valorInvalido}
                className={`${CAMPO} w-40 tabular-nums ${valorInvalido ? 'border-red-300 focus:ring-red-400' : ''}`}
              />
            </div>
            <p className="text-[11px] text-gray-500 pb-2">
              Propuesto: {plata(r.valorPropuesto)}, el proporcional por días. Completo valía {plata(Number(r.periodo.valor_cobro))}
              {valorInvalido ? '; no puede pasar de ahí.' : '.'}
            </p>
          </div>
        </div>
      )}

      <p className="text-gray-700">
        {plan.pendientes.length > 0
          ? <>Siguen pendientes de informe: {lista(plan.pendientes)}.</>
          : 'No queda ningún informe pendiente.'}
      </p>
      </>}
    </div>
  )
}
