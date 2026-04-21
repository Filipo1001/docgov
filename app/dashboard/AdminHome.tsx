'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getAdminPipeline,
  getActividadReciente,
  type PipelineStats,
  type ActividadReciente,
} from '@/services/dashboard'
import { MESES } from '@/lib/constants'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'

// ─── Helpers ──────────────────────────────────────────────────

function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos dias'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function mesActualNombre(): string {
  return MESES[new Date().getMonth()]
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `hace ${days}d`
}

const activityConfig: Record<string, { icon: string; label: string; color: string }> = {
  enviado:   { icon: '📤', label: 'envio informe',  color: 'text-blue-600' },
  aprobado:  { icon: '✅', label: 'aprobado',       color: 'text-emerald-600' },
  rechazado: { icon: '❌', label: 'rechazado',      color: 'text-red-600' },
  radicado:  { icon: '📁', label: 'radicado',       color: 'text-indigo-600' },
}

// ─── Pipeline stage ──────────────────────────────────────────

function PipelineStage({
  label,
  value,
  color,
  isLast,
}: {
  label: string
  value: number
  color: string
  isLast?: boolean
}) {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <div className={`flex flex-col items-center rounded-xl px-2 sm:px-3 py-2 sm:py-2.5 min-w-[56px] sm:min-w-[72px] ${color}`}>
        <span className="text-lg sm:text-xl font-bold">{value}</span>
        <span className="text-[9px] sm:text-[10px] font-medium mt-0.5 text-center leading-tight">{label}</span>
      </div>
      {!isLast && (
        <div className="text-gray-300 text-sm sm:text-lg px-0.5">→</div>
      )}
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-xl w-72" />
      <div className="h-5 bg-gray-100 rounded w-48" />
      <div className="flex gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 w-20 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="h-64 bg-gray-200 rounded-2xl" />
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────

export default function AdminHome({
  nombre,
}: {
  nombre: string
}) {
  const [pipeline, setPipeline] = useState<PipelineStats | null>(null)
  const [actividad, setActividad] = useState<ActividadReciente[]>([])
  const [cargando, setCargando] = useState(true)

  const firstName = nombre.split(' ')[0]

  useEffect(() => {
    Promise.all([getAdminPipeline(), getActividadReciente()]).then(([p, a]) => {
      setPipeline(p)
      setActividad(a)
      setCargando(false)
    })
  }, [])

  if (cargando || !pipeline) return <Skeleton />

  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const totalEnProceso = pipeline.enviado + pipeline.revision

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <PageHeader
        title={`${saludo()}, ${firstName}`}
        subtitle={fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}
        action={
          <div className="flex gap-2 w-full sm:w-auto">
            <Link
              href="/dashboard/contratos/nuevo"
              className="flex-1 sm:flex-none text-center bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition"
            >
              + Nuevo contrato
            </Link>
            <Link
              href="/dashboard/informes"
              className="flex-1 sm:flex-none text-center bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              📅 {mesActualNombre()}
            </Link>
          </div>
        }
      />

      {/* ── Pipeline overview ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Pipeline de periodos</h3>
          <span className="text-xs text-gray-400">{pipeline.totalContratos} contratos activos</span>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          <PipelineStage label="Borrador" value={pipeline.borrador} color="bg-gray-100 text-gray-700" />
          <PipelineStage label="Enviado" value={pipeline.enviado} color="bg-blue-50 text-blue-700" />
          <PipelineStage label="Revision" value={pipeline.revision} color="bg-indigo-50 text-indigo-700" />
          <PipelineStage label="Aprobado" value={pipeline.aprobado} color="bg-emerald-50 text-emerald-700" />
          <PipelineStage label="Radicado" value={pipeline.radicado} color="bg-emerald-100 text-emerald-800" isLast />
        </div>
        {pipeline.rechazado > 0 && (
          <p className="text-xs text-red-500 mt-3 font-medium">
            ⚠ {pipeline.rechazado} periodo{pipeline.rechazado !== 1 ? 's' : ''} rechazado{pipeline.rechazado !== 1 ? 's' : ''}
          </p>
        )}
      </Card>

      {/* ── Quick stats row ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Link href="/dashboard/contratos" className="block">
          <div className="bg-gray-50 rounded-2xl p-3 sm:p-4 hover:bg-gray-100 transition">
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{pipeline.totalContratos}</p>
            <p className="text-[11px] sm:text-xs text-gray-500">Contratos</p>
          </div>
        </Link>
        <Link href="/dashboard/informes" className="block">
          <div className="bg-amber-50 rounded-2xl p-3 sm:p-4 hover:bg-amber-100 transition">
            <p className="text-xl sm:text-2xl font-bold text-amber-700">{totalEnProceso}</p>
            <p className="text-[11px] sm:text-xs text-gray-500">En proceso</p>
          </div>
        </Link>
        <Link href="/dashboard/informes" className="block">
          <div className="bg-emerald-50 rounded-2xl p-3 sm:p-4 hover:bg-emerald-100 transition">
            <p className="text-xl sm:text-2xl font-bold text-emerald-700">{pipeline.aprobado + pipeline.radicado}</p>
            <p className="text-[11px] sm:text-xs text-gray-500">Completados</p>
          </div>
        </Link>
      </div>

      {/* ── Recent activity ── */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Actividad reciente</h3>
        {actividad.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin actividad reciente</p>
        ) : (
          <div className="space-y-3">
            {actividad.map(a => {
              const cfg = activityConfig[a.tipo] ?? activityConfig.enviado
              return (
                <Link
                  key={a.id}
                  href={`/dashboard/contratos/${a.contrato_id}/periodo/${a.periodo_id}`}
                  className="flex items-start gap-2.5 sm:gap-3 group hover:bg-gray-50 -mx-2 px-2 py-2 rounded-xl transition"
                >
                  <span className="text-base sm:text-lg flex-shrink-0 mt-0.5">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm text-gray-900 group-hover:text-gray-700">
                      <span className="font-medium">{a.contratista_nombre.split(' ').slice(0, 2).join(' ')}</span>
                      {' — '}
                      <span className={cfg.color}>{cfg.label}</span>
                    </p>
                    <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
                      Cto. {a.contrato_numero} · {a.mes} {a.anio}
                    </p>
                  </div>
                  <span className="text-[11px] sm:text-xs text-gray-400 flex-shrink-0 mt-1">{timeAgo(a.fecha)}</span>
                </Link>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Quick access ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/dashboard/contratos/nuevo" className="block">
          <Card className="hover:border-gray-300 transition-colors group h-full">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
              <span className="text-xl">➕</span>
            </div>
            <h3 className="font-medium text-gray-900 text-sm">Registrar contrato</h3>
            <p className="text-xs text-gray-500 mt-1">Crear un nuevo contrato</p>
          </Card>
        </Link>
        <Link href="/dashboard/admin/usuarios" className="block">
          <Card className="hover:border-gray-300 transition-colors group h-full">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
              <span className="text-xl">👥</span>
            </div>
            <h3 className="font-medium text-gray-900 text-sm">Usuarios</h3>
            <p className="text-xs text-gray-500 mt-1">Gestionar usuarios del sistema</p>
          </Card>
        </Link>
        <Link href="/dashboard/admin/firmas" className="block">
          <Card className="hover:border-gray-300 transition-colors group h-full">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
              <span className="text-xl">✍️</span>
            </div>
            <h3 className="font-medium text-gray-900 text-sm">Firmas</h3>
            <p className="text-xs text-gray-500 mt-1">Gestionar firmas de contratistas</p>
          </Card>
        </Link>
        <Link href="/dashboard/admin/historicos" className="block">
          <Card className="hover:border-gray-300 transition-colors group h-full">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors">
              <span className="text-xl">🔒</span>
            </div>
            <h3 className="font-medium text-gray-900 text-sm">Historicos</h3>
            <p className="text-xs text-gray-500 mt-1">Marcar periodos como historicos</p>
          </Card>
        </Link>
      </div>
    </div>
  )
}
