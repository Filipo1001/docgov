'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  getAsesorStats,
  getPendientesRevisor,
  type AsesorStats,
  type PeriodoPendienteRevisor,
} from '@/services/dashboard'
import { enviarCorreoMasivoAsesor, type FiltroCorreo } from '@/app/actions/correos'
import { MESES, getMesActual } from '@/lib/constants'
import PageHeader from '@/components/ui/PageHeader'

// ─── Helpers ──────────────────────────────────────────────────

function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-CO')}`
}

// ─── Skeleton ─────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-xl w-64" />
      <div className="h-4 bg-gray-100 rounded w-48" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
      </div>
      <div className="h-16 bg-gray-200 rounded-2xl" />
      <div className="h-48 bg-gray-200 rounded-2xl" />
      <div className="h-64 bg-gray-200 rounded-2xl" />
    </div>
  )
}

// ─── Stacked Pipeline Bar ─────────────────────────────────────

function PipelineBar({ stats }: { stats: AsesorStats }) {
  const { totalContratos, sinEnviar, enMesa, conSecretaria, aprobados, rechazados } = stats
  if (totalContratos === 0) return null

  const rawPct = (n: number) => Math.max(0, (n / totalContratos) * 100)
  const fmtPct = (n: number) => `${rawPct(n).toFixed(0)}%`

  const segments = [
    {
      value: sinEnviar,
      color: 'bg-gray-200',
      textColor: 'text-gray-500',
      label: 'Sin enviar',
      border: 'border-gray-300',
    },
    {
      value: rechazados,
      color: 'bg-red-200',
      textColor: 'text-red-600',
      label: 'Rechazados',
      border: 'border-red-300',
    },
    {
      value: enMesa,
      color: 'bg-amber-300',
      textColor: 'text-amber-700',
      label: 'En tu mesa',
      border: 'border-amber-400',
    },
    {
      value: conSecretaria,
      color: 'bg-indigo-400',
      textColor: 'text-indigo-700',
      label: 'Con secretaría',
      border: 'border-indigo-500',
    },
    {
      value: aprobados,
      color: 'bg-emerald-400',
      textColor: 'text-emerald-700',
      label: 'Aprobados',
      border: 'border-emerald-500',
    },
  ].filter(s => s.value > 0)

  const pctCompleto = Math.round(((aprobados + conSecretaria) / totalContratos) * 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6">

      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Pipeline · {getMesActual().mes}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{totalContratos} contratos activos</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-emerald-600">{pctCompleto}%</span>
          <p className="text-xs text-gray-400">completados</p>
        </div>
      </div>

      {/* Thick segmented bar */}
      <div className="flex rounded-2xl overflow-hidden h-10 gap-0.5">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`
              ${s.color} relative flex items-center justify-center
              transition-all duration-700
              first:rounded-l-2xl last:rounded-r-2xl
            `}
            style={{ width: `${rawPct(s.value)}%` }}
          >
            {/* Show number inside segment if wide enough */}
            {rawPct(s.value) >= 10 && (
              <span className={`text-xs font-bold ${s.textColor} select-none`}>
                {s.value}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Segment labels below bar */}
      <div className="flex mt-1 gap-0.5">
        {segments.map((s, i) => (
          <div
            key={i}
            className="overflow-hidden"
            style={{ width: `${rawPct(s.value)}%` }}
          >
            {rawPct(s.value) >= 14 && (
              <p className={`text-[10px] font-medium ${s.textColor} mt-1.5 truncate px-0.5`}>
                {s.label}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Full legend (always visible) */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 pt-4 border-t border-gray-100">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-md ${s.color} border ${s.border} flex-shrink-0`} />
            <span className="text-xs text-gray-500">
              <span className="font-semibold text-gray-800">{s.value}</span>
              {' '}{s.label}
              <span className="text-gray-400 ml-1">({fmtPct(s.value)})</span>
            </span>
          </div>
        ))}
      </div>

    </div>
  )
}

// ─── Pending card ─────────────────────────────────────────────

function PendienteCard({ p }: { p: PeriodoPendienteRevisor }) {
  const urgente = p.dias_espera >= 5
  const medio   = p.dias_espera >= 2 && p.dias_espera < 5
  const dotColor = urgente ? 'bg-red-400' : medio ? 'bg-amber-400' : 'bg-gray-300'
  const espera   = p.dias_espera === 0 ? 'Hoy' : `${p.dias_espera}d`

  return (
    <Link
      href={`/dashboard/contratos/${p.contrato_id}/periodo/${p.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl transition group"
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {p.contratista_nombre.split(' ').slice(0, 2).join(' ')}
        </p>
        <p className="text-xs text-gray-400 truncate">
          Cto. {p.contrato_numero}
          {p.dependencia_nombre && (
            <span className="hidden sm:inline"> · {p.dependencia_nombre}</span>
          )}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-gray-900">{fmt(p.valor_cobro)}</p>
        <p className="text-xs text-gray-400">{espera}</p>
      </div>
      <span className="text-gray-300 group-hover:text-gray-500 text-sm transition">→</span>
    </Link>
  )
}

// ─── Email module ─────────────────────────────────────────────

const FILTROS: { key: FiltroCorreo; label: string }[] = [
  { key: 'sin_enviar', label: 'Sin enviar' },
  { key: 'enviaron',   label: 'Enviaron'   },
  { key: 'rechazados', label: 'Rechazados' },
  { key: 'todos',      label: 'Todos'      },
]

function EmailModule({ stats }: { stats: AsesorStats }) {
  const [filtro,   setFiltro]   = useState<FiltroCorreo>('sin_enviar')
  const [asunto,   setAsunto]   = useState('')
  const [mensaje,  setMensaje]  = useState('')
  const [enviando, setEnviando] = useState(false)
  const [abierto,  setAbierto]  = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const counts = {
    sin_enviar: stats.correoCounts.sin_enviar,
    enviaron:   stats.correoCounts.enviaron,
    rechazados: stats.correoCounts.rechazados_filtro,
    todos:      stats.correoCounts.todos,
  }

  const current = counts[filtro]
  const excluidos = current.total - current.conEmail

  async function handleEnviar() {
    if (!asunto.trim() || !mensaje.trim()) {
      toast.error('Completa el asunto y el mensaje')
      return
    }
    if (current.conEmail === 0) {
      toast.error('No hay destinatarios con correo registrado')
      return
    }
    setEnviando(true)
    const res = await enviarCorreoMasivoAsesor(filtro, asunto, mensaje)
    setEnviando(false)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success(`✅ ${res.data?.enviados} correo${res.data?.enviados !== 1 ? 's' : ''} enviado${res.data?.enviados !== 1 ? 's' : ''}`)
      setAsunto('')
      setMensaje('')
      setAbierto(false)
    }
  }

  // Insert {{nombre}} at cursor
  function insertarVariable() {
    const ta = textRef.current
    if (!ta) return
    const start = ta.selectionStart ?? mensaje.length
    const end   = ta.selectionEnd   ?? mensaje.length
    const next  = mensaje.slice(0, start) + '{{nombre}}' + mensaje.slice(end)
    setMensaje(next)
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + 10
      ta.focus()
    }, 0)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      {/* Header — always visible */}
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 rounded-2xl transition"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📧</span>
          <span className="text-sm font-semibold text-gray-900">Correo masivo</span>
        </div>
        <span className="text-gray-400 text-xs">{abierto ? '▲ Cerrar' : '▼ Redactar'}</span>
      </button>

      {abierto && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">

          {/* Filter chips */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Enviar a:</p>
            <div className="flex flex-wrap gap-2">
              {FILTROS.map(f => {
                const c = counts[f.key]
                const activo = filtro === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => setFiltro(f.key)}
                    className={`flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-medium transition min-w-[70px] ${
                      activo
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span className={`text-base font-bold ${activo ? 'text-white' : 'text-gray-800'}`}>
                      {c.total}
                    </span>
                    <span>{f.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Asunto</label>
            <input
              type="text"
              value={asunto}
              onChange={e => setAsunto(e.target.value)}
              placeholder="Recordatorio informe de Mayo"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50"
            />
          </div>

          {/* Message */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Mensaje</label>
              <button
                type="button"
                onClick={insertarVariable}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
              >
                + insertar {'{{nombre}}'}
              </button>
            </div>
            <textarea
              ref={textRef}
              rows={5}
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              placeholder={`Hola {{nombre}},\n\nTe recordamos que...`}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50 resize-none"
            />
          </div>

          {/* Recipients summary */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 text-xs text-gray-600">
            <span>
              📬&nbsp;
              <span className="font-semibold text-gray-900">{current.conEmail}</span>
              &nbsp;destinatario{current.conEmail !== 1 ? 's' : ''}
              {excluidos > 0 && (
                <span className="text-amber-600 ml-1.5">
                  · {excluidos} sin email real (excluido{excluidos !== 1 ? 's' : ''})
                </span>
              )}
            </span>

            <button
              onClick={handleEnviar}
              disabled={enviando || current.conEmail === 0 || !asunto.trim() || !mensaje.trim()}
              className="ml-4 bg-gray-900 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {enviando ? 'Enviando…' : 'Enviar →'}
            </button>
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────

export default function ReviewerHome({
  nombre,
  dependenciaId,
}: {
  nombre: string
  dependenciaId: string | null
}) {
  const [stats,      setStats]      = useState<AsesorStats | null>(null)
  const [pendientes, setPendientes] = useState<PeriodoPendienteRevisor[]>([])
  const [cargando,   setCargando]   = useState(true)

  const firstName = nombre.split(' ')[0]
  const { mes, anio } = getMesActual()

  useEffect(() => {
    if (!dependenciaId) { setCargando(false); return }

    Promise.all([
      getAsesorStats(dependenciaId, mes, anio),
      getPendientesRevisor('enviado'),
    ]).then(([s, p]) => {
      setStats(s)
      setPendientes(p)
      setCargando(false)
    })
  }, [dependenciaId, mes, anio])

  if (cargando) return <Skeleton />

  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // No dependencia assigned
  if (!dependenciaId || !stats) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`${saludo()}, ${firstName}`}
          subtitle={fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}
        />
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-800">
          Tu cuenta no tiene una secretaría asignada. Contacta al administrador.
        </div>
      </div>
    )
  }

  const MAX_VISIBLE = 4
  const visible     = pendientes.slice(0, MAX_VISIBLE)
  const resto       = pendientes.length - MAX_VISIBLE

  const tiles = [
    {
      value: stats.sinEnviar,
      label: 'Sin enviar',
      bg: 'bg-gray-50',
      text: 'text-gray-700',
    },
    {
      value: stats.enMesa,
      label: 'En tu mesa',
      bg: stats.enMesa > 0 ? 'bg-amber-50' : 'bg-gray-50',
      text: stats.enMesa > 0 ? 'text-amber-700' : 'text-gray-500',
      badge: stats.enMesa > 0,
    },
    {
      value: stats.conSecretaria,
      label: 'Con secretaría',
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
    },
    {
      value: stats.aprobados,
      label: 'Aprobados',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
    },
  ]

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <PageHeader
        title={`${saludo()}, ${firstName}`}
        subtitle={fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}
        action={
          <Link
            href="/dashboard/informes"
            className="group flex items-center gap-3 bg-gray-900 hover:bg-gray-800 active:scale-95 text-white pl-3 pr-5 py-2.5 rounded-2xl transition-all duration-200 shadow-sm hover:shadow-lg"
          >
            <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center text-base flex-shrink-0">
              📅
            </div>
            <div className="text-left">
              <p className="text-sm font-bold leading-none">{mes} {anio}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-none group-hover:text-gray-300 transition-colors">
                Ver informes →
              </p>
            </div>
            {pendientes.length > 0 && (
              <span className="ml-0.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {pendientes.length}
              </span>
            )}
          </Link>
        }
      />

      {/* ── 4 Stat tiles ── */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {tiles.map((t, i) => (
          <div key={i} className={`${t.bg} rounded-2xl p-3 sm:p-4`}>
            <p className={`text-xl sm:text-2xl font-bold ${t.text}`}>
              {t.value}
              {t.badge && <span className="ml-1 text-amber-500 text-base">⬤</span>}
            </p>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 leading-tight">{t.label}</p>
          </div>
        ))}
      </div>

      {/* ── Stacked pipeline bar ── */}
      <PipelineBar stats={stats} />

      {/* ── Pending queue ── */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Pendientes en tu mesa</h3>
          <Link href="/dashboard/informes" className="text-xs text-gray-400 hover:text-gray-600 transition">
            Ver todos →
          </Link>
        </div>

        {pendientes.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm font-medium text-gray-700">Todo al día</p>
            <p className="text-xs text-gray-400 mt-1">No hay informes esperando revisión</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visible.map(p => <PendienteCard key={p.id} p={p} />)}
            {resto > 0 && (
              <Link
                href="/dashboard/informes"
                className="flex items-center justify-center gap-1 py-3 text-xs text-gray-400 hover:text-gray-600 transition"
              >
                + {resto} más → Ver todos
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── Mass email module ── */}
      <EmailModule stats={stats} />

    </div>
  )
}
