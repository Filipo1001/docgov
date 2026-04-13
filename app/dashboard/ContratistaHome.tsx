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

// ─── Action panel ─────────────────────────────────────────────

function PanelAccion({
  periodoActual,
  contratoId,
}: {
  periodoActual: DashboardContratista['periodoActual']
  contratoId: string
}) {
  const mes = mesActualNombre()

  // Sin periodo activo — CTA para subir evidencias
  if (!periodoActual) {
    return (
      <Link href={`/dashboard/contratos/${contratoId}`} className="block group">
        <div className="relative rounded-2xl border border-dashed border-gray-300 bg-gray-50 hover:bg-white hover:border-gray-400 transition-all duration-200 p-6">
          <div className="flex items-center gap-5">
            {/* Upload icon */}
            <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Subir evidencias de {mes}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                El periodo de este mes esta listo para que registres tus actividades
              </p>
            </div>
            {/* Arrow */}
            <div className="ml-auto flex-shrink-0 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  const base = `/dashboard/contratos/${contratoId}/periodo/${periodoActual.id}`
  const estado = periodoActual.estado

  // Borrador — pendiente de completar
  if (estado === 'borrador') {
    return (
      <Link href={base} className="block group">
        <div className="relative rounded-2xl border border-dashed border-gray-300 bg-gray-50 hover:bg-white hover:border-gray-400 transition-all duration-200 p-6">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Subir evidencias de {mes}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Registra tus actividades y envia tu cuenta de cobro
              </p>
            </div>
            <div className="ml-auto flex-shrink-0 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Rechazado
  if (estado === 'rechazado') {
    return (
      <Link href={base} className="block group">
        <div className="rounded-2xl border border-red-200 bg-red-50 hover:bg-red-50/70 transition-all p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-red-100 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-red-900">Informe rechazado</p>
                <StatusChip estado={estado} />
              </div>
              {periodoActual.motivo_rechazo && (
                <p className="text-xs text-red-700 mt-1 line-clamp-2">{periodoActual.motivo_rechazo}</p>
              )}
              <p className="text-xs text-red-500 mt-2 font-medium group-hover:underline">Corregir y reenviar →</p>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Enviado / En revision — estado informativo
  if (estado === 'enviado' || estado === 'revision') {
    return (
      <Link href={base} className="block group">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 hover:bg-blue-50 transition-all p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900">Informe de {mes}</p>
                <StatusChip estado={estado} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">En revision — te notificaremos cuando este listo</p>
            </div>
            <div className="text-gray-300 group-hover:text-gray-400 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Aprobado / Radicado
  if (estado === 'aprobado' || estado === 'radicado') {
    return (
      <Link href={base} className="block group">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 transition-all p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-emerald-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900">Informe de {mes}</p>
                <StatusChip estado={estado} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {fmt(periodoActual.valor_cobro)} · {estado === 'radicado' ? 'Radicado fisicamente' : 'Aprobado'}
              </p>
            </div>
            <div className="text-gray-300 group-hover:text-gray-400 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Fallback genérico
  return (
    <Link href={base} className="block group">
      <div className="rounded-2xl border border-gray-200 bg-gray-50 hover:bg-white transition-all p-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">Informe de {mes}</p>
              <StatusChip estado={estado} />
            </div>
          </div>
          <div className="text-gray-300 group-hover:text-gray-400 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Status chip ──────────────────────────────────────────────

function StatusChip({ estado }: { estado: string }) {
  const label = ESTADO_LABEL[estado as EstadoPeriodo] ?? estado
  const color = estadoBadgeColor(estado)
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${color}`}>
      {label}
    </span>
  )
}

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-xl w-72" />
      <div className="h-5 bg-gray-100 rounded w-48" />
      <div className="h-24 bg-gray-200 rounded-2xl" />
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
  const mes = mesActualNombre()

  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <PageHeader
        title={`${saludo()}, ${firstName}`}
        subtitle={fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}
        action={
          periodoActual && contrato ? (
            <Link
              href={`/dashboard/contratos/${contrato.id}/periodo/${periodoActual.id}`}
              className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              {mes}
            </Link>
          ) : contrato ? (
            <Link
              href={`/dashboard/contratos/${contrato.id}`}
              className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition"
            >
              Mi contrato
            </Link>
          ) : undefined
        }
      />

      {/* ── No contract fallback ── */}
      {!contrato && (
        <Card>
          <div className="text-center py-12">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Sin contrato activo</h3>
            <p className="text-sm text-gray-500">No tienes contratos asignados en este momento.</p>
          </div>
        </Card>
      )}

      {contrato && (
        <>
          {/* ── Action panel ── */}
          <PanelAccion periodoActual={periodoActual} contratoId={contrato.id} />

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

              <div className={`w-full h-2.5 rounded-full ${progressBg(progreso.porcentaje)}`}>
                <div
                  className={`h-2.5 rounded-full transition-all duration-700 ${progressColor(progreso.porcentaje)}`}
                  style={{ width: `${progreso.porcentaje}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                <span>{contrato.fecha_inicio}</span>
                <span className="text-gray-600 font-medium">
                  {progreso.diasTranscurridos} de {progreso.diasTotales} dias
                </span>
                <span>{contrato.fecha_fin}</span>
              </div>
            </Card>
          )}

          {/* ── Period history ── */}
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
                      <span className="text-xs font-medium text-gray-700">
                        {p.mes.charAt(0).toUpperCase() + p.mes.slice(1, 3).toLowerCase()}
                      </span>
                      <span className={`mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${estadoBadgeColor(p.estado)}`}>
                        {ESTADO_LABEL[p.estado as EstadoPeriodo] ?? p.estado}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </Card>
          )}

          {/* ── Contract info ── */}
          <Card className="bg-gray-50/60">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Contrato activo</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  N.o {contrato.numero}-{contrato.anio}
                </p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{contrato.objeto}</p>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <p className="text-[11px] text-gray-400">Valor mensual</p>
                <p className="text-sm font-bold text-gray-900">{fmt(contrato.valor_mensual)}</p>
              </div>
            </div>
            {contrato.supervisor && (
              <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-200">
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
