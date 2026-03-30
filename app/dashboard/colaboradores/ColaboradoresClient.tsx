'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUsuario } from '@/lib/user-context'
import type { ColaboradorListItem } from '@/services/supervisor'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import FilterTabs from '@/components/ui/FilterTabs'
import EmptyState from '@/components/ui/EmptyState'

// ── Helpers ──────────────────────────────────────────────────

function ProgressBar({ aprobados, total }: { aprobados: number; total: number }) {
  const pct = total > 0 ? Math.round((aprobados / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 font-medium tabular-nums">
        {aprobados}/{total}
      </span>
    </div>
  )
}

function EstadoBadge({ item }: { item: ColaboradorListItem }) {
  if (!item.activado) {
    return <Badge variant="gray">Sin cuenta</Badge>
  }
  if (!item.tiene_contrato) {
    return <Badge variant="gray">Sin contrato</Badge>
  }
  if (!item.contrato_activo) {
    return <Badge variant="amber">Contrato vencido</Badge>
  }
  if (item.contrato_activo.resumen.pendientes > 0) {
    return <Badge variant="amber">{item.contrato_activo.resumen.pendientes} por revisar</Badge>
  }
  return <Badge variant="emerald">Activo</Badge>
}

// ── Filters ─────────────────────────────────────────────────

type Filtro = 'todos' | 'contratados' | 'sin_contrato' | 'pendientes'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'contratados', label: 'Contratados' },
  { key: 'pendientes', label: 'Por revisar' },
  { key: 'sin_contrato', label: 'Sin contrato' },
]

function aplicarFiltro(items: ColaboradorListItem[], filtro: Filtro): ColaboradorListItem[] {
  switch (filtro) {
    case 'contratados':
      return items.filter((i) => i.tiene_contrato)
    case 'sin_contrato':
      return items.filter((i) => !i.tiene_contrato)
    case 'pendientes':
      return items.filter((i) => (i.contrato_activo?.resumen.pendientes ?? 0) > 0)
    default:
      return items
  }
}

// ── Page ─────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const [personas, setPersonas] = useState<ColaboradorListItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  useEffect(() => {
    if (!usuario) return
    fetch('/api/supervisor/colaboradores')
      .then((r) => r.json())
      .then((data) => {
        setPersonas(Array.isArray(data) ? data : [])
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [usuario])

  if (cargandoUser || cargando) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-64" />
        <div className="h-10 bg-gray-200 rounded-xl w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 bg-gray-200 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!usuario || usuario.rol !== 'supervisor') {
    return (
      <Card className="p-12 text-center">
        <p className="text-gray-500">Solo los supervisores pueden acceder a esta seccion.</p>
      </Card>
    )
  }

  // Apply search + filter
  let resultado = personas
  if (busqueda) {
    const q = busqueda.toLowerCase()
    resultado = resultado.filter(
      (p) =>
        p.nombre_completo.toLowerCase().includes(q) ||
        (p.cedula ?? '').includes(q)
    )
  }
  resultado = aplicarFiltro(resultado, filtro)

  const totalContratados = personas.filter((p) => p.tiene_contrato).length
  const totalSinContrato = personas.filter((p) => !p.tiene_contrato).length
  const totalPendientes = personas.filter(
    (p) => (p.contrato_activo?.resumen.pendientes ?? 0) > 0
  ).length

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Mis colaboradores"
        subtitle={`${personas.length} personas en tu dependencia`}
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total" value={personas.length} color="gray" />
        <StatCard label="Contratados" value={totalContratados} color="emerald" />
        <StatCard label="Con informes pendientes" value={totalPendientes} color="amber" />
        <StatCard label="Sin contrato" value={totalSinContrato} color="gray" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por nombre o cedula..."
        />
        <FilterTabs<Filtro>
          options={FILTROS}
          value={filtro}
          onChange={setFiltro}
        />
      </div>

      {/* Empty state */}
      {resultado.length === 0 && (
        <Card>
          <EmptyState
            icon={busqueda || filtro !== 'todos' ? '🔍' : '👥'}
            title={busqueda || filtro !== 'todos' ? 'Sin resultados' : 'Sin colaboradores'}
            description={
              busqueda || filtro !== 'todos'
                ? 'No hay personas que coincidan con tu busqueda.'
                : 'No se encontraron personas en tu dependencia.'
            }
          />
        </Card>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {resultado.map((p) => (
          <Link
            key={p.usuario_id ?? p.importado_id}
            href={`/dashboard/colaboradores/${p.usuario_id ?? p.importado_id}`}
            className={`bg-white rounded-2xl border p-5 hover:shadow-sm transition-all group ${
              (p.contrato_activo?.resumen.pendientes ?? 0) > 0
                ? 'border-amber-200 hover:border-amber-300'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {/* Top: avatar + name */}
            <div className="flex items-start gap-3 mb-3">
              <Avatar foto={p.foto_url} nombre={p.nombre_completo} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 leading-tight group-hover:text-emerald-700 transition-colors text-sm">
                  {p.nombre_completo}
                </p>
                {p.cedula && (
                  <p className="text-xs text-gray-400 mt-0.5">C.C. {p.cedula}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{p.cargo}</p>
              </div>
            </div>

            {/* Contract info (if any) */}
            {p.contrato_activo ? (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-2">
                  <span className="font-medium text-gray-700">
                    Contrato N.o {p.contrato_activo.numero}
                  </span>
                  <span className="mx-1.5">·</span>
                  <span>
                    {p.contrato_activo.fecha_inicio?.slice(0, 7)} a{' '}
                    {p.contrato_activo.fecha_fin?.slice(0, 7)}
                  </span>
                </div>
                <ProgressBar
                  aprobados={p.contrato_activo.resumen.aprobados}
                  total={p.contrato_activo.resumen.total}
                />
              </div>
            ) : p.tiene_contrato ? (
              <div className="text-xs text-gray-400 mb-3">
                {p.num_contratos} contrato{p.num_contratos !== 1 ? 's' : ''} anteriores
              </div>
            ) : (
              <div className="text-xs text-gray-300 mb-3 italic">
                Sin contratos registrados
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between">
              <EstadoBadge item={p} />
              <span className="text-xs text-gray-400 group-hover:text-emerald-600 transition-colors">
                Ver perfil →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
