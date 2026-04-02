'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import { ESTADO_LABEL, ESTADO_COLOR, ESTADO_COLA_POR_ROL } from '@/lib/constants'
import type { Periodo } from '@/lib/types'
import { getPeriodosPendientesParaRol } from '@/services/periodos'
import { formatCedula } from '@/lib/format'
import { getPeriodosPendientesSupervisor, type PeriodoPendienteSupervisor } from '@/services/supervisor'
import { aprobarPeriodos, rechazarPeriodos } from '@/app/actions/periodos'

import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import FilterTabs from '@/components/ui/FilterTabs'
import EmptyState from '@/components/ui/EmptyState'

// ─── Shared helpers ───────────────────────────────────────────

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

function urgencyConfig(dias: number) {
  if (dias >= 5) return { border: 'border-red-200 bg-red-50', badge: 'bg-red-100 text-red-700', text: `${dias} dias -- Urgente` }
  if (dias >= 2) return { border: 'border-amber-200 bg-amber-50', badge: 'bg-amber-100 text-amber-700', text: `${dias} dias` }
  return { border: 'border-gray-200 bg-white', badge: 'bg-gray-100 text-gray-500', text: dias === 0 ? 'Hoy' : `${dias} dia${dias !== 1 ? 's' : ''}` }
}

// ─── Supervisor Approvals ─────────────────────────────────────

type SortKey = 'urgencia' | 'nombre' | 'valor'

function SupervisorAprobaciones({ userId }: { userId: string }) {
  const [periodos, setPeriodos] = useState<PeriodoPendienteSupervisor[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [rechazandoId, setRechazandoId] = useState<string | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [sort, setSort] = useState<SortKey>('urgencia')
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    const data = await getPeriodosPendientesSupervisor(userId)
    setPeriodos(data)
    setCargando(false)
  }, [userId])

  useEffect(() => { cargar() }, [cargar])

  async function handleAprobar(periodoId: string) {
    setProcesando(periodoId)
    const result = await aprobarPeriodos([periodoId])
    setProcesando(null)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Periodo aprobado')
      setPeriodos(prev => prev.filter(p => p.id !== periodoId))
    }
  }

  async function handleRechazar() {
    if (!rechazandoId || !motivoRechazo.trim()) return
    setProcesando(rechazandoId)
    const result = await rechazarPeriodos([rechazandoId], motivoRechazo.trim())
    setProcesando(null)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Periodo devuelto a asesores')
      setPeriodos(prev => prev.filter(p => p.id !== rechazandoId))
      setRechazandoId(null)
      setMotivoRechazo('')
    }
  }

  // Filter + sort
  const filtrados = periodos
    .filter(p => {
      if (!busqueda) return true
      const q = busqueda.toLowerCase()
      return (
        p.contrato.contratista.nombre_completo.toLowerCase().includes(q) ||
        p.contrato.numero.includes(q) ||
        p.mes.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sort === 'urgencia') return b.dias_espera - a.dias_espera
      if (sort === 'nombre') return a.contrato.contratista.nombre_completo.localeCompare(b.contrato.contratista.nombre_completo)
      if (sort === 'valor') return b.valor_cobro - a.valor_cobro
      return 0
    })

  const valorTotal = filtrados.reduce((s, p) => s + p.valor_cobro, 0)
  const maxDias = filtrados.length ? Math.max(...filtrados.map(p => p.dias_espera)) : 0

  if (cargando) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(3)].map((_, i) => <div key={i} className="h-44 bg-gray-200 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      {periodos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label={`Pendiente${filtrados.length !== 1 ? 's' : ''}`} value={filtrados.length} color="gray" />
          <StatCard label="Valor total" value={fmt(valorTotal)} color="blue" />
          <StatCard
            label="Mas antiguo"
            value={`${maxDias}d`}
            color={maxDias >= 5 ? 'red' : maxDias >= 2 ? 'amber' : 'gray'}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por contratista, contrato o mes..."
        />
        <FilterTabs<SortKey>
          options={[
            { key: 'urgencia', label: 'Urgencia' },
            { key: 'nombre', label: 'Nombre' },
            { key: 'valor', label: 'Valor' },
          ]}
          value={sort}
          onChange={setSort}
        />
      </div>

      {/* Empty state */}
      {filtrados.length === 0 && (
        <Card>
          <EmptyState
            icon="🎉"
            title="Todo al dia"
            description={busqueda ? 'No hay resultados para esa busqueda.' : 'No hay periodos pendientes de revision.'}
          />
        </Card>
      )}

      {/* Period cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtrados.map(p => {
          const urg = urgencyConfig(p.dias_espera)
          const c = p.contrato
          const isRechazando = rechazandoId === p.id

          return (
            <div key={p.id} className={`rounded-2xl border transition-all ${urg.border}`}>
              {/* Card header */}
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <Avatar foto={c.contratista.foto_url} nombre={c.contratista.nombre_completo} size="lg" />

                  <div className="flex-1 min-w-0">
                    {/* Name + value */}
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                      <div>
                        <p className="font-bold text-gray-900 text-sm leading-tight">{c.contratista.nombre_completo}</p>
                        <p className="text-xs text-gray-500">C.C. {formatCedula(c.contratista.cedula)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-bold text-gray-900">{fmt(p.valor_cobro)}</p>
                        <p className="text-xs text-gray-500 font-medium">
                          {p.mes} {p.anio}
                        </p>
                      </div>
                    </div>

                    {/* Contract info */}
                    <div className="flex items-center gap-2 mt-2 mb-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">Contrato N.o {c.numero}</span>
                      {c.dependencia?.abreviatura && (
                        <Badge variant="gray" size="xs">{c.dependencia.abreviatura}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">{c.objeto}</p>

                    {/* Meta row */}
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="text-gray-500">
                        <strong className="text-gray-700">{p.num_actividades}</strong> actividad{p.num_actividades !== 1 ? 'es' : ''}
                      </span>
                      <span className="text-gray-500">
                        <strong className="text-gray-700">{p.num_evidencias}</strong> foto{p.num_evidencias !== 1 ? 's' : ''}
                      </span>
                      {c.contratista.telefono && (
                        <span className="text-gray-500">{c.contratista.telefono}</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <Badge
                        variant={maxDias >= 5 ? 'red' : maxDias >= 2 ? 'amber' : 'gray'}
                        size="xs"
                      >
                        {urg.text}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {!isRechazando ? (
                <div className="px-5 pb-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-t border-gray-100 pt-4">
                  <Link
                    href={`/dashboard/contratos/${p.contrato_id}/periodo/${p.id}`}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Ver detalle completo
                  </Link>
                  <div className="flex-1" />
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => { setRechazandoId(p.id); setMotivoRechazo('') }}
                      disabled={!!procesando}
                      className="flex-1 sm:flex-none px-4 py-2 text-sm border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition disabled:opacity-50 font-medium"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleAprobar(p.id)}
                      disabled={!!procesando}
                      className="flex-1 sm:flex-none px-5 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 font-semibold flex items-center justify-center gap-2"
                    >
                      {procesando === p.id
                        ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : null}
                      {procesando === p.id ? 'Aprobando...' : 'Aprobar'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Rejection form */
                <div className="px-5 pb-5 border-t border-red-100 pt-4 bg-red-50/50 rounded-b-2xl">
                  <p className="text-xs font-semibold text-red-700 mb-2">Motivo del rechazo</p>
                  <textarea
                    value={motivoRechazo}
                    onChange={e => setMotivoRechazo(e.target.value)}
                    placeholder="Describe que debe corregir el contratista para que pueda reenviar..."
                    rows={3}
                    autoFocus
                    className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-red-400 bg-white"
                  />
                  <div className="flex flex-col sm:flex-row gap-3 mt-3">
                    <button
                      onClick={handleRechazar}
                      disabled={procesando === p.id || !motivoRechazo.trim()}
                      className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                    >
                      {procesando === p.id ? 'Rechazando...' : 'Confirmar rechazo'}
                    </button>
                    <button
                      onClick={() => { setRechazandoId(null); setMotivoRechazo('') }}
                      className="px-5 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-white transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Generic Approvals (asesor / gobierno / hacienda / admin) ─

const TITULO_POR_ROL: Record<string, string> = {
  asesor:   'Revision juridica',
  gobierno: 'Revision de gobierno',
  hacienda: 'Gestion de pagos',
  admin:    'Todas las aprobaciones pendientes',
}

function GenericAprobaciones({ rol, userId }: { rol: string; userId: string }) {
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarRechazo, setMostrarRechazo] = useState<Record<string, boolean>>({})
  const [motivoRechazo, setMotivoRechazo] = useState<Record<string, string>>({})
  const [procesando, setProcesando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const data = await getPeriodosPendientesParaRol(rol, userId)
    setPeriodos(data)
    setCargando(false)
  }, [rol, userId])

  useEffect(() => { cargar() }, [cargar])

  async function handleAprobar(periodoId: string) {
    setProcesando(periodoId)
    const result = await aprobarPeriodos([periodoId])
    if (result.error) toast.error(result.error)
    else {
      toast.success('Periodo aprobado')
      cargar()
    }
    setProcesando(null)
  }

  async function handleRechazar(periodoId: string) {
    const motivo = motivoRechazo[periodoId]?.trim()
    if (!motivo) { toast.error('Escribe el motivo del rechazo'); return }
    setProcesando(periodoId)
    const result = await rechazarPeriodos([periodoId], motivo)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Periodo devuelto a asesores')
      setMostrarRechazo(p => ({ ...p, [periodoId]: false }))
      setMotivoRechazo(p => ({ ...p, [periodoId]: '' }))
      cargar()
    }
    setProcesando(null)
  }

  if (cargando) return <p className="text-gray-500">Cargando...</p>

  return (
    <div>
      <PageHeader
        title={TITULO_POR_ROL[rol] ?? 'Aprobaciones'}
        subtitle={
          periodos.length === 0
            ? 'No hay periodos pendientes'
            : `${periodos.length} periodo${periodos.length !== 1 ? 's' : ''} esperando tu revision`
        }
      />

      {periodos.length === 0 ? (
        <Card>
          <EmptyState
            icon="✅"
            title="Todo al dia"
            description="No tienes periodos pendientes de revision."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {periodos.map(periodo => {
            const contrato = (periodo as any).contrato
            return (
              <Card key={periodo.id}>
                <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">Contrato N.o {contrato?.numero}</span>
                      {contrato?.dependencia?.abreviatura && (
                        <Badge variant="gray" size="xs">{contrato.dependencia.abreviatura}</Badge>
                      )}
                      <Badge
                        size="xs"
                        variant={
                          periodo.estado === 'aprobado' || periodo.estado === 'radicado' ? 'green'
                            : periodo.estado === 'revision' ? 'indigo'
                            : periodo.estado === 'rechazado' ? 'red'
                            : 'blue'
                        }
                      >
                        {ESTADO_LABEL[periodo.estado] ?? periodo.estado}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1">{contrato?.objeto}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{fmt(periodo.valor_cobro)}</p>
                    <p className="text-xs text-gray-400">{periodo.mes} {periodo.anio}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mb-4">
                  <span>Contratista: <span className="text-gray-600">{contrato?.contratista?.nombre_completo}</span></span>
                  <span>Supervisor: <span className="text-gray-600">{contrato?.supervisor?.nombre_completo}</span></span>
                  <span>Periodo {periodo.numero_periodo}</span>
                  {periodo.fecha_envio && (
                    <span>Enviado: {new Date(periodo.fecha_envio).toLocaleDateString('es-CO')}</span>
                  )}
                </div>

                {!mostrarRechazo[periodo.id] ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <Link href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      Ver detalle
                    </Link>
                    <div className="flex-1" />
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button onClick={() => handleAprobar(periodo.id)} disabled={procesando === periodo.id}
                        className="flex-1 sm:flex-none bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                        {procesando === periodo.id ? 'Procesando...' : 'Aprobar'}
                      </button>
                      <button onClick={() => setMostrarRechazo(p => ({ ...p, [periodo.id]: true }))} disabled={procesando === periodo.id}
                        className="flex-1 sm:flex-none bg-red-50 text-red-600 border border-red-200 px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-100 transition disabled:opacity-50">
                        Rechazar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 border-t pt-4">
                    <textarea
                      value={motivoRechazo[periodo.id] ?? ''}
                      onChange={e => setMotivoRechazo(p => ({ ...p, [periodo.id]: e.target.value }))}
                      placeholder="Escribe el motivo del rechazo para el contratista..."
                      rows={3}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
                    />
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button onClick={() => handleRechazar(periodo.id)}
                        disabled={procesando === periodo.id || !motivoRechazo[periodo.id]?.trim()}
                        className="flex-1 sm:flex-none bg-red-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                        {procesando === periodo.id ? 'Rechazando...' : 'Confirmar rechazo'}
                      </button>
                      <button onClick={() => { setMostrarRechazo(p => ({ ...p, [periodo.id]: false })); setMotivoRechazo(p => ({ ...p, [periodo.id]: '' })) }}
                        className="text-sm text-gray-500 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function AprobacionesPage() {
  const { usuario, cargando } = useUsuario()

  if (cargando) return <p className="text-gray-500">Cargando...</p>
  if (!usuario) return null

  if (!ESTADO_COLA_POR_ROL[usuario.rol]) {
    return (
      <Card>
        <EmptyState
          icon="🔒"
          title="Sin acceso"
          description="Tu rol no tiene acceso a la cola de aprobaciones."
        />
      </Card>
    )
  }

  return (
    <>
      <Toaster position="top-center" richColors />

      {usuario.rol === 'supervisor' ? (
        <div>
          <PageHeader
            title="Periodos por revisar"
            subtitle="Aprueba o rechaza los informes enviados por tus contratistas"
          />
          <SupervisorAprobaciones userId={usuario.id} />
        </div>
      ) : (
        <GenericAprobaciones rol={usuario.rol} userId={usuario.id} />
      )}
    </>
  )
}
