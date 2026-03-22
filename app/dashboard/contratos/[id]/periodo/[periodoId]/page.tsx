'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import {
  ESTADO_LABEL,
  ESTADO_COLOR,
  ESTADO_REVISOR,
  ESTADOS_EDITABLES,
  ESTADOS_EN_REVISION,
  LABEL_APROBADOR,
  ESTADO_SIGUIENTE,
} from '@/lib/constants'
import type { Contrato, Periodo, Obligacion, Actividad } from '@/lib/types'
import { getPeriodoConContrato } from '@/services/periodos'
import { crearActividad, eliminarActividad } from '@/services/periodos'
import { enviarPeriodo, aprobarPeriodo, rechazarPeriodo, marcarPagado } from '@/app/actions/periodos'
import { subirEvidencia, eliminarEvidencia } from '@/app/actions/evidencias'

export default function PeriodoDetallePage() {
  const { id: contratoId, periodoId } = useParams<{ id: string; periodoId: string }>()
  const { usuario } = useUsuario()

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [obligaciones, setObligaciones] = useState<Obligacion[]>([])
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [cargando, setCargando] = useState(true)

  // Approval panel state
  const [aprobando, setAprobando] = useState(false)
  const [mostrarRechazo, setMostrarRechazo] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [rechazando, setRechazando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // Activity form state
  const [formActivo, setFormActivo] = useState<string | null>(null)
  const [nuevaActividad, setNuevaActividad] = useState('')
  const [nuevaCantidad, setNuevaCantidad] = useState(1)
  const [guardando, setGuardando] = useState(false)

  const cargarDatos = useCallback(async () => {
    const datos = await getPeriodoConContrato(periodoId, contratoId)
    setContrato(datos.contrato)
    setPeriodo(datos.periodo)
    setObligaciones(datos.obligaciones)
    setActividades(datos.actividades)
    setCargando(false)
  }, [periodoId, contratoId])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  // ── Derived values ──────────────────────────────────────────

  const esEditable = periodo ? ESTADOS_EDITABLES.includes(periodo.estado) : false

  const puedeRevisar = (() => {
    if (!usuario || !periodo) return false
    if (!ESTADOS_EN_REVISION.includes(periodo.estado)) return false
    if (usuario.rol === 'admin') return true
    return ESTADO_REVISOR[usuario.rol] === periodo.estado
  })()

  function actividadesPorObligacion(obligacionId: string) {
    return actividades.filter((a) => a.obligacion_id === obligacionId)
  }

  function totalAcciones() {
    return actividades.reduce((sum, a) => sum + (a.cantidad || 1), 0)
  }

  // ── Handlers ────────────────────────────────────────────────

  async function handleEnviar() {
    setEnviando(true)
    const result = await enviarPeriodo(periodoId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Periodo enviado a revisión')
      cargarDatos()
    }
    setEnviando(false)
  }

  async function handleAprobar() {
    setAprobando(true)
    const result = await aprobarPeriodo(periodoId)
    if (result.error) {
      toast.error(result.error)
    } else {
      const estadoActual = periodo!.estado
      const siguiente = ESTADO_SIGUIENTE[estadoActual]
      const aprobador = LABEL_APROBADOR[estadoActual]
      toast.success(
        siguiente === 'aprobado'
          ? 'Periodo aprobado definitivamente'
          : `Aprobado por ${aprobador} — pasa a siguiente revisión`
      )
      cargarDatos()
    }
    setAprobando(false)
  }

  async function handleRechazar() {
    setRechazando(true)
    const result = await rechazarPeriodo(periodoId, motivoRechazo)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Periodo rechazado')
      setMostrarRechazo(false)
      setMotivoRechazo('')
      cargarDatos()
    }
    setRechazando(false)
  }

  async function handleMarcarPagado() {
    const result = await marcarPagado(periodoId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Periodo marcado como pagado')
      cargarDatos()
    }
  }

  async function handleAgregarActividad(obligacionId: string) {
    if (!nuevaActividad.trim()) return
    setGuardando(true)
    const result = await crearActividad({
      periodoId,
      obligacionId,
      descripcion: nuevaActividad,
      cantidad: nuevaCantidad,
      orden: actividadesPorObligacion(obligacionId).length + 1,
    })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Actividad registrada')
      setNuevaActividad('')
      setNuevaCantidad(1)
      setFormActivo(null)
      cargarDatos()
    }
    setGuardando(false)
  }

  async function handleEliminarActividad(actId: string) {
    const result = await eliminarActividad(actId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Actividad eliminada')
      cargarDatos()
    }
  }

  async function handleSubirEvidencia(actividadId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const result = await subirEvidencia(actividadId, periodoId, formData)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Evidencia subida')
      cargarDatos()
    }
  }

  async function handleEliminarEvidencia(evId: string) {
    const result = await eliminarEvidencia(evId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Evidencia eliminada')
      cargarDatos()
    }
  }

  // ── Render ──────────────────────────────────────────────────

  if (cargando) return <p className="text-gray-500">Cargando periodo...</p>
  if (!periodo || !contrato) return <p className="text-red-500">Periodo no encontrado</p>

  const estadoClass = ESTADO_COLOR[periodo.estado] ?? 'bg-gray-100 text-gray-600'
  const estadoTexto = ESTADO_LABEL[periodo.estado] ?? periodo.estado

  return (
    <div className="max-w-4xl">
      <Toaster position="top-center" richColors />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/contratos" className="hover:text-gray-600">Contratos</Link>
        <span>/</span>
        <Link href={`/dashboard/contratos/${contratoId}`} className="hover:text-gray-600">
          N.º {contrato.numero}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{periodo.mes} {periodo.anio}</span>
      </div>

      {/* Period header */}
      <div className="bg-white rounded-2xl border p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{periodo.mes} {periodo.anio}</h2>
            <p className="text-sm text-gray-500 mt-1">
              Periodo {periodo.numero_periodo} — Del {periodo.fecha_inicio} al {periodo.fecha_fin}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Contrato N.º {contrato.numero} — {contrato.contratista?.nombre_completo}
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-block text-xs px-3 py-1 rounded-full font-medium ${estadoClass}`}>
              {estadoTexto}
            </span>
            <p className="text-lg font-bold text-gray-900 mt-2">
              ${periodo.valor_cobro?.toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs">
          <span className="text-gray-400">Actividades registradas:</span>
          <span className="font-medium text-gray-900">{actividades.length}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400">Total acciones:</span>
          <span className="font-medium text-gray-900">{totalAcciones()}</span>
        </div>

        {periodo.estado === 'rechazado' && periodo.motivo_rechazo && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-medium text-red-800">Motivo del rechazo:</p>
            <p className="text-sm text-red-700 mt-1">{periodo.motivo_rechazo}</p>
          </div>
        )}
      </div>

      {/* Approval panel — visible only to the responsible reviewer */}
      {puedeRevisar && (
        <div className="bg-white rounded-2xl border border-amber-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-base">🔍</div>
            <div>
              <h3 className="font-medium text-gray-900">Este periodo requiere tu revisión</h3>
              <p className="text-xs text-gray-400">Revisa las actividades y evidencias antes de decidir.</p>
            </div>
          </div>

          {!mostrarRechazo ? (
            <div className="flex gap-3">
              <button
                onClick={handleAprobar}
                disabled={aprobando}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {aprobando ? 'Aprobando...' : '✓ Aprobar'}
              </button>
              <button
                onClick={() => setMostrarRechazo(true)}
                className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
              >
                ✕ Rechazar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Escribe el motivo del rechazo para el contratista..."
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleRechazar}
                  disabled={rechazando || !motivoRechazo.trim()}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {rechazando ? 'Rechazando...' : 'Confirmar rechazo'}
                </button>
                <button
                  onClick={() => { setMostrarRechazo(false); setMotivoRechazo('') }}
                  className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mark as paid — admin/hacienda when aprobado */}
      {periodo.estado === 'aprobado' && (usuario?.rol === 'admin' || usuario?.rol === 'hacienda') && (
        <div className="bg-white rounded-2xl border border-green-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Periodo aprobado</h3>
              <p className="text-sm text-gray-500 mt-1">
                Marca el pago como realizado una vez hayas transferido el valor al contratista.
              </p>
            </div>
            <button
              onClick={handleMarcarPagado}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Marcar como pagado
            </button>
          </div>
        </div>
      )}

      {/* Obligations and activities */}
      <div className="space-y-4 mb-6">
        {obligaciones.map((obl, oblIndex) => {
          const actsDeObl = actividadesPorObligacion(obl.id)
          return (
            <div key={obl.id} className="bg-white rounded-2xl border p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-white">{oblIndex + 1}</span>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{obl.descripcion}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {actsDeObl.length} actividad{actsDeObl.length !== 1 ? 'es' : ''} registrada{actsDeObl.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Activity list */}
              {actsDeObl.length > 0 && (
                <div className="space-y-3 mb-4 ml-10">
                  {actsDeObl.map((act, actIndex) => (
                    <div key={act.id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-400">{actIndex + 1}.</span>
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                              {act.cantidad} {act.cantidad === 1 ? 'acción' : 'acciones'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{act.descripcion}</p>
                        </div>
                        {esEditable && (
                          <button
                            onClick={() => handleEliminarActividad(act.id)}
                            className="text-gray-300 hover:text-red-500 text-xs ml-2"
                            title="Eliminar actividad"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Evidence */}
                      <div className="mt-3">
                        {act.evidencias && act.evidencias.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {act.evidencias.map((ev) => (
                              <div key={ev.id} className="relative group">
                                <img
                                  src={ev.url}
                                  alt={ev.nombre_archivo}
                                  className="w-20 h-20 object-cover rounded-lg border"
                                />
                                {esEditable && (
                                  <button
                                    onClick={() => handleEliminarEvidencia(ev.id)}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {esEditable && (
                          <label className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Subir evidencia
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleSubirEvidencia(act.id, file)
                                e.target.value = ''
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add activity form */}
              {esEditable && (
                <div className="ml-10">
                  {formActivo === obl.id ? (
                    <div className="bg-blue-50 rounded-xl p-4">
                      <textarea
                        value={nuevaActividad}
                        onChange={(e) => setNuevaActividad(e.target.value)}
                        placeholder="Describe la actividad realizada..."
                        rows={3}
                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                      />
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Cantidad:</label>
                          <input
                            type="number"
                            min={1}
                            value={nuevaCantidad}
                            onChange={(e) => setNuevaCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-center"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setFormActivo(null); setNuevaActividad(''); setNuevaCantidad(1) }}
                            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleAgregarActividad(obl.id)}
                            disabled={guardando || !nuevaActividad.trim()}
                            className="bg-gray-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                          >
                            {guardando ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setFormActivo(obl.id)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      + Agregar actividad
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit button (contratista) */}
      {esEditable && (
        <div className="bg-white rounded-2xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">¿Listo para enviar?</h3>
              <p className="text-sm text-gray-500 mt-1">
                Al enviar, el supervisor recibirá este periodo para revisión.
              </p>
            </div>
            <button
              onClick={handleEnviar}
              disabled={enviando || actividades.length === 0}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 flex-shrink-0"
            >
              {enviando ? 'Enviando...' : 'Enviar a revisión'}
            </button>
          </div>
        </div>
      )}

      {/* Read-only state indicator */}
      {!esEditable && !puedeRevisar && periodo.estado !== 'aprobado' && periodo.estado !== 'pagado' && (
        <div className="bg-gray-50 rounded-2xl border p-6 text-center">
          <p className="text-sm text-gray-500">
            Este periodo está en estado <strong>{estadoTexto}</strong> y está siendo revisado por la instancia correspondiente.
          </p>
        </div>
      )}

      {periodo.estado === 'pagado' && (
        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 text-center">
          <p className="text-lg font-bold text-emerald-700">Periodo pagado</p>
          <p className="text-sm text-emerald-600 mt-1">
            El pago de ${periodo.valor_cobro?.toLocaleString('es-CO')} fue procesado exitosamente.
          </p>
        </div>
      )}
    </div>
  )
}
