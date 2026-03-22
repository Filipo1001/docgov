'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'

// Estado que debe tener un periodo para que este rol lo revise
const estadoQueRevisa: Record<string, string | string[]> = {
  supervisor: 'enviado',
  asesor: 'revision_asesor',
  gobierno: 'revision_gobierno',
  hacienda: 'revision_hacienda',
  admin: ['enviado', 'revision_asesor', 'revision_gobierno', 'revision_hacienda'],
}

// Al aprobar, a qué estado pasa
const estadoSiguiente: Record<string, string> = {
  enviado: 'revision_asesor',
  revision_asesor: 'revision_gobierno',
  revision_gobierno: 'revision_hacienda',
  revision_hacienda: 'aprobado',
}

const estadoLabel: Record<string, string> = {
  borrador: 'Borrador',
  enviado: 'Pendiente supervisor',
  revision_asesor: 'Pendiente asesor',
  revision_gobierno: 'Pendiente gobierno',
  revision_hacienda: 'Pendiente hacienda',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  pagado: 'Pagado',
}

const estadoColor: Record<string, string> = {
  enviado: 'bg-blue-100 text-blue-700',
  revision_asesor: 'bg-orange-100 text-orange-700',
  revision_gobierno: 'bg-cyan-100 text-cyan-700',
  revision_hacienda: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
}

export default function AprobacionesPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const [periodos, setPeriodos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  // Estado por periodo para el panel de rechazo inline
  const [rechazando, setRechazando] = useState<Record<string, boolean>>({})
  const [motivoRechazo, setMotivoRechazo] = useState<Record<string, string>>({})
  const [procesando, setProcesando] = useState<string | null>(null)

  async function cargarPeriodos() {
    if (!usuario) return
    const supabase = createClient()

    const estadoFiltro = estadoQueRevisa[usuario.rol]
    if (!estadoFiltro) { setCargando(false); return }

    let query = supabase
      .from('periodos')
      .select(`
        *,
        contrato:contratos(
          id, numero, objeto,
          contratista:usuarios!contratos_contratista_id_fkey(nombre_completo),
          supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, id),
          dependencia:dependencias(nombre, abreviatura)
        )
      `)
      .order('fecha_envio', { ascending: true })

    if (Array.isArray(estadoFiltro)) {
      query = query.in('estado', estadoFiltro)
    } else {
      query = query.eq('estado', estadoFiltro)

      // Supervisor solo ve sus contratos
      if (usuario.rol === 'supervisor') {
        const { data: misContratos } = await supabase
          .from('contratos')
          .select('id')
          .eq('supervisor_id', usuario.id)
        const ids = misContratos?.map((c) => c.id) ?? []
        if (ids.length === 0) { setPeriodos([]); setCargando(false); return }
        query = query.in('contrato_id', ids)
      }
    }

    const { data } = await query
    setPeriodos(data || [])
    setCargando(false)
  }

  useEffect(() => {
    if (usuario) cargarPeriodos()
  }, [usuario])

  async function aprobar(periodoId: string, estadoActual: string) {
    const siguiente = estadoSiguiente[estadoActual]
    if (!siguiente) return

    setProcesando(periodoId)
    const supabase = createClient()
    const { error } = await supabase
      .from('periodos')
      .update({ estado: siguiente })
      .eq('id', periodoId)

    if (error) {
      toast.error('Error: ' + error.message)
    } else {
      const esUltimo = siguiente === 'aprobado'
      toast.success(esUltimo ? 'Periodo aprobado definitivamente' : 'Aprobado, pasa a siguiente revisión')
      cargarPeriodos()
    }
    setProcesando(null)
  }

  async function rechazar(periodoId: string) {
    const motivo = motivoRechazo[periodoId]?.trim()
    if (!motivo) { toast.error('Escribe el motivo del rechazo'); return }

    setProcesando(periodoId)
    const supabase = createClient()
    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'rechazado', motivo_rechazo: motivo })
      .eq('id', periodoId)

    if (error) {
      toast.error('Error: ' + error.message)
    } else {
      toast.success('Periodo rechazado')
      setRechazando((prev) => ({ ...prev, [periodoId]: false }))
      setMotivoRechazo((prev) => ({ ...prev, [periodoId]: '' }))
      cargarPeriodos()
    }
    setProcesando(null)
  }

  if (cargandoUser || cargando) return <p className="text-gray-500">Cargando...</p>
  if (!usuario) return null

  // Roles sin acceso a aprobaciones
  if (!estadoQueRevisa[usuario.rol]) {
    return (
      <div className="bg-white rounded-2xl border p-12 text-center">
        <p className="text-gray-500">No tienes acceso a esta sección.</p>
      </div>
    )
  }

  const tituloPorRol: Record<string, string> = {
    supervisor: 'Periodos por revisar',
    asesor: 'Revisión jurídica',
    gobierno: 'Revisión de gobierno',
    hacienda: 'Gestión de pagos',
    admin: 'Todas las aprobaciones pendientes',
  }

  return (
    <div>
      <Toaster position="top-center" richColors />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {tituloPorRol[usuario.rol] ?? 'Aprobaciones'}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {periodos.length === 0
              ? 'No hay periodos pendientes'
              : `${periodos.length} periodo${periodos.length !== 1 ? 's' : ''} esperando tu revisión`}
          </p>
        </div>
      </div>

      {periodos.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✅</span>
          </div>
          <h3 className="font-medium text-gray-900 mb-2">Todo al día</h3>
          <p className="text-sm text-gray-500">No tienes periodos pendientes de revisión por el momento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {periodos.map((periodo) => (
            <div key={periodo.id} className="bg-white rounded-2xl border p-6">
              {/* Cabecera */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-bold text-gray-900">
                      Contrato N.º {periodo.contrato?.numero}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {periodo.contrato?.dependencia?.abreviatura}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColor[periodo.estado] ?? ''}`}>
                      {estadoLabel[periodo.estado] ?? periodo.estado}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-1">{periodo.contrato?.objeto}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-bold text-gray-900">
                    ${periodo.valor_cobro?.toLocaleString('es-CO')}
                  </p>
                  <p className="text-xs text-gray-400">{periodo.mes} {periodo.anio}</p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
                <span>Contratista: <span className="text-gray-600">{periodo.contrato?.contratista?.nombre_completo}</span></span>
                <span>•</span>
                <span>Supervisor: <span className="text-gray-600">{periodo.contrato?.supervisor?.nombre_completo}</span></span>
                <span>•</span>
                <span>Periodo {periodo.numero_periodo}</span>
                {periodo.fecha_envio && (
                  <>
                    <span>•</span>
                    <span>Enviado: {new Date(periodo.fecha_envio).toLocaleDateString('es-CO')}</span>
                  </>
                )}
              </div>

              {/* Acciones */}
              {!rechazando[periodo.id] ? (
                <div className="flex items-center gap-3">
                  <Link
                    href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Ver detalle →
                  </Link>
                  <div className="flex-1" />
                  <button
                    onClick={() => aprobar(periodo.id, periodo.estado)}
                    disabled={procesando === periodo.id}
                    className="bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {procesando === periodo.id ? 'Procesando...' : '✓ Aprobar'}
                  </button>
                  <button
                    onClick={() => setRechazando((prev) => ({ ...prev, [periodo.id]: true }))}
                    disabled={procesando === periodo.id}
                    className="bg-red-50 text-red-600 border border-red-200 px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    ✕ Rechazar
                  </button>
                </div>
              ) : (
                <div className="space-y-3 border-t pt-4 mt-2">
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
                      onClick={() => rechazar(periodo.id)}
                      disabled={procesando === periodo.id || !motivoRechazo[periodo.id]?.trim()}
                      className="bg-red-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {procesando === periodo.id ? 'Rechazando...' : 'Confirmar rechazo'}
                    </button>
                    <button
                      onClick={() => {
                        setRechazando((prev) => ({ ...prev, [periodo.id]: false }))
                        setMotivoRechazo((prev) => ({ ...prev, [periodo.id]: '' }))
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
