'use client'

/**
 * /dashboard/contratos
 *
 * Lista de contratos paginada con TanStack Query + virtualización.
 *
 *  - useInfiniteQuery: carga 30 contratos por página, auto-fetch al scroll
 *  - useWindowVirtualizer: renderiza solo lo visible (manejable con sidebar fijo)
 *  - Filtros estructurados (dependencia, supervisor, rango, vigencia) → queryKey
 *  - Búsqueda: debounce 300 ms → queryKey
 *  - "Solo incompletos" → post-filter client-side sobre páginas cargadas
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useUsuario } from '@/lib/user-context'
import { formatCedula } from '@/lib/format'
import {
  getContratosPagina,
  type ContratoListItem,
  type FiltrosContratos,
} from '@/services/contratos'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ContratistaInfo = NonNullable<ContratoListItem['contratista']>

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-800 break-all">{value}</p>
      </div>
    </div>
  )
}

function VerUsuarioModal({
  contratista,
  onClose,
}: {
  contratista: ContratistaInfo
  onClose: () => void
}) {
  const initials = contratista.nombre_completo
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const emailVisible =
    contratista.email && !contratista.email.endsWith('@pendiente.local')
      ? contratista.email
      : null

  const tieneCuenta = contratista.banco || contratista.tipo_cuenta || contratista.numero_cuenta

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header ─ photo + name */}
        <div className="bg-gray-50 border-b border-gray-100 px-6 py-5 flex items-center gap-4">
          {contratista.foto_url ? (
            <img
              src={contratista.foto_url}
              alt={contratista.nombre_completo}
              className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow-sm shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-500 ring-2 ring-white shadow-sm shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-tight">{contratista.nombre_completo}</p>
            {contratista.cedula && (
              <p className="text-sm text-gray-500 font-mono mt-0.5">{formatCedula(contratista.cedula)}</p>
            )}
            {contratista.cargo && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{contratista.cargo}</p>
            )}
          </div>
          {/* Close */}
          <button
            onClick={onClose}
            className="ml-auto shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info rows */}
        <div className="px-6 py-5 space-y-4">
          <InfoRow icon="📧" label="Correo electrónico" value={emailVisible ?? '—'} />
          <InfoRow icon="📱" label="Celular" value={contratista.telefono ?? '—'} />

          {tieneCuenta && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cuenta bancaria</p>
                <div className="space-y-4">
                  <InfoRow icon="🏦" label="Banco" value={contratista.banco ?? '—'} />
                  <InfoRow
                    icon="💳"
                    label="Tipo · Número"
                    value={`${contratista.tipo_cuenta ?? '—'} · ${contratista.numero_cuenta ?? '—'}`}
                  />
                </div>
              </div>
            </>
          )}

          {/* Firma preview */}
          {contratista.firma_url && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 mb-2">Firma registrada</p>
              <img
                src={contratista.firma_url}
                alt="Firma"
                className="h-10 object-contain opacity-70"
              />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/60">
          <Link
            href={`/dashboard/admin/usuarios/${contratista.id}`}
            onClick={onClose}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Editar perfil →
          </Link>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function formatCOP(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-CO')}`
}

const RANGOS = [
  { label: 'Todos los valores',       min: 0,         max: Infinity },
  { label: 'Hasta $3.000.000',        min: 0,         max: 3_000_000 },
  { label: '$3.000.001 – $6.000.000', min: 3_000_001, max: 6_000_000 },
  { label: '$6.000.001 – $9.000.000', min: 6_000_001, max: 9_000_000 },
  { label: 'Más de $9.000.000',       min: 9_000_001, max: Infinity },
]

/** Debounced value hook */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContratosPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const esAdmin = usuario?.rol === 'admin'
  const hoy = new Date().toISOString().split('T')[0]

  // ── Modal state ────────────────────────────────────────────────
  const [viendoUsuario, setViendoUsuario] = useState<ContratistaInfo | null>(null)

  // ── Filters ────────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('')
  const [filtroDep, setFiltroDep] = useState('')
  const [filtroSup, setFiltroSup] = useState('')
  const [filtroRango, setFiltroRango] = useState(0)
  const [soloIncompletos, setSoloInc] = useState(false)
  const [filtroVigencia, setFiltroVig] = useState<'todos' | 'vigentes' | 'vencidos'>('todos')

  const busquedaDebounced = useDebounced(busqueda, 300)

  const filtros = useMemo<FiltrosContratos>(() => {
    const r = RANGOS[filtroRango]
    return {
      q: busquedaDebounced || undefined,
      dependenciaId: filtroDep || undefined,
      supervisorId: filtroSup || undefined,
      rangoMin: r.min > 0 ? r.min : undefined,
      rangoMax: Number.isFinite(r.max) ? r.max : undefined,
      vigencia: filtroVigencia,
    }
  }, [busquedaDebounced, filtroDep, filtroSup, filtroRango, filtroVigencia])

  // ── Infinite query ─────────────────────────────────────────────
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['contratos', usuario?.id, usuario?.rol, filtros],
    queryFn: ({ pageParam }) =>
      getContratosPagina({
        pageParam,
        rol: usuario!.rol,
        userId: usuario!.id,
        filtros,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: !!usuario,
  })

  // ── Flatten + post-filter (solo incompletos) ──────────────────
  const todosCargados = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  )
  const total = data?.pages[0]?.total ?? 0

  function datosFaltantes(c: ContratoListItem): string[] {
    if (!esAdmin || !c.contratista) return []
    const f: string[] = []
    const u = c.contratista
    if (!u.email || u.email.endsWith('@pendiente.local')) f.push('Email')
    if (!u.telefono) f.push('Celular')
    if (!u.cargo) f.push('Cargo')
    if (!u.foto_url) f.push('Foto')
    if (!u.firma_url) f.push('Firma')
    if (!u.banco || !u.tipo_cuenta || !u.numero_cuenta) f.push('Cuenta bancaria')
    return f
  }

  const visibles = useMemo(() => {
    if (!soloIncompletos) return todosCargados
    return todosCargados.filter((c) => datosFaltantes(c).length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosCargados, soloIncompletos, esAdmin])

  // ── Derived filter options (solo de lo cargado) ───────────────
  const dependencias = useMemo(() => {
    const map = new Map<string, string>()
    todosCargados.forEach((c) => {
      if (c.dependencia?.id) map.set(c.dependencia.id, c.dependencia.nombre)
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [todosCargados])

  const supervisores = useMemo(() => {
    const map = new Map<string, string>()
    todosCargados.forEach((c) => {
      if (c.supervisor?.id) map.set(c.supervisor.id, c.supervisor.nombre_completo)
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [todosCargados])

  // ── Virtualization ────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useWindowVirtualizer({
    count: visibles.length,
    estimateSize: () => 132, // card avg height incl. gap
    overscan: 6,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  // ── Auto-load more via sentinel ───────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage || isFetchingNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchNextPage()
      },
      { rootMargin: '300px' },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // ── Misc ──────────────────────────────────────────────────────
  const hayFiltrosActivos =
    busqueda || filtroDep || filtroSup || filtroRango > 0 || soloIncompletos || filtroVigencia !== 'todos'

  function limpiarFiltros() {
    setBusqueda('')
    setFiltroDep('')
    setFiltroSup('')
    setFiltroRango(0)
    setSoloInc(false)
    setFiltroVig('todos')
  }

  // ── Render ────────────────────────────────────────────────────
  if (cargandoUser || (isLoading && !data)) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-48 mb-6" />
        {esAdmin && <div className="h-24 bg-gray-200 rounded-2xl" />}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-28 bg-gray-200 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-base font-semibold text-red-800 mb-2">No pudimos cargar los contratos</p>
        <p className="text-sm text-red-600 mb-4">Revisa tu conexión e intenta de nuevo.</p>
        <button
          onClick={() => refetch()}
          className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {esAdmin ? 'Contratos' : 'Mis contratos'}
        </h2>
        {esAdmin && (
          <Link
            href="/dashboard/contratos/nuevo"
            className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + Nuevo contrato
          </Link>
        )}
      </div>

      {/* ── Search + Filters (admin only) ───────────────────────── */}
      {esAdmin && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N.º de contrato u objeto…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={filtroDep}
              onChange={(e) => setFiltroDep(e.target.value)}
              className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroDep ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
            >
              <option value="">Todas las secretarías</option>
              {dependencias.map(([id, nombre]) => (
                <option key={id} value={id}>{nombre.replace(/^Secretaría\s+/i, 'Sec. ')}</option>
              ))}
            </select>

            <select
              value={filtroSup}
              onChange={(e) => setFiltroSup(e.target.value)}
              className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroSup ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
            >
              <option value="">Todos los supervisores</option>
              {supervisores.map(([id, nombre]) => (
                <option key={id} value={id}>{nombre.split(' ').slice(0, 2).join(' ')}</option>
              ))}
            </select>

            <select
              value={filtroRango}
              onChange={(e) => setFiltroRango(Number(e.target.value))}
              className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroRango > 0 ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
            >
              {RANGOS.map((r, i) => (
                <option key={i} value={i}>{r.label}</option>
              ))}
            </select>

            <div className="flex border border-gray-200 rounded-xl overflow-hidden text-sm">
              {(['todos', 'vigentes', 'vencidos'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setFiltroVig(v)}
                  className={`px-3 py-2 transition-colors ${filtroVigencia === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {v === 'todos' ? 'Todos' : v === 'vigentes' ? 'Vigentes' : 'Vencidos'}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSoloInc((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm transition-colors ${
                soloIncompletos
                  ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] ${soloIncompletos ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300'}`}>
                {soloIncompletos ? '✓' : ''}
              </span>
              Solo incompletos
            </button>

            {hayFiltrosActivos && (
              <button onClick={limpiarFiltros} className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline">
                Limpiar filtros
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400">
            {soloIncompletos
              ? `${visibles.length} incompletos cargados (de ${todosCargados.length} cargados / ${total} totales)`
              : hayFiltrosActivos
              ? `Mostrando ${todosCargados.length} de ${total} contratos`
              : `${total} contratos en total`}
          </p>
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────────── */}
      {total === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📄</span>
          </div>
          <h3 className="font-medium text-gray-900 mb-2">
            {esAdmin ? 'No hay contratos registrados' : 'No tienes contratos asignados'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {esAdmin
              ? 'Registra el primer contrato para comenzar a gestionar los pagos.'
              : 'Cuando el administrador te asigne un contrato, aparecerá aquí.'}
          </p>
          {esAdmin && (
            <Link
              href="/dashboard/contratos/nuevo"
              className="inline-block bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Registrar primer contrato
            </Link>
          )}
        </div>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border p-10 text-center">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm font-medium text-gray-700">Sin resultados</p>
          <p className="text-xs text-gray-400 mt-1">Prueba con otros filtros</p>
          <button onClick={limpiarFiltros} className="mt-3 text-sm text-gray-500 underline hover:text-gray-700">
            Limpiar filtros
          </button>
        </div>
      ) : (
        <>
          <div ref={listRef} style={{ position: 'relative' }}>
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const contrato = visibles[virtualRow.index]
                const faltantes = datosFaltantes(contrato)
                const incompleto = faltantes.length > 0
                const vencido = contrato.fecha_fin < hoy

                return (
                  <div
                    key={contrato.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - (listRef.current?.offsetTop ?? 0)}px)`,
                      paddingBottom: '12px',
                    }}
                  >
                    <div
                      className={`rounded-2xl border transition-colors ${
                        incompleto
                          ? 'bg-red-50 border-red-200 hover:border-red-300'
                          : 'bg-white hover:border-gray-300'
                      }`}
                    >
                      <Link
                        href={`/dashboard/contratos/${contrato.id}`}
                        className="block p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-2 mb-1.5">
                              <span className="text-sm font-bold text-gray-900 font-mono">
                                {contrato.numero}-{contrato.anio}
                              </span>
                              {contrato.dependencia?.abreviatura && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                  {contrato.dependencia.abreviatura}
                                </span>
                              )}
                              {vencido && (
                                <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                  Vencido
                                </span>
                              )}
                              {incompleto && (
                                <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                  Faltan: {faltantes.join(' · ')}
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-gray-600 line-clamp-1 mb-2">{contrato.objeto}</p>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                              <span className="font-medium text-gray-700">
                                {contrato.contratista?.nombre_completo?.split(' ').slice(0, 3).join(' ')}
                              </span>
                              {contrato.contratista?.cedula && (
                                <span className="font-mono">{contrato.contratista.cedula}</span>
                              )}
                              <span>
                                Sup: {contrato.supervisor?.nombre_completo?.split(' ').slice(0, 2).join(' ')}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-900">
                              {formatCOP(contrato.valor_mensual ?? 0)}
                              <span className="text-xs text-gray-400 font-normal">/mes</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatCOP(contrato.valor_total ?? 0)} total
                            </p>
                            <p className="text-xs text-gray-400">
                              {contrato.plazo_meses}m · {contrato.fecha_inicio?.slice(0, 7)}
                            </p>
                          </div>
                        </div>
                      </Link>

                      {/* Admin quick-action: ver usuario */}
                      {esAdmin && contrato.contratista && (
                        <div className="px-5 pb-3.5 flex justify-end -mt-1">
                          <button
                            onClick={() => setViendoUsuario(contrato.contratista!)}
                            className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors flex items-center gap-1"
                          >
                            Ver usuario
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6l6 6m0 0l-6 6m6-6H3" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sentinel + load-more indicator */}
          <div ref={sentinelRef} className="py-6 text-center">
            {isFetchingNextPage ? (
              <p className="text-sm text-gray-400">Cargando más contratos…</p>
            ) : hasNextPage ? (
              <button
                onClick={() => fetchNextPage()}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Cargar más
              </button>
            ) : todosCargados.length > 0 ? (
              <p className="text-xs text-gray-400">
                Se cargaron los {todosCargados.length} contratos
              </p>
            ) : null}
          </div>
        </>
      )}

      {/* Ver usuario modal */}
      {viendoUsuario && (
        <VerUsuarioModal
          contratista={viendoUsuario}
          onClose={() => setViendoUsuario(null)}
        />
      )}
    </div>
  )
}
