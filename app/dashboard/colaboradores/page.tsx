'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUsuario } from '@/lib/user-context'
import type { ColaboradorListItem } from '@/services/supervisor'

// ─── Helpers ──────────────────────────────────────────────────

function Avatar({ foto, nombre }: { foto?: string | null; nombre: string }) {
  const initials = nombre
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  if (foto) {
    return (
      <img
        src={foto}
        alt={nombre}
        className="w-14 h-14 rounded-full object-cover ring-2 ring-white shadow-md"
      />
    )
  }

  return (
    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-base font-bold text-white ring-2 ring-white shadow-md">
      {initials}
    </div>
  )
}

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
    return (
      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-400">
        Sin cuenta
      </span>
    )
  }
  if (!item.tiene_contrato) {
    return (
      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-500">
        Sin contrato
      </span>
    )
  }
  if (!item.contrato_activo) {
    return (
      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-orange-100 text-orange-600">
        Contrato vencido
      </span>
    )
  }
  if (item.contrato_activo.resumen.pendientes > 0) {
    return (
      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
        {item.contrato_activo.resumen.pendientes} por revisar
      </span>
    )
  }
  return (
    <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700">
      Activo
    </span>
  )
}

// ─── Filters ─────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────

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
      <div className="bg-white rounded-2xl border p-12 text-center">
        <p className="text-gray-500">Solo los supervisores pueden acceder a esta seccion.</p>
      </div>
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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Mis colaboradores</h2>
        <p className="text-sm text-gray-400 mt-1">
          {personas.length} personas en tu dependencia
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-2xl font-bold text-gray-900">{personas.length}</p>
          <p className="text-xs text-gray-400">Total</p>
        </div>
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-2xl font-bold text-emerald-600">{totalContratados}</p>
          <p className="text-xs text-gray-400">Contratados</p>
        </div>
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-2xl font-bold text-amber-600">{totalPendientes}</p>
          <p className="text-xs text-gray-400">Con informes pendientes</p>
        </div>
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-2xl font-bold text-gray-400">{totalSinContrato}</p>
          <p className="text-xs text-gray-400">Sin contrato</p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o cedula..."
          className="flex-1 max-w-md px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                filtro === f.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {resultado.length === 0 && (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <div className="text-4xl mb-3">
            {busqueda || filtro !== 'todos' ? '🔍' : '👥'}
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">
            {busqueda || filtro !== 'todos' ? 'Sin resultados' : 'Sin colaboradores'}
          </h3>
          <p className="text-sm text-gray-500">
            {busqueda || filtro !== 'todos'
              ? 'No hay personas que coincidan con tu busqueda.'
              : 'No se encontraron personas en tu dependencia.'}
          </p>
        </div>
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
              <Avatar foto={p.foto_url} nombre={p.nombre_completo} />
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
