'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getDashboardContratista,
  type DashboardContratista,
} from '@/services/contratista'
import { ESTADO_LABEL, ESTADO_COLOR, MESES } from '@/lib/constants'
import type { EstadoPeriodo } from '@/lib/types'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'

// ─── Helpers ──────────────────────────────────────────────────

function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos dias'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

function mesActualNombre(): string {
  return MESES[new Date().getMonth()]
}

function progressColor(pct: number): string {
  if (pct >= 95) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function progressBg(pct: number): string {
  if (pct >= 95) return 'bg-red-100'
  if (pct >= 80) return 'bg-amber-100'
  return 'bg-emerald-100'
}

function estadoBadgeColor(estado: string): string {
  return ESTADO_COLOR[estado as EstadoPeriodo] ?? 'bg-gray-100 text-gray-600'
}

// ─── Action panel config ──────────────────────────────────────

function getAccionActual(
  periodoActual: DashboardContratista['periodoActual'],
  contratoId: string | undefined
): { mensaje: string; desc: string; href: string | null; cta: string | null; color: string; icon: string } {
  if (!periodoActual || !contratoId) {
    return {
      mensaje: 'No hay periodo activo este mes',
      desc: 'El periodo de ' + mesActualNombre() + ' aun no esta disponible.',
      href: null,
      cta: null,
      color: 'bg-gray-50 border-gray-200',
      icon: '📅',
    }
  }

  const base = `/dashboard/contratos/${contratoId}/periodo/${periodoActual.id}`
  const estado = periodoActual.estado

  if (estado === 'borrador') {
    return {
      mensaje: `Completa tu informe de ${mesActualNombre()}`,
      desc: 'Registra tus actividades y sube las evidencias para enviar tu cuenta de cobro.',
      href: base,
      cta: 'Completar informe',
      color: 'bg-amber-50 border-amber-200',
      icon: '📝',
    }
  }

  if (estado === 'rechazado') {
    return {
      mensaje: 'Tu informe fue rechazado',
      desc: periodoActual.motivo_rechazo ?? 'Revisa las observaciones y corrige tu informe.',
      href: base,
      cta: 'Ver correcciones',
      color: 'bg-red-50 border-red-200',
      icon: '⚠️',
    }
  }

  if (estado === 'enviado' || estado === 'revision') {
    return {
      mensaje: 'Informe enviado — en revision',
      desc: 'Tu informe esta siendo revisado. Recibiras una notificacion cuando sea aprobado.',
      href: base,
      cta: 'Ver estado',
      color: 'bg-blue-50 border-blue-200',
      icon: '⏳',
    }
  }

  if (estado === 'aprobado' || estado === 'radicado') {
    return {
      mensaje: `Informe de ${mesActualNombre()} aprobado`,
      desc: `Tu cuenta de cobro por ${fmt(periodoActual.valor_cobro)} fue aprobada.`,
      href: base,
      cta: 'Ver detalles',
      color: 'bg-emerald-50 border-emerald-200',
      icon: '✅',
    }
  }

  return {
    mensaje: ESTADO_LABEL[estado as EstadoPeriodo] ?? estado,
    desc: '',
    href: base,
    cta: 'Ver periodo',
    color: 'bg-gray-50 border-gray-200',
    icon: '📋',
  }
}

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-xl w-72" />
      <div className="h-5 bg-gray-100 rounded w-48" />
      <div className="h-32 bg-gray-200 rounded-2xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
      </div>
      <div className="h-24 bg-gray-200 rounded-2xl" />
      <div className="flex gap-2">
        {[...Array(6)].map((_, i) => <div key={i} className="h-12 w-16 bg-gray-200 rounded-xl" />)}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────

export default function ContratistaHome({
  userId,
  nombre,
}: {
  userId: string
  nombre: string
}) {
  const [data, setData] = useState<DashboardContratista | null>(null)
  const [cargando, setCargando] = useState(true)

  const firstName = nombre.split(' ')[0]

  useEffect(() => {
    getDashboardContratista(userId).then(d => {
      setData(d)
      setCargando(false)
    })
  }, [userId])

  if (cargando || !data) return <Skeleton />

  const { contrato, periodos, periodoActual, progreso, stats } = data
  const accion = getAccionActual(periodoActual, contrato?.id)
  const mes = mesActualNombre()

  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">

      {/* ── Header with greeting ── */}
      <PageHeader
        title={`${saludo()}, ${firstName}`}
        subtitle={fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}
        action={
          periodoActual && contrato ? (
            <Link
              href={`/dashboard/contratos/${contrato.id}/periodo/${periodoActual.id}`}
              className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition flex items-center gap-2"
            >
              <span>📅</span> {mes}
            </Link>
          ) : contrato ? (
            <Link
              href={`/dashboard/contratos/${contrato.id}`}
              className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition flex items-center gap-2"
            >
              <span>📋</span> Mi contrato
            </Link>
          ) : undefined
        }
      />

      {/* ── No contract fallback ── */}
      {!contrato && (
        <Card>
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📄</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Sin contrato activo</h3>
            <p className="text-sm text-gray-500">No tienes contratos asignados en este momento.</p>
          </div>
        </Card>
      )}

      {contrato && (
        <>
          {/* ── Action panel — what to do now ── */}
          <div className={`rounded-2xl border-2 p-5 ${accion.color}`}>
            <div className="flex items-start gap-4">
              <div className="text-3xl flex-shrink-0 mt-0.5">{accion.icon}</div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">{accion.mensaje}</h2>
                <p className="text-sm text-gray-600 mt-1">{accion.desc}</p>
                {accion.href && accion.cta && (
                  <Link
                    href={accion.href}
                    className="inline-flex items-center gap-1.5 mt-3 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition"
                  >
                    {accion.cta} <span className="text-xs">→</span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label="Total periodos" value={stats.totalPeriodos} color="gray" />
            <MiniStat label="Aprobados" value={stats.aprobados} color="emerald" />
            <MiniStat label="En revision" value={stats.pendientes} color="blue" />
            <MiniStat label="Por completar" value={stats.porCompletar} color="amber" />
          </div>

          {/* ── Contract progress ── */}
          {progreso && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Progreso del contrato</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Contrato N.o {contrato.numero}-{contrato.anio}
                    {contrato.dependencia && ` · ${contrato.dependencia.nombre}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{progreso.porcentaje}%</p>
                  <p className="text-xs text-gray-500">
                    {progreso.diasRestantes > 0
                      ? `${progreso.diasRestantes} dias restantes`
                      : 'Contrato finalizado'}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className={`w-full h-3 rounded-full ${progressBg(progreso.porcentaje)}`}>
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${progressColor(progreso.porcentaje)}`}
                  style={{ width: `${progreso.porcentaje}%` }}
                />
              </div>

              {/* Progress details */}
              <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                <span>{contrato.fecha_inicio}</span>
                <span className="font-medium text-gray-700">
                  {progreso.diasTranscurridos} de {progreso.diasTotales} dias
                </span>
                <span>{contrato.fecha_fin}</span>
              </div>
            </Card>
          )}

          {/* ── Mini payment history ── */}
          {periodos.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Historial de periodos</h3>
              <div className="flex flex-wrap gap-2">
                {periodos.map(p => {
                  const isActual = periodoActual?.id === p.id
                  return (
                    <Link
                      key={p.id}
                      href={`/dashboard/contratos/${contrato.id}/periodo/${p.id}`}
                      className={`
                        flex flex-col items-center px-3 py-2 rounded-xl border text-center transition-all
                        hover:shadow-sm hover:border-gray-300
                        ${isActual ? 'ring-2 ring-gray-900 border-gray-900' : 'border-gray-200'}
                      `}
                    >
                      <span className="text-xs font-medium text-gray-700">{p.mes.slice(0, 3)}</span>
                      <span className={`mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${estadoBadgeColor(p.estado)}`}>
                        {ESTADO_LABEL[p.estado as EstadoPeriodo] ?? p.estado}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </Card>
          )}

          {/* ── Contract info card ── */}
          <Card className="bg-gray-50">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Contrato activo</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  N.o {contrato.numero}-{contrato.anio}
                </p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{contrato.objeto}</p>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <p className="text-xs text-gray-400">Valor mensual</p>
                <p className="text-sm font-bold text-gray-900">{fmt(contrato.valor_mensual)}</p>
              </div>
            </div>
            {contrato.supervisor && (
              <p className="text-xs text-gray-400 mt-3">
                Supervisor: <span className="text-gray-600">{contrato.supervisor.nombre_completo}</span>
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Mini stat card ──────────────────────────────────────────

function MiniStat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'emerald' | 'blue' | 'amber' | 'gray'
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    gray: 'bg-gray-50 text-gray-700',
  }

  return (
    <div className={`rounded-2xl p-4 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
