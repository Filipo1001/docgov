'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getPendientesRevisor,
  type PeriodoPendienteRevisor,
} from '@/services/dashboard'
import { MESES } from '@/lib/constants'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'

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

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

// ─── Role config ─────────────────────────────────────────────

interface RolConfig {
  titulo: string
  estadoFiltro: string
  emptyMsg: string
}

const rolConfigs: Record<string, RolConfig> = {
  asesor: {
    titulo: 'Revision juridica',
    estadoFiltro: 'enviado',
    emptyMsg: 'No hay periodos pendientes de revision juridica.',
  },
  gobierno: {
    titulo: 'Revision de gobierno',
    estadoFiltro: 'enviado',
    emptyMsg: 'No hay periodos pendientes de revision de gobierno.',
  },
  hacienda: {
    titulo: 'Hacienda',
    estadoFiltro: 'enviado',
    emptyMsg: 'No hay periodos pendientes de aprobacion de hacienda.',
  },
}

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-xl w-72" />
      <div className="h-5 bg-gray-100 rounded w-48" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────

export default function ReviewerHome({
  nombre,
  rol,
}: {
  nombre: string
  rol: string
}) {
  const [pendientes, setPendientes] = useState<PeriodoPendienteRevisor[]>([])
  const [cargando, setCargando] = useState(true)

  const firstName = nombre.split(' ')[0]
  const config = rolConfigs[rol] ?? rolConfigs.asesor

  useEffect(() => {
    getPendientesRevisor(config.estadoFiltro).then(p => {
      setPendientes(p)
      setCargando(false)
    })
  }, [config.estadoFiltro])

  if (cargando) return <Skeleton />

  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const urgentes = pendientes.filter(p => p.dias_espera >= 5)
  const normales = pendientes.filter(p => p.dias_espera < 5)

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <PageHeader
        title={`${saludo()}, ${firstName}`}
        subtitle={fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}
        action={
          <Link
            href="/dashboard/informes"
            className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2"
          >
            📅 {mesActualNombre()}
          </Link>
        }
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-2xl p-4 ${pendientes.length > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
          <p className={`text-2xl font-bold ${pendientes.length > 0 ? 'text-amber-700' : 'text-gray-700'}`}>
            {pendientes.length}
          </p>
          <p className="text-xs text-gray-500">Pendientes de revision</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-4">
          <p className="text-2xl font-bold text-emerald-700">
            {urgentes.length > 0 ? urgentes.length : '0'}
          </p>
          <p className="text-xs text-gray-500">
            {urgentes.length > 0 ? 'Urgentes (+5 dias)' : 'Urgentes'}
          </p>
        </div>
      </div>

      {/* ── Empty state ── */}
      {pendientes.length === 0 && (
        <Card>
          <EmptyState
            icon="🎉"
            title="Todo al dia"
            description={config.emptyMsg}
            action={{ href: '/dashboard/informes', label: `Ver ${mesActualNombre()} →` }}
          />
        </Card>
      )}

      {/* ── Urgent periods ── */}
      {urgentes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🚨</span>
            <h2 className="font-semibold text-gray-900 text-sm">Requieren atencion</h2>
            <span className="ml-auto text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-medium">
              {urgentes.length} con +5 dias
            </span>
          </div>
          <div className="space-y-2">
            {urgentes.map(p => <PendienteCard key={p.id} periodo={p} />)}
          </div>
        </section>
      )}

      {/* ── Normal periods ── */}
      {normales.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📋</span>
            <h2 className="font-semibold text-gray-900 text-sm">Pendientes de revision</h2>
            <span className="ml-auto text-xs text-gray-500">
              {normales.length} periodo{normales.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {normales.map(p => <PendienteCard key={p.id} periodo={p} />)}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Pending period card ─────────────────────────────────────

function PendienteCard({ periodo }: { periodo: PeriodoPendienteRevisor }) {
  const isUrgent = periodo.dias_espera >= 5

  return (
    <Link
      href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
      className={`
        block rounded-2xl border p-3.5 sm:p-4 transition-all hover:shadow-sm
        ${isUrgent
          ? 'bg-red-50 border-red-200 hover:border-red-300'
          : 'bg-white border-gray-200 hover:border-gray-300'
        }
      `}
    >
      <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{periodo.contratista_nombre}</p>
          <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
            Cto. {periodo.contrato_numero}
            {periodo.dependencia_nombre && (
              <span className="hidden sm:inline"> · {periodo.dependencia_nombre}</span>
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs sm:text-sm font-bold text-gray-900">{fmt(periodo.valor_cobro)}</p>
          <p className="text-[11px] sm:text-xs text-gray-500">
            {periodo.mes.charAt(0) + periodo.mes.slice(1, 3).toLowerCase()}. {periodo.anio}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[11px] sm:text-xs">
        <span className={`px-2 py-0.5 rounded-full font-medium ${
          isUrgent
            ? 'bg-red-100 text-red-700'
            : periodo.dias_espera >= 2
              ? 'bg-amber-100 text-amber-700'
              : 'bg-gray-100 text-gray-600'
        }`}>
          {periodo.dias_espera === 0 ? 'Hoy' : `${periodo.dias_espera}d esperando`}
        </span>
        <span className="text-gray-400 ml-auto">Ver detalle →</span>
      </div>
    </Link>
  )
}
