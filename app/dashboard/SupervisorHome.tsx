'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getPeriodosPendientesSupervisor,
  getStatsSupervisor,
  type PeriodoPendienteSupervisor,
  type StatsSupervisor,
} from '@/services/supervisor'
import { formatCedula } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

function urgencyConfig(dias: number) {
  if (dias >= 5) return { color: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', label: `${dias}d — Urgente` }
  if (dias >= 2) return { color: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700', label: `${dias}d — Atencion` }
  return { color: 'bg-white border-gray-200', badge: 'bg-gray-100 text-gray-600', label: dias === 0 ? 'Hoy' : `${dias}d` }
}

function Avatar({ foto, nombre, size = 'md' }: { foto?: string | null; nombre: string; size?: 'sm' | 'md' }) {
  const initials = nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const cls = size === 'md'
    ? 'w-10 h-10 rounded-full object-cover ring-2 ring-white'
    : 'w-8 h-8 rounded-full object-cover ring-2 ring-white'
  const fallback = size === 'md'
    ? 'w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-sm font-bold text-white ring-2 ring-white shadow-sm'
    : 'w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-white shadow-sm'
  if (foto) return <img src={foto} alt={nombre} className={cls} />
  return <div className={fallback}>{initials}</div>
}

// ─── Pending period mini-card ─────────────────────────────────

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
  const urg = urgencyConfig(periodo.dias_espera)
  const c = periodo.contrato

  return (
    <div className={`rounded-2xl border p-5 transition-all ${urg.color}`}>
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="hidden sm:block">
          <Avatar foto={c.contratista.foto_url} nombre={c.contratista.nombre_completo} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex items-center gap-3">
              <div className="sm:hidden">
                <Avatar foto={c.contratista.foto_url} nombre={c.contratista.nombre_completo} size="sm" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 truncate">{c.contratista.nombre_completo}</p>
                <p className="text-xs text-gray-500">C.C. {formatCedula(c.contratista.cedula)}</p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-gray-900">{fmt(periodo.valor_cobro)}</p>
              <p className="text-xs text-gray-500">{periodo.mes} {periodo.anio}</p>
            </div>
          </div>

          {/* Contract */}
          <div className="mt-2 mb-3">
            <p className="text-xs font-medium text-gray-700">
              Contrato N.o {c.numero}
              {c.dependencia?.abreviatura && (
                <span className="ml-2 text-gray-400">· {c.dependencia.abreviatura}</span>
              )}
            </p>
            <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{c.objeto}</p>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs text-gray-400 mb-4 flex-wrap">
            <span>📋 {periodo.num_actividades} actividad{periodo.num_actividades !== 1 ? 'es' : ''}</span>
            <span className="hidden sm:inline">·</span>
            <span>📷 {periodo.num_evidencias} foto{periodo.num_evidencias !== 1 ? 's' : ''}</span>
            <span className="hidden sm:inline">·</span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${urg.badge}`}>
              ⏱ {urg.label}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Ver detalle →
            </Link>
            <div className="flex-1" />
            <button
              onClick={() => onRechazar(periodo.id)}
              disabled={procesando === periodo.id}
              className="text-xs px-4 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
            >
              Rechazar
            </button>
            <button
              onClick={() => onAprobar(periodo.id)}
              disabled={procesando === periodo.id}
              className="text-xs px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 font-medium"
            >
              {procesando === periodo.id ? '...' : '✓ Aprobar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Rejection modal ──────────────────────────────────────────

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
          El contratista recibira este motivo y podra corregir y reenviar.
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
            {loading ? 'Rechazando...' : 'Confirmar rechazo'}
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

// ─── Main component ───────────────────────────────────────────

export default function SupervisorHome({
  userId,
  nombre,
}: {
  userId: string
  nombre: string
}) {
  const [stats, setStats] = useState<StatsSupervisor | null>(null)
  const [periodos, setPeriodos] = useState<PeriodoPendienteSupervisor[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<string | null>(null)

  const firstName = nombre.split(' ')[0]
  const hour = new Date().getHours()
  const saludo = hour < 12 ? 'Buenos dias' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  async function cargar() {
    const [s, p] = await Promise.all([
      getStatsSupervisor(userId),
      getPeriodosPendientesSupervisor(userId),
    ])
    setStats(s)
    setPeriodos(p)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [userId])

  async function handleAprobar(periodoId: string) {
    setProcesando(periodoId)
    const { aprobarPeriodos } = await import('@/app/actions/periodos')
    const result = await aprobarPeriodos([periodoId])
    setProcesando(null)
    if (!result.error) {
      setPeriodos(prev => prev.filter(p => p.id !== periodoId))
      setStats(prev => prev ? { ...prev, porRevisar: prev.porRevisar - 1, aprobadosMes: prev.aprobadosMes + 1, totalAprobados: prev.totalAprobados + 1 } : prev)
    }
  }

  async function handleRechazar(periodoId: string, motivo: string) {
    setProcesando(periodoId)
    const { rechazarPeriodos } = await import('@/app/actions/periodos')
    const result = await rechazarPeriodos([periodoId], motivo)
    setProcesando(null)
    setRechazando(null)
    if (!result.error) {
      setPeriodos(prev => prev.filter(p => p.id !== periodoId))
      setStats(prev => prev ? { ...prev, porRevisar: prev.porRevisar - 1 } : prev)
    }
  }

  // ── Skeletons ──
  if (cargando) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
        <div className="space-y-4">
          <div className="h-40 bg-gray-200 rounded-2xl" />
          <div className="h-40 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    )
  }

  const urgentes = periodos.filter(p => p.dias_espera >= 5)
  const normales = periodos.filter(p => p.dias_espera < 5)

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <PageHeader
        title={`${saludo}, ${firstName} 👋`}
        subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        action={
          stats && stats.porRevisar > 0 ? (
            <Link
              href="/dashboard/aprobaciones"
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition flex items-center gap-2"
            >
              <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">
                {stats.porRevisar}
              </span>
              Ver cola completa →
            </Link>
          ) : undefined
        }
      />

      {/* ── Stats ── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Contratos supervisados"
            value={stats.totalContratos}
            icon="📄"
            color="gray"
          />
          <StatCard
            label="Por revisar"
            value={stats.porRevisar}
            icon="⏳"
            color={stats.porRevisar > 0 ? 'amber' : 'gray'}
          />
          <StatCard
            label="Aprobados este mes"
            value={stats.aprobadosMes}
            icon="✅"
            color="emerald"
          />
          <StatCard
            label="Total aprobados"
            value={stats.totalAprobados}
            icon="🏆"
            color="blue"
          />
        </div>
      )}

      {/* ── Empty state ── */}
      {periodos.length === 0 && (
        <Card>
          <EmptyState
            icon="🎉"
            title="Todo al dia"
            description="No tienes periodos pendientes de revision. Los contratistas aun no han enviado sus informes, o ya los aprobaste todos."
            action={{ href: '/dashboard/colaboradores', label: 'Ver mis colaboradores →' }}
          />
        </Card>
      )}

      {/* ── Urgentes ── */}
      {urgentes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🚨</span>
            <h2 className="font-semibold text-gray-900">Requieren atencion inmediata</h2>
            <span className="ml-auto text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-medium">
              {urgentes.length} con +5 dias
            </span>
          </div>
          <div className="space-y-3">
            {urgentes.map(p => (
              <PeriodoCard
                key={p.id}
                periodo={p}
                onAprobar={handleAprobar}
                onRechazar={setRechazando}
                procesando={procesando}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Normales ── */}
      {normales.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📋</span>
            <h2 className="font-semibold text-gray-900">Pendientes de revision</h2>
            <span className="ml-auto text-xs text-gray-500">
              {normales.length} periodo{normales.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-3">
            {normales.map(p => (
              <PeriodoCard
                key={p.id}
                periodo={p}
                onAprobar={handleAprobar}
                onRechazar={setRechazando}
                procesando={procesando}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Rejection modal ── */}
      {rechazando && (
        <RechazoModal
          loading={procesando === rechazando}
          onConfirm={(motivo) => handleRechazar(rechazando, motivo)}
          onCancel={() => setRechazando(null)}
        />
      )}
    </div>
  )
}
