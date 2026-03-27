'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import { ESTADO_LABEL, ESTADO_COLOR } from '@/lib/constants'
import type {
  PersonaDetalle,
  ContratoConPeriodos,
  PeriodoColaborador,
} from '@/services/supervisor'
import { aprobarPeriodos, rechazarPeriodos } from '@/app/actions/periodos'

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

function Avatar({ foto, nombre, size = 'lg' }: { foto?: string | null; nombre: string; size?: 'lg' | 'sm' }) {
  const initials = nombre.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const sizeClass = size === 'lg' ? 'w-20 h-20 text-2xl ring-4' : 'w-10 h-10 text-sm ring-2'

  if (foto) {
    return (
      <img src={foto} alt={nombre}
        className={`${sizeClass} rounded-full object-cover ring-white shadow-lg`} />
    )
  }
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center font-bold text-white ring-white shadow-lg`}>
      {initials}
    </div>
  )
}

function estadoIcon(estado: string) {
  switch (estado) {
    case 'aprobado': return '✅'
    case 'pagado': return '💰'
    case 'rechazado': return '❌'
    case 'enviado': return '📩'
    case 'borrador': return '📝'
    default: return '⏳'
  }
}

// ─── Period row ───────────────────────────────────────────────

function PeriodoRow({
  periodo,
  contratoId,
  canReview,
  onUpdate,
}: {
  periodo: PeriodoColaborador
  contratoId: string
  canReview: boolean
  onUpdate: () => void
}) {
  const [procesando, setProcesando] = useState(false)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const esRevisable = canReview && periodo.estado === 'enviado'
  const colorClass = ESTADO_COLOR[periodo.estado as keyof typeof ESTADO_COLOR] ?? 'bg-gray-100 text-gray-600'
  const labelEstado = ESTADO_LABEL[periodo.estado as keyof typeof ESTADO_LABEL] ?? periodo.estado

  async function handleAprobar() {
    setProcesando(true)
    const res = await aprobarPeriodos([periodo.id])
    setProcesando(false)
    if (res.error) toast.error(res.error)
    else { toast.success('Periodo aprobado'); onUpdate() }
  }

  async function handleRechazar() {
    if (!motivo.trim()) { toast.error('Escribe el motivo'); return }
    setProcesando(true)
    const res = await rechazarPeriodos([periodo.id], motivo.trim())
    setProcesando(false)
    setRechazando(false)
    if (res.error) toast.error(res.error)
    else { toast.success('Periodo devuelto'); onUpdate() }
  }

  return (
    <div className="relative flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0 w-7">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
          periodo.estado === 'aprobado' || periodo.estado === 'pagado'
            ? 'bg-emerald-100'
            : periodo.estado === 'rechazado'
              ? 'bg-red-100'
              : periodo.estado === 'enviado'
                ? 'bg-blue-100'
                : periodo.estado === 'borrador'
                  ? 'bg-gray-100'
                  : 'bg-amber-100'
        }`}>
          {estadoIcon(periodo.estado)}
        </div>
        <div className="w-px flex-1 bg-gray-200 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className={`bg-white rounded-xl border p-3.5 ${
          esRevisable ? 'border-amber-300 shadow-sm' : 'border-gray-200'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">
                {periodo.mes} {periodo.anio}
              </span>
              <span className="text-xs text-gray-400">P{periodo.numero_periodo}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
                {labelEstado}
              </span>
              <span className="text-sm font-bold text-gray-700 tabular-nums">
                {fmt(periodo.valor_cobro)}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-2">
            {periodo.fecha_inicio} → {periodo.fecha_fin}
            {periodo.fecha_envio && (
              <span className="ml-2">· Enviado {new Date(periodo.fecha_envio).toLocaleDateString('es-CO')}</span>
            )}
          </p>

          {/* Rejection reason */}
          {periodo.estado === 'rechazado' && periodo.motivo_rechazo && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-2">
              <strong>Motivo:</strong> {periodo.motivo_rechazo}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {periodo.estado !== 'borrador' && (
              <Link
                href={`/dashboard/contratos/${contratoId}/periodo/${periodo.id}`}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Ver informe →
              </Link>
            )}

            {periodo.estado === 'borrador' && (
              <span className="text-xs text-gray-400 italic">Aun no enviado</span>
            )}

            {esRevisable && !rechazando && (
              <>
                <div className="flex-1" />
                <button onClick={() => setRechazando(true)} disabled={procesando}
                  className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
                  Rechazar
                </button>
                <button onClick={handleAprobar} disabled={procesando}
                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                  {procesando ? '...' : 'Aprobar'}
                </button>
              </>
            )}
          </div>

          {/* Inline rejection */}
          {rechazando && (
            <div className="mt-3 pt-3 border-t border-red-100">
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo del rechazo..." rows={2} autoFocus
                className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs outline-none resize-none focus:ring-2 focus:ring-red-300" />
              <div className="flex gap-2 mt-2">
                <button onClick={handleRechazar} disabled={procesando || !motivo.trim()}
                  className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
                  {procesando ? 'Rechazando...' : 'Confirmar'}
                </button>
                <button onClick={() => { setRechazando(false); setMotivo('') }}
                  className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Contract section ─────────────────────────────────────────

function ContratoSection({
  contrato,
  isSupervisor,
  defaultOpen,
  onUpdate,
}: {
  contrato: ContratoConPeriodos
  isSupervisor: boolean
  defaultOpen: boolean
  onUpdate: () => void
}) {
  const [abierto, setAbierto] = useState(defaultOpen)
  const aprobados = contrato.periodos.filter(
    (p) => p.estado === 'aprobado' || p.estado === 'pagado'
  ).length
  const pendientes = contrato.periodos.filter((p) => p.estado === 'enviado').length
  const total = contrato.periodos.length
  const pct = total > 0 ? Math.round((aprobados / total) * 100) : 0

  return (
    <div className={`rounded-2xl border overflow-hidden ${
      contrato.activo
        ? 'border-emerald-200 bg-emerald-50/30'
        : 'border-gray-200 bg-white'
    }`}>
      {/* Contract header (clickable) */}
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900 text-sm">
              Contrato N.o {contrato.numero}
            </span>
            {contrato.activo && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                Vigente
              </span>
            )}
            {!contrato.activo && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                Finalizado
              </span>
            )}
            {pendientes > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                {pendientes} por revisar
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 line-clamp-1">{contrato.objeto}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{contrato.fecha_inicio} → {contrato.fecha_fin}</span>
            <span>·</span>
            <span>{fmt(contrato.valor_mensual)}/mes</span>
            <span>·</span>
            <span>{fmt(contrato.valor_total)} total</span>
          </div>
        </div>

        {/* Progress + chevron */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {total > 0 && (
            <div className="w-24 text-right">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{aprobados}/{total}</span>
            </div>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Periods (collapsible) */}
      {abierto && (
        <div className="px-5 pb-5 pt-2 border-t border-gray-100">
          {contrato.periodos.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-3">
              No se han generado periodos para este contrato.
            </p>
          ) : (
            <div className="mt-2">
              {contrato.periodos.map((p) => (
                <PeriodoRow
                  key={p.id}
                  periodo={p}
                  contratoId={contrato.id}
                  canReview={isSupervisor}
                  onUpdate={onUpdate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function PersonaDetallePage() {
  const params = useParams<{ id: string }>()
  const { usuario, cargando: cargandoUser } = useUsuario()
  const [data, setData] = useState<PersonaDetalle | null>(null)
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    if (!usuario || !params.id) return
    setCargando(true)
    try {
      const res = await fetch(`/api/supervisor/colaboradores/${params.id}`)
      if (res.ok) {
        const result = await res.json()
        setData(result)
      } else {
        setData(null)
      }
    } catch {
      setData(null)
    }
    setCargando(false)
  }

  useEffect(() => {
    if (usuario) cargar()
  }, [usuario, params.id])

  if (cargandoUser || cargando) {
    return (
      <div className="space-y-6 animate-pulse max-w-3xl">
        <div className="h-40 bg-gray-200 rounded-2xl" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border p-12 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="font-semibold text-gray-900 mb-1">No encontrado</h3>
        <p className="text-sm text-gray-500 mb-4">
          Esta persona no existe o no pertenece a tu dependencia.
        </p>
        <Link href="/dashboard/colaboradores" className="text-sm text-emerald-600 font-medium hover:underline">
          ← Volver a colaboradores
        </Link>
      </div>
    )
  }

  const { persona, usuario: user, contratos } = data
  const nombre = user?.nombre_completo ?? persona.nombre_completo
  const cedula = user?.cedula ?? persona.cedula
  const contratoActivo = contratos.find((c) => c.activo)

  return (
    <div className="max-w-3xl">
      <Toaster position="top-center" richColors />

      {/* Back link */}
      <Link
        href="/dashboard/colaboradores"
        className="text-sm text-gray-500 hover:text-gray-700 mb-5 inline-flex items-center gap-1"
      >
        ← Mis colaboradores
      </Link>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-5">
          <Avatar foto={user?.foto_url} nombre={nombre} />

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{nombre}</h1>
            {cedula && <p className="text-sm text-gray-500 mt-0.5">C.C. {cedula}</p>}

            {/* Status badges */}
            <div className="flex flex-wrap gap-2 mt-2">
              {!persona.activado && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
                  Sin cuenta creada
                </span>
              )}
              {persona.activado && contratos.length === 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-medium">
                  Sin contratos
                </span>
              )}
              {contratoActivo && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                  Contrato vigente
                </span>
              )}
            </div>

            {/* Contact row */}
            {user && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
                {user.telefono && (
                  <a href={`tel:${user.telefono}`} className="flex items-center gap-1 hover:text-gray-700">
                    📞 {user.telefono}
                  </a>
                )}
                {user.email && (
                  <a href={`mailto:${user.email}`} className="flex items-center gap-1 hover:text-gray-700">
                    📧 {user.email}
                  </a>
                )}
                {user.direccion && (
                  <span className="flex items-center gap-1">📍 {user.direccion}</span>
                )}
                {user.cargo && (
                  <span className="flex items-center gap-1">💼 {user.cargo}</span>
                )}
              </div>
            )}

            {/* Imported info if no user */}
            {!user && (
              <div className="mt-3 text-xs text-gray-400">
                <p>Cargo: {persona.cargo}</p>
                {persona.secretaria && <p>Dependencia: {persona.secretaria}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contracts */}
      {contratos.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm text-gray-500">
            {persona.activado
              ? 'Esta persona no tiene contratos asignados bajo tu supervision.'
              : 'Esta persona aun no tiene una cuenta creada en el sistema.'}
          </p>
        </div>
      ) : (
        <div>
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Historial de contratos
            <span className="text-xs text-gray-400 font-normal">
              ({contratos.length})
            </span>
          </h2>

          <div className="space-y-4">
            {contratos.map((c) => (
              <ContratoSection
                key={c.id}
                contrato={c}
                isSupervisor={usuario?.rol === 'supervisor'}
                defaultOpen={c.activo || contratos.length === 1}
                onUpdate={cargar}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
