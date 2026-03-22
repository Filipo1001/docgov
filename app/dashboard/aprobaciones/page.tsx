'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import { ESTADO_LABEL, ESTADO_COLOR, ESTADO_COLA_POR_ROL, ESTADO_SIGUIENTE } from '@/lib/constants'
import type { Periodo } from '@/lib/types'
import { getPeriodosPendientesParaRol } from '@/services/periodos'
import { aprobarPeriodo, rechazarPeriodo } from '@/app/actions/periodos'

const TITULO_POR_ROL: Record<string, string> = {
  supervisor: 'Periodos por revisar',
  asesor: 'Revisión jurídica',
  gobierno: 'Revisión de gobierno',
  hacienda: 'Gestión de pagos',
  admin: 'Todas las aprobaciones pendientes',
}

export default function AprobacionesPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [cargando, setCargando] = useState(true)

  // Per-period UI state for inline rejection
  const [mostrarRechazo, setMostrarRechazo] = useState<Record<string, boolean>>({})
  const [motivoRechazo, setMotivoRechazo] = useState<Record<string, string>>({})
  const [procesando, setProcesando] = useState<string | null>(null)

  const cargarPeriodos = useCallback(async () => {
    if (!usuario) return
    const data = await getPeriodosPendientesParaRol(usuario.rol, usuario.id)
    setPeriodos(data)
    setCargando(false)
  }, [usuario])

  useEffect(() => {
    if (usuario) cargarPeriodos()
  }, [usuario, cargarPeriodos])

  async function handleAprobar(periodoId: string) {
    setProcesando(periodoId)
    const result = await aprobarPeriodo(periodoId)
    if (result.error) {
      toast.error(result.error)
    } else {
      const periodo = periodos.find((p) => p.id === periodoId)
      const siguiente = periodo ? ESTADO_SIGUIENTE[periodo.estado] : undefined
      toast.success(
        siguiente === 'aprobado'
          ? 'Periodo aprobado definitivamente'
          : 'Aprobado — pasa a siguiente revisión'
      )
      cargarPeriodos()
    }
    setProcesando(null)
  }

  async function handleRechazar(periodoId: string) {
    const motivo = motivoRechazo[periodoId]?.trim()
    if (!motivo) { toast.error('Escribe el motivo del rechazo'); return }

    setProcesando(periodoId)
    const result = await rechazarPeriodo(periodoId, motivo)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Periodo rechazado')
      setMostrarRechazo((prev) => ({ ...prev, [periodoId]: false }))
      setMotivoRechazo((prev) => ({ ...prev, [periodoId]: '' }))
      cargarPeriodos()
    }
    setProcesando(null)
  }

  // ── Render ──────────────────────────────────────────────────

  if (cargandoUser || cargando) return <p className="text-gray-500">Cargando...</p>
  if (!usuario) return null

  if (!ESTADO_COLA_POR_ROL[usuario.rol]) {
    return (
      <div className="bg-white rounded-2xl border p-12 text-center">
        <p className="text-gray-500">Tu rol no tiene acceso a la cola de aprobaciones.</p>
      </div>
    )
  }

  return (
    <div>
      <Toaster position="top-center" richColors />

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {TITULO_POR_ROL[usuario.rol] ?? 'Aprobaciones'}
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          {periodos.length === 0
            ? 'No hay periodos pendientes'
            : `${periodos.length} periodo${periodos.length !== 1 ? 's' : ''} esperando tu revisión`}
        </p>
      </div>

      {periodos.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✅</span>
          </div>
          <h3 className="font-medium text-gray-900 mb-2">Todo al día</h3>
          <p className="text-sm text-gray-500">No tienes periodos pendientes de revisión.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {periodos.map((periodo) => {
            const contrato = (periodo as any).contrato
            const estadoClass = ESTADO_COLOR[periodo.estado] ?? 'bg-gray-100 text-gray-600'
            const estadoTexto = ESTADO_LABEL[periodo.estado] ?? periodo.estado

            return (
              <div key={periodo.id} className="bg-white rounded-2xl border p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-bold text-gray-900">
                        Contrato N.º {contrato?.numero}
                      </span>
                      {contrato?.dependencia?.abreviatura && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {contrato.dependencia.abreviatura}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoClass}`}>
                        {estadoTexto}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1">{contrato?.objeto}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-bold text-gray-900">
                      ${periodo.valor_cobro?.toLocaleString('es-CO')}
                    </p>
                    <p className="text-xs text-gray-400">{periodo.mes} {periodo.anio}</p>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mb-4">
                  <span>Contratista: <span className="text-gray-600">{contrato?.contratista?.nombre_completo}</span></span>
                  <span>•</span>
                  <span>Supervisor: <span className="text-gray-600">{contrato?.supervisor?.nombre_completo}</span></span>
                  <span>•</span>
                  <span>Periodo {periodo.numero_periodo}</span>
                  {periodo.fecha_envio && (
                    <>
                      <span>•</span>
                      <span>Enviado: {new Date(periodo.fecha_envio).toLocaleDateString('es-CO')}</span>
                    </>
                  )}
                </div>

                {/* Actions */}
                {!mostrarRechazo[periodo.id] ? (
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Ver detalle →
                    </Link>
                    <div className="flex-1" />
                    <button
                      onClick={() => handleAprobar(periodo.id)}
                      disabled={procesando === periodo.id}
                      className="bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {procesando === periodo.id ? 'Procesando...' : '✓ Aprobar'}
                    </button>
                    <button
                      onClick={() => setMostrarRechazo((prev) => ({ ...prev, [periodo.id]: true }))}
                      disabled={procesando === periodo.id}
                      className="bg-red-50 text-red-600 border border-red-200 px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      ✕ Rechazar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 border-t pt-4">
                    <textarea
                      value={motivoRechazo[periodo.id] ?? ''}
                      onChange={(e) =>
                        setMotivoRechazo((prev) => ({ ...prev, [periodo.id]: e.target.value }))
                      }
                      placeholder="Escribe el motivo del rechazo para el contratista..."
                      rows={3}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleRechazar(periodo.id)}
                        disabled={procesando === periodo.id || !motivoRechazo[periodo.id]?.trim()}
                        className="bg-red-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {procesando === periodo.id ? 'Rechazando...' : 'Confirmar rechazo'}
                      </button>
                      <button
                        onClick={() => {
                          setMostrarRechazo((prev) => ({ ...prev, [periodo.id]: false }))
                          setMotivoRechazo((prev) => ({ ...prev, [periodo.id]: '' }))
                        }}
                        className="text-sm text-gray-500 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
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
      )}
    </div>
  )
}
