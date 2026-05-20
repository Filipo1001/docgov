'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSupervisorDashboard,
  type SupervisorDashboard,
  type PeriodoPendienteSupervisor,
  type DesempenoContratista,
  type TendenciaMes,
  type ActividadSupervisorItem,
} from '@/services/supervisor'
import { getMesActual, MESES } from '@/lib/constants'

// ─── Constants ────────────────────────────────────────────────

const MESES_ABR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K'
  return '$' + n.toLocaleString('es-CO')
}

function fmtFull(n: number): string {
  return '$' + n.toLocaleString('es-CO')
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

// ─── Skeleton ─────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 rounded-xl w-64" />
          <div className="h-4 bg-gray-100 rounded w-48" />
        </div>
        <div className="h-16 bg-gray-200 rounded-2xl w-44" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
      </div>
      <div className="h-20 bg-gray-200 rounded-2xl" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-gray-200 rounded-2xl" />)}
      </div>
    </div>
  )
}

// ─── Hero Card ────────────────────────────────────────────────

function HeroCard({
  value,
  label,
  sublabel,
  color = 'gray',
}: {
  value: string | number
  label: string
  sublabel?: string
  color?: 'gray' | 'emerald' | 'amber' | 'blue'
}) {
  const bg = { gray: 'bg-white border-gray-200', emerald: 'bg-emerald-50 border-emerald-200', amber: 'bg-amber-50 border-amber-200', blue: 'bg-blue-50 border-blue-200' }
  const vc = { gray: 'text-gray-900', emerald: 'text-emerald-700', amber: 'text-amber-700', blue: 'text-blue-700' }
  return (
    <div className={`rounded-2xl border p-5 ${bg[color]}`}>
      <p className={`text-2xl font-black tabular-nums leading-none ${vc[color]}`}>{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-1.5">{label}</p>
      {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
    </div>
  )
}

// ─── Pipeline Bar ─────────────────────────────────────────────

function PipelineBar({ pipeline, mes, anio }: {
  pipeline: SupervisorDashboard['pipeline']
  mes: string
  anio: number
}) {
  const { total, sinEnviar, rechazado, enviado, revision, aprobado } = pipeline
  if (total === 0) return null

  const allSegments = [
    { key: 'sinEnviar', count: sinEnviar, color: 'bg-gray-300', label: 'Sin enviar',  tc: 'text-gray-500' },
    { key: 'rechazado', count: rechazado, color: 'bg-red-400',   label: 'Rechazado',  tc: 'text-red-500'  },
    { key: 'enviado',   count: enviado,   color: 'bg-amber-400', label: 'En tu mesa', tc: 'text-amber-600' },
    { key: 'revision',  count: revision,  color: 'bg-indigo-400',label: 'Secretaría', tc: 'text-indigo-600'},
    { key: 'aprobado',  count: aprobado,  color: 'bg-emerald-500',label: 'Aprobado',  tc: 'text-emerald-600'},
  ]
  const segments = allSegments.filter(s => s.count > 0)
  const pct = Math.round((aprobado / total) * 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">Pipeline {mes} {anio}</p>
        <p className="tabular-nums">
          <span className="text-2xl font-bold text-emerald-600">{pct}%</span>
          <span className="text-sm font-normal text-gray-400 ml-1">completado</span>
        </p>
      </div>

      {/* Bar */}
      <div className="flex h-10 rounded-2xl overflow-hidden gap-px">
        {segments.map((s, i) => {
          const w = (s.count / total) * 100
          return (
            <div
              key={s.key}
              style={{ width: `${w}%` }}
              className={`${s.color} flex items-center justify-center transition-all
                ${i === 0 ? 'rounded-l-2xl' : ''}
                ${i === segments.length - 1 ? 'rounded-r-2xl' : ''}
              `}
            >
              {w >= 10 && (
                <span className="text-white text-xs font-bold tabular-nums drop-shadow-sm">
                  {s.count}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {allSegments.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${s.color}`} />
            <span className={`text-xs font-medium ${s.tc}`}>{s.count}</span>
            <span className="text-xs text-gray-400">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Performance Dot ─────────────────────────────────────────

function Dot({ estado }: { estado: string }) {
  if (estado === 'aprobado' || estado === 'radicado')
    return <span className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" title="Aprobado" />
  if (estado === 'enviado' || estado === 'revision')
    return <span className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" title="En revisión" />
  if (estado === 'rechazado')
    return <span className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0" title="Rechazado" />
  return <span className="w-3 h-3 rounded-full border-2 border-gray-300 flex-shrink-0" title="Sin enviar" />
}

// ─── Compact Periodo Card ─────────────────────────────────────

function PeriodoCard({
  periodo,
  onAprobar,
  onRechazar,
  procesando,
}: {
  periodo: PeriodoPendienteSupervisor
  onAprobar: (id: string) => void
  onRechazar: (id: string) => void
  procesando: string | null
}) {
  const d = periodo.dias_espera
  const urgBg  = d >= 5 ? 'bg-red-50 border-red-200'    : d >= 2 ? 'bg-amber-50 border-amber-200'    : 'bg-white border-gray-200'
  const urgBdg = d >= 5 ? 'bg-red-100 text-red-700'     : d >= 2 ? 'bg-amber-100 text-amber-700'     : 'bg-gray-100 text-gray-600'
  const urgLbl = d === 0 ? 'Hoy' : d >= 5 ? `${d}d — Urgente` : `${d}d`
  const c = periodo.contrato

  return (
    <div className={`rounded-2xl border p-4 transition-all ${urgBg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm truncate">{c.contratista.nombre_completo}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${urgBdg}`}>
              {urgLbl}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-2">Cto. {c.numero} · {periodo.mes} {periodo.anio}</p>
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span>📋 {periodo.num_actividades} act.</span>
            <span>📷 {periodo.num_evidencias} foto{periodo.num_evidencias !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-gray-900 text-sm">{fmtFull(periodo.valor_cobro)}</p>
          <Link
            href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
            className="text-[11px] text-blue-600 hover:text-blue-700"
          >
            Ver →
          </Link>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onRechazar(periodo.id)}
          disabled={procesando === periodo.id}
          className="flex-1 text-xs py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
        >
          Rechazar
        </button>
        <button
          onClick={() => onAprobar(periodo.id)}
          disabled={procesando === periodo.id}
          className="flex-1 text-xs py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 font-semibold"
        >
          {procesando === periodo.id ? '…' : '✓ Aprobar'}
        </button>
      </div>
    </div>
  )
}

// ─── Rejection Modal ─────────────────────────────────────────

function RechazoModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (motivo: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [motivo, setMotivo] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-bold text-gray-900 mb-1">Rechazar periodo</h3>
        <p className="text-sm text-gray-500 mb-4">
          El contratista recibirá este motivo y podrá corregir y reenviar.
        </p>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Describe el motivo del rechazo..."
          rows={4}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-400 outline-none resize-none"
          autoFocus
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => onConfirm(motivo)}
            disabled={loading || !motivo.trim()}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Rechazando…' : 'Confirmar rechazo'}
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export default function SupervisorHome({
  userId,
  nombre,
}: {
  userId: string
  nombre: string
}) {
  const queryClient = useQueryClient()
  const [procesando, setProcesando] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)

  const firstName = nombre.split(' ')[0]
  const now = new Date()
  const hour = now.getHours()
  const saludo = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const { mes, anio } = getMesActual()
  const dia = now.getDate()
  const weekday = now.toLocaleDateString('es-CO', { weekday: 'long' })

  // staleTime: 5 min — navigating back shows cached data instantly.
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-supervisor', userId],
    queryFn:  () => getSupervisorDashboard(userId),
    staleTime: 5 * 60_000,
  })

  const QUERY_KEY = ['dashboard-supervisor', userId]

  async function handleAprobar(periodoId: string) {
    setProcesando(periodoId)
    const { aprobarPeriodos } = await import('@/app/actions/periodos')
    const result = await aprobarPeriodos([periodoId])
    setProcesando(null)
    if (!result.error) {
      // Optimistic update in cache — avoids a full refetch for a small list change
      queryClient.setQueryData<SupervisorDashboard>(QUERY_KEY, prev =>
        prev ? {
          ...prev,
          pendientes: prev.pendientes.filter(p => p.id !== periodoId),
          porAprobar: Math.max(0, prev.porAprobar - 1),
          pipeline: { ...prev.pipeline, enviado: Math.max(0, prev.pipeline.enviado - 1) },
        } : prev
      )
    }
  }

  async function handleRechazar(periodoId: string, motivo: string) {
    setProcesando(periodoId)
    const { rechazarPeriodos } = await import('@/app/actions/periodos')
    const result = await rechazarPeriodos([periodoId], motivo)
    setProcesando(null)
    setRechazando(null)
    if (!result.error) {
      queryClient.setQueryData<SupervisorDashboard>(QUERY_KEY, prev =>
        prev ? {
          ...prev,
          pendientes: prev.pendientes.filter(p => p.id !== periodoId),
          porAprobar: Math.max(0, prev.porAprobar - 1),
          pipeline: {
            ...prev.pipeline,
            enviado: Math.max(0, prev.pipeline.enviado - 1),
            rechazado: prev.pipeline.rechazado + 1,
          },
        } : prev
      )
    }
  }

  if (isLoading) return <Skeleton />
  if (!data) return null

  const pendientesVisibles = verTodos ? data.pendientes : data.pendientes.slice(0, 3)
  const consistentes = data.desempeno.filter(d => d.consistente)
  const enRiesgo = data.desempeno.filter(d => !d.consistente)
  const maxAprobados = Math.max(...data.tendencia.map(t => t.aprobados), 1)
  const tipoIcono: Record<string, string> = { enviado: '📤', aprobado: '✅', rechazado: '❌', radicado: '🏛' }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{saludo}, {firstName} 👋</h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">
            {now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Date / Nav Button */}
        <Link
          href="/dashboard/aprobaciones"
          className="group flex items-center gap-4 bg-gray-900 hover:bg-gray-800 active:scale-95 text-white rounded-2xl px-5 py-3 transition-all duration-150 self-start"
        >
          <span className="text-4xl font-black leading-none tabular-nums">{dia}</span>
          <span className="w-px h-8 bg-white/15 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold leading-tight">
              {mes} {anio}
              {data.porAprobar > 0 && (
                <span className="ml-2 bg-amber-400 text-gray-900 text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums">
                  {data.porAprobar}
                </span>
              )}
            </p>
            <p className="text-[11px] text-gray-400 capitalize">{weekday}</p>
            <p className="text-[11px] text-gray-500 group-hover:text-gray-300 transition-colors">
              Ver aprobaciones →
            </p>
          </div>
        </Link>
      </div>

      {/* ── Hero Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HeroCard
          value={fmt(data.valorBajoGestion)}
          label="Valor bajo gestión"
          sublabel={`${data.totalContratos} contrato${data.totalContratos !== 1 ? 's' : ''} supervisados`}
          color="blue"
        />
        <HeroCard
          value={`${data.pctCumplimiento}%`}
          label={`Cumplimiento ${mes}`}
          sublabel={`${data.pipeline.aprobado} de ${data.pipeline.total} aprobados`}
          color={data.pctCumplimiento >= 70 ? 'emerald' : data.pctCumplimiento >= 40 ? 'amber' : 'gray'}
        />
        <HeroCard
          value={data.porAprobar}
          label="Por aprobar"
          sublabel="Esperando tu revisión"
          color={data.porAprobar > 0 ? 'amber' : 'gray'}
        />
      </div>

      {/* ── Pipeline Bar ── */}
      <PipelineBar pipeline={data.pipeline} mes={mes} anio={anio} />

      {/* ── Alertas Inteligentes ── */}
      {(data.alertasTardios.length > 0 || data.alertasRechazados.length > 0) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h2 className="font-semibold text-gray-900">Alertas</h2>
            <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">
              {data.alertasTardios.length + data.alertasRechazados.length}
            </span>
          </div>
          <div className="space-y-2">
            {data.alertasTardios.slice(0, 5).map(a => (
              <Link
                key={a.contrato_id}
                href={`/dashboard/contratos/${a.contrato_id}`}
                className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition group"
              >
                <span className="w-2 h-2 bg-amber-400 rounded-full flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {a.contratista_nombre}
                  </p>
                  <p className="text-xs text-amber-700">Cto. {a.contrato_numero} · Sin enviar este mes</p>
                </div>
                <span className="text-xs text-amber-600 group-hover:text-amber-800 flex-shrink-0">Ver →</span>
              </Link>
            ))}
            {data.alertasTardios.length > 5 && (
              <p className="text-xs text-gray-400 text-center py-1">
                +{data.alertasTardios.length - 5} más sin enviar
              </p>
            )}
            {data.alertasRechazados.map(a => (
              <Link
                key={a.periodo_id}
                href={`/dashboard/contratos/${a.contrato_id}`}
                className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 transition group"
              >
                <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {a.contratista_nombre}
                  </p>
                  <p className="text-xs text-red-700">
                    Cto. {a.contrato_numero} · Rechazado · {a.dias}d sin corregir
                  </p>
                </div>
                <span className="text-xs text-red-600 group-hover:text-red-800 flex-shrink-0">Ver →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Cola de Aprobación ── */}
      {data.pendientes.length > 0 ? (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📋</span>
            <h2 className="font-semibold text-gray-900">Cola de aprobación</h2>
            <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium tabular-nums">
              {data.pendientes.length}
            </span>
          </div>
          <div className="space-y-3">
            {pendientesVisibles.map(p => (
              <PeriodoCard
                key={p.id}
                periodo={p}
                onAprobar={handleAprobar}
                onRechazar={setRechazando}
                procesando={procesando}
              />
            ))}
          </div>
          {!verTodos && data.pendientes.length > 3 && (
            <button
              onClick={() => setVerTodos(true)}
              className="mt-3 w-full text-sm text-blue-600 hover:text-blue-700 font-medium py-2 transition"
            >
              Ver todos {data.pendientes.length} pendientes →
            </button>
          )}
        </section>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="font-semibold text-emerald-900">Todo al día</p>
          <p className="text-sm text-emerald-700 mt-1">
            No tienes informes pendientes de revisión
          </p>
        </div>
      )}

      {/* ── Desempeño de Contratistas ── */}
      {data.desempeno.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📊</span>
            <h2 className="font-semibold text-gray-900">Desempeño de contratistas</h2>
            <span className="ml-auto text-xs text-gray-400">Últimos 5 meses</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {consistentes.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-emerald-700 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                  Consistentes ({consistentes.length})
                </p>
                <div className="space-y-2.5">
                  {consistentes.slice(0, 5).map(d => (
                    <Link
                      key={d.contrato_id}
                      href={`/dashboard/contratos/${d.contrato_id}`}
                      className="flex items-center gap-2 group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate leading-tight group-hover:text-emerald-700 transition-colors">
                          {d.contratista_nombre.split(' ').slice(0, 2).join(' ')}
                        </p>
                        <p className="text-[10px] text-gray-400">Cto. {d.contrato_numero}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {d.historial.map((h, i) => <Dot key={i} estado={h.estado} />)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {enRiesgo.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-red-700 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  En riesgo ({enRiesgo.length})
                </p>
                <div className="space-y-2.5">
                  {enRiesgo.slice(0, 5).map(d => (
                    <Link
                      key={d.contrato_id}
                      href={`/dashboard/contratos/${d.contrato_id}`}
                      className="flex items-center gap-2 group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate leading-tight group-hover:text-red-700 transition-colors">
                          {d.contratista_nombre.split(' ').slice(0, 2).join(' ')}
                        </p>
                        <p className="text-[10px] text-gray-400">Cto. {d.contrato_numero}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {d.historial.map((h, i) => <Dot key={i} estado={h.estado} />)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-2.5 flex items-center gap-4 flex-wrap px-1">
            {[
              { cls: 'bg-emerald-500',              label: 'Aprobado'    },
              { cls: 'bg-amber-400',                label: 'En revisión' },
              { cls: 'bg-red-400',                  label: 'Rechazado'   },
              { cls: 'border-2 border-gray-300 bg-transparent', label: 'Sin enviar' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${item.cls}`} />
                <span className="text-[11px] text-gray-400">{item.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tendencia Mensual ── */}
      {data.tendencia.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📈</span>
            <h2 className="font-semibold text-gray-900">Tendencia mensual</h2>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-end gap-2" style={{ height: '128px' }}>
              {data.tendencia.map(t => {
                const barH = Math.max(Math.round((t.aprobados / maxAprobados) * 96), t.aprobados > 0 ? 8 : 4)
                const mesIdx = (MESES as readonly string[]).findIndex(m => m === t.mes)
                const label = MESES_ABR[mesIdx] ?? t.mes.slice(0, 3)
                const isCurrent = t.mes === mes && t.anio === anio
                return (
                  <div key={`${t.mes}-${t.anio}`} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[11px] font-bold text-gray-700 tabular-nums">{t.aprobados}</span>
                    <div className="w-full flex items-end" style={{ height: '96px' }}>
                      <div
                        className={`w-full rounded-t-lg transition-all ${isCurrent ? 'bg-emerald-500' : 'bg-gray-200'}`}
                        style={{ height: `${barH}px` }}
                      />
                    </div>
                    <span className={`text-[11px] font-semibold ${isCurrent ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">Informes aprobados por mes</p>
          </div>
        </section>
      )}

      {/* ── Actividad Reciente ── */}
      {data.actividad.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🕐</span>
            <h2 className="font-semibold text-gray-900">Actividad reciente</h2>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
            {data.actividad.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-base flex-shrink-0">{tipoIcono[a.tipo] ?? '📋'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {a.contratista_nombre.split(' ').slice(0, 2).join(' ')}
                  </p>
                  <p className="text-xs text-gray-400">
                    Cto. {a.contrato_numero} · {a.mes} {a.anio}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    a.tipo === 'aprobado' || a.tipo === 'radicado' ? 'bg-emerald-100 text-emerald-700' :
                    a.tipo === 'rechazado' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {a.tipo === 'enviado'   ? 'Enviado'   :
                     a.tipo === 'aprobado'  ? 'Aprobado'  :
                     a.tipo === 'rechazado' ? 'Rechazado' :
                     a.tipo === 'radicado'  ? 'Radicado'  : a.tipo}
                  </span>
                  <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(a.fecha)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Rejection Modal ── */}
      {rechazando && (
        <RechazoModal
          loading={procesando === rechazando}
          onConfirm={motivo => handleRechazar(rechazando, motivo)}
          onCancel={() => setRechazando(null)}
        />
      )}
    </div>
  )
}
