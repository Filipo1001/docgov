'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import {
  ESTADO_LABEL,
  ESTADO_COLOR,
  ESTADOS_EDITABLES,
} from '@/lib/constants'
import type { Contrato, Periodo, Obligacion, Actividad, EstadoPeriodo } from '@/lib/types'
import { getPeriodoConContrato } from '@/services/periodos'
import { crearActividad, eliminarActividad } from '@/services/periodos'
import {
  enviarPeriodo,
  aprobarComoAsesor,
  revocarPreaprobacion,
  rechazarComoAsesor,
  aprobarPeriodos,
  rechazarPeriodos,
  marcarRadicado,
  subirPlanilla,
  eliminarPlanilla,
  guardarNumeroPlanilla,
  revisarPlanilla,
} from '@/app/actions/periodos'
import { subirEvidencia, eliminarEvidencia } from '@/app/actions/evidencias'

export default function PeriodoDetallePage() {
  const { id: contratoId, periodoId } = useParams<{ id: string; periodoId: string }>()
  const { usuario } = useUsuario()

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [obligaciones, setObligaciones] = useState<Obligacion[]>([])
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [cargando, setCargando] = useState(true)

  // Action state
  const [procesando, setProcesando] = useState(false)
  const [mostrarRechazo, setMostrarRechazo] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Activity form state
  const [formActivo, setFormActivo] = useState<string | null>(null)
  const [nuevaActividad, setNuevaActividad] = useState('')
  const [nuevaCantidad, setNuevaCantidad] = useState(1)
  const [guardando, setGuardando] = useState(false)

  // Planilla state
  const [numPlanilla, setNumPlanilla] = useState('')
  const [guardandoPlanilla, setGuardandoPlanilla] = useState(false)

  // Radicado state
  const [numRadicado, setNumRadicado] = useState('')
  const [radicando, setRadicando] = useState(false)

  // Planilla dropdown state
  const [planillaMenuAbierto, setPlanillaMenuAbierto] = useState(false)
  const [subiendoPlanilla, setSubiendoPlanilla] = useState(false)

  const cargarDatos = useCallback(async () => {
    const datos = await getPeriodoConContrato(periodoId, contratoId)
    setContrato(datos.contrato)
    setPeriodo(datos.periodo)
    setObligaciones(datos.obligaciones)
    setActividades(datos.actividades)
    if (datos.periodo?.numero_planilla) setNumPlanilla(datos.periodo.numero_planilla)
    setCargando(false)
  }, [periodoId, contratoId])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  // Toast de radicado para contratista (una sola vez al cargar)
  const radicadoToastMostrado = useRef(false)
  useEffect(() => {
    if (
      periodo &&
      periodo.estado === 'radicado' &&
      usuario?.rol === 'contratista' &&
      !radicadoToastMostrado.current
    ) {
      radicadoToastMostrado.current = true
      const msg = periodo.numero_radicado
        ? `Tu informe ha sido radicado con el No. ${periodo.numero_radicado} 📁`
        : 'Tu informe ha sido radicado exitosamente 📁'
      toast.success(msg, { duration: 6000 })
    }
  }, [periodo?.estado, periodo?.numero_radicado, usuario?.rol])

  // ── Derived values ──────────────────────────────────────────

  const esEditable = periodo ? ESTADOS_EDITABLES.includes(periodo.estado) : false

  const esAsesor = usuario?.rol === 'asesor' || usuario?.rol === 'admin'
  const esSecretaria = usuario?.rol === 'supervisor' || usuario?.rol === 'admin'
  const esContratista = usuario?.rol === 'contratista'

  // Planilla: contratista puede gestionar hasta que esté aprobado o radicado
  const esPlanillaGestionable = esContratista && periodo
    ? !['aprobado', 'radicado'].includes(periodo.estado)
    : false

  // Historial
  const historial = periodo?.historial ?? []

  // Pre-approval info (legacy compat)
  const preaprobaciones = periodo?.preaprobaciones ?? []
  const tienePreaprobaciones = preaprobaciones.length > 0

  // Can download full package only after secretary approves
  const puedeDescargarPaquete = periodo
    ? ['aprobado', 'radicado'].includes(periodo.estado)
    : false

  // Can see documents after sending
  const puedeVerDocumentos = periodo
    ? periodo.estado !== 'borrador'
    : false

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
    if (result.error) toast.error(result.error)
    else { toast.success('Informe enviado a revisión'); cargarDatos() }
    setEnviando(false)
  }

  async function handleAprobarAsesor() {
    setProcesando(true)
    const result = await aprobarComoAsesor(periodoId)
    if (result.error) toast.error(result.error)
    else { toast.success('Informe aprobado como asesor'); cargarDatos() }
    setProcesando(false)
  }

  async function handleRevocarPreaprobacion() {
    setProcesando(true)
    const result = await revocarPreaprobacion(periodoId)
    if (result.error) toast.error(result.error)
    else { toast.success('Aprobación revocada'); cargarDatos() }
    setProcesando(false)
  }

  async function handleRechazarAsesor() {
    setProcesando(true)
    const result = await rechazarComoAsesor(periodoId, motivoRechazo)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Informe devuelto al contratista')
      setMostrarRechazo(false)
      setMotivoRechazo('')
      cargarDatos()
    }
    setProcesando(false)
  }

  async function handleAprobarSecretaria() {
    setProcesando(true)
    const result = await aprobarPeriodos([periodoId])
    if (result.error) toast.error(result.error)
    else { toast.success('Informe aprobado'); cargarDatos() }
    setProcesando(false)
  }

  async function handleRechazarSecretaria() {
    setProcesando(true)
    const result = await rechazarPeriodos([periodoId], motivoRechazo)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Devuelto a los asesores para revisión')
      setMostrarRechazo(false)
      setMotivoRechazo('')
      cargarDatos()
    }
    setProcesando(false)
  }

  async function handleRadicado() {
    setRadicando(true)
    const result = await marcarRadicado(periodoId, numRadicado)
    if (result.error) toast.error(result.error)
    else {
      const msg = numRadicado.trim()
        ? `Radicado con No. ${numRadicado.trim()} ✓`
        : 'Periodo marcado como radicado'
      toast.success(msg)
      cargarDatos()
    }
    setRadicando(false)
  }

  async function handleAgregarActividad(obligacionId: string) {
    if (!nuevaActividad.trim()) return
    setGuardando(true)
    const result = await crearActividad({
      periodoId, obligacionId,
      descripcion: nuevaActividad,
      cantidad: nuevaCantidad,
      orden: actividadesPorObligacion(obligacionId).length + 1,
    })
    if (result.error) toast.error(result.error)
    else { toast.success('Actividad registrada'); setNuevaActividad(''); setNuevaCantidad(1); setFormActivo(null); cargarDatos() }
    setGuardando(false)
  }

  async function handleEliminarActividad(actId: string) {
    const result = await eliminarActividad(actId)
    if (result.error) toast.error(result.error)
    else { toast.success('Actividad eliminada'); cargarDatos() }
  }

  async function handleSubirEvidencia(actividadId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const result = await subirEvidencia(actividadId, periodoId, formData)
    if (result.error) toast.error(result.error)
    else { toast.success('Evidencia subida'); cargarDatos() }
  }

  async function handleEliminarEvidencia(evId: string) {
    const result = await eliminarEvidencia(evId)
    if (result.error) toast.error(result.error)
    else { toast.success('Evidencia eliminada'); cargarDatos() }
  }

  async function handleSubirPlanilla(file: File) {
    setSubiendoPlanilla(true)
    const formData = new FormData()
    formData.append('file', file)
    const result = await subirPlanilla(periodoId, formData)
    if (result.error) toast.error(result.error)
    else { toast.success('Planilla subida exitosamente'); setPlanillaMenuAbierto(false); cargarDatos() }
    setSubiendoPlanilla(false)
  }

  async function handleEliminarPlanilla() {
    const result = await eliminarPlanilla(periodoId)
    if (result.error) toast.error(result.error)
    else { toast.success('Planilla eliminada'); setPlanillaMenuAbierto(false); cargarDatos() }
  }

  async function handleRevisarPlanilla(estado: 'aprobada' | 'rechazada', comentario?: string) {
    const res = await revisarPlanilla(periodoId, estado, comentario)
    if (res.error) toast.error(res.error)
    else {
      toast.success(estado === 'aprobada' ? 'Planilla aprobada ✓' : 'Planilla rechazada')
      setPlanillaMenuAbierto(false)
      cargarDatos()
    }
  }

  async function handleGuardarNumeroPlanilla() {
    if (!numPlanilla.trim()) return
    setGuardandoPlanilla(true)
    const result = await guardarNumeroPlanilla(periodoId, numPlanilla)
    if (result.error) toast.error(result.error)
    else toast.success('Número de planilla guardado')
    setGuardandoPlanilla(false)
  }

  // ── Render ──────────────────────────────────────────────────

  if (cargando) return <p className="text-gray-500">Cargando periodo...</p>
  if (!periodo || !contrato) return <p className="text-red-500">Periodo no encontrado</p>

  const estadoClass = ESTADO_COLOR[periodo.estado] ?? 'bg-gray-100 text-gray-600'
  const estadoTexto = ESTADO_LABEL[periodo.estado] ?? periodo.estado

  // ── Approval timeline steps
  const STEPS: { estado: EstadoPeriodo; label: string; short: string }[] = [
    { estado: 'borrador',       label: 'Borrador',          short: 'Borrador' },
    { estado: 'enviado',        label: 'En revisión',        short: 'Revisión' },
    { estado: 'aprobado_asesor', label: 'Aprobado por asesor', short: 'Asesor' },
    { estado: 'aprobado',       label: 'Aprobado',           short: 'Aprobado' },
    { estado: 'radicado',       label: 'Radicado',           short: 'Radicado' },
  ]

  const ORDER = STEPS.map((s) => s.estado)
  const currentIdx = ORDER.indexOf(periodo.estado)
  const rechazado = periodo.estado === 'rechazado'

  return (
    <div className="max-w-4xl">
      <Toaster position="top-center" richColors />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/contratos" className="hover:text-gray-600">Contratos</Link>
        <span>/</span>
        <Link href={`/dashboard/contratos/${contratoId}`} className="hover:text-gray-600">
          N.° {contrato.numero}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{periodo.mes} {periodo.anio}</span>
      </div>

      {/* ── Approval timeline ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border p-5 mb-6">
        {rechazado ? (
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-red-700">Informe rechazado</p>
              {periodo.motivo_rechazo && (
                <p className="text-xs text-red-500 mt-0.5">{periodo.motivo_rechazo}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-0">
            {STEPS.map((step, i) => {
              const done = i < currentIdx
              const active = i === currentIdx
              return (
                <div key={step.estado} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      done ? 'bg-emerald-500 text-white' :
                      active ? 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-2' :
                        'bg-gray-100 text-gray-400'
                    }`}>
                      {done ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span>{i + 1}</span>
                      )}
                    </div>
                    <span className={`text-[9px] mt-1 font-medium text-center leading-tight ${
                      active ? 'text-gray-900' :
                      done ? 'text-emerald-600' : 'text-gray-400'
                    }`}>
                      {step.short}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pre-approval badges */}
        {periodo.estado === 'enviado' && tienePreaprobaciones && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Pre-aprobado por:</span>
            {preaprobaciones.map(pa => (
              <span key={pa.id} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                ✓ {pa.asesor?.nombre_completo || 'Asesor'}
              </span>
            ))}
          </div>
        )}
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
              Contrato N.° {contrato.numero} — {contrato.contratista?.nombre_completo}
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

        <div className="mt-4 flex items-center gap-2 text-xs flex-wrap">
          <span className="text-gray-400">Actividades registradas:</span>
          <span className="font-medium text-gray-900">{actividades.length}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400">Total acciones:</span>
          <span className="font-medium text-gray-900">{totalAcciones()}</span>
          {periodo.numero_radicado && (
            <>
              <span className="text-gray-300">|</span>
              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-semibold text-xs">
                📁 Radicado No. {periodo.numero_radicado}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Asesor panel (approve / reject) ── */}
      {(periodo.estado === 'enviado' || periodo.estado === 'aprobado_asesor' || periodo.estado === 'rechazado') && esAsesor && usuario?.rol !== 'supervisor' && (
        <div className="bg-white rounded-2xl border border-blue-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-base">🔍</div>
            <div>
              <h3 className="font-medium text-gray-900">Revisión como asesor</h3>
              <p className="text-xs text-gray-400">
                {periodo.estado === 'aprobado_asesor'
                  ? 'Has aprobado este informe. Puedes revocar tu aprobación si detectas un problema.'
                  : periodo.estado === 'rechazado'
                    ? 'Este informe fue rechazado. Puedes volver a aprobarlo si el contratista corrigió los problemas.'
                    : 'Revisa las actividades y evidencias. Aprueba para avanzar a la secretaria.'}
              </p>
            </div>
          </div>

          {/* Secretary rejection note visible to asesor */}
          {periodo.motivo_rechazo && periodo.estado === 'enviado' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-red-600">
                <strong>Nota de la secretaria:</strong> {periodo.motivo_rechazo}
              </p>
            </div>
          )}

          {!mostrarRechazo ? (
            <div className="flex gap-3">
              {periodo.estado === 'aprobado_asesor' ? (
                <button
                  onClick={handleRevocarPreaprobacion}
                  disabled={procesando}
                  className="flex-1 bg-amber-50 text-amber-700 border border-amber-200 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  {procesando ? 'Procesando...' : '↩ Revocar aprobación'}
                </button>
              ) : (
                <button
                  onClick={handleAprobarAsesor}
                  disabled={procesando}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {procesando ? 'Procesando...' : periodo.estado === 'rechazado' ? '✓ Aprobar ahora' : '✓ Aprobar'}
                </button>
              )}
              {(periodo.estado === 'enviado' || periodo.estado === 'aprobado_asesor') && (
                <button
                  onClick={() => setMostrarRechazo(true)}
                  className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  ✕ Rechazar
                </button>
              )}
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
                  onClick={handleRechazarAsesor}
                  disabled={procesando || !motivoRechazo.trim()}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {procesando ? 'Procesando...' : 'Confirmar rechazo'}
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

      {/* ── Secretaria panel (approve / reject) ── */}
      {(periodo.estado === 'aprobado_asesor' || periodo.estado === 'enviado') && (esSecretaria || usuario?.rol === 'admin') && usuario?.rol !== 'asesor' && (
        <div className="bg-white rounded-2xl border border-amber-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-base">📋</div>
            <div>
              <h3 className="font-medium text-gray-900">Aprobación como secretaria</h3>
              <p className="text-xs text-gray-400">
                Revisa el informe. Al aprobar, los documentos firmados estarán disponibles para descarga.
              </p>
            </div>
          </div>

          {tienePreaprobaciones && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {preaprobaciones.map(pa => (
                <span key={pa.id} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  ✓ Pre-aprobado por {pa.asesor?.nombre_completo || 'Asesor'}
                </span>
              ))}
            </div>
          )}

          {!mostrarRechazo ? (
            <div className="flex gap-3">
              <button
                onClick={handleAprobarSecretaria}
                disabled={procesando}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {procesando ? 'Aprobando...' : '✓ Aprobar'}
              </button>
              <button
                onClick={() => setMostrarRechazo(true)}
                className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
              >
                ↩ Devolver a asesores
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Escribe el motivo por el cual devuelves este informe a los asesores..."
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleRechazarSecretaria}
                  disabled={procesando || !motivoRechazo.trim()}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {procesando ? 'Procesando...' : 'Confirmar devolución'}
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

      {/* Mark as radicado — asesor/supervisor/admin when aprobado */}
      {periodo.estado === 'aprobado' && (esAsesor || esSecretaria) && (
        <div className="bg-white rounded-2xl border border-green-200 p-6 mb-6">
          <h3 className="font-medium text-gray-900 mb-1">Paquete aprobado y firmado</h3>
          <p className="text-sm text-gray-500 mb-4">
            Descarga los documentos, imprímelos, y una vez radicados registra el número y marca el periodo.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={numRadicado}
              onChange={e => setNumRadicado(e.target.value)}
              placeholder="No. de radicado (opcional)"
              className="flex-1 min-w-[200px] px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button
              onClick={handleRadicado}
              disabled={radicando}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {radicando ? 'Radicando...' : 'Marcar como radicado'}
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
                                <img src={ev.url} alt={ev.nombre_archivo} className="w-20 h-20 object-cover rounded-lg border" />
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
                            type="number" min={1} value={nuevaCantidad}
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
        <div className="bg-white rounded-2xl border p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">¿Listo para enviar?</h3>
              <p className="text-sm text-gray-500 mt-1">
                Al enviar, los asesores y la secretaria recibirán este informe para revisión.
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

      {/* Read-only state */}
      {!esEditable && periodo.estado === 'enviado' && usuario?.rol === 'contratista' && (
        <div className="bg-gray-50 rounded-2xl border p-6 mb-6 text-center">
          <p className="text-sm text-gray-500">
            Tu informe está <strong>en revisión</strong>. Recibirás una notificación cuando sea aprobado o rechazado.
          </p>
          {tienePreaprobaciones && (
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              {preaprobaciones.map(pa => (
                <span key={pa.id} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  ✓ Pre-aprobado por {pa.asesor?.nombre_completo || 'Asesor'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {periodo.estado === 'radicado' && (
        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 mb-6 text-center">
          <div className="text-3xl mb-2">📁</div>
          <p className="text-lg font-bold text-emerald-700">Periodo radicado</p>
          {periodo.numero_radicado ? (
            <p className="text-2xl font-extrabold text-emerald-800 mt-2 tracking-wide">
              No. {periodo.numero_radicado}
            </p>
          ) : null}
          <p className="text-sm text-emerald-600 mt-2">
            El paquete de ${periodo.valor_cobro?.toLocaleString('es-CO')} ha sido radicado exitosamente.
          </p>
        </div>
      )}


      {/* ── Trazabilidad (historial) ── */}
      {historial.length > 0 && (
        <div className="bg-white rounded-2xl border p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Trazabilidad</h3>
          <div className="space-y-0">
            {historial.map((h, i) => {
              const esUltimo = i === historial.length - 1
              const icono = h.estado_nuevo === 'aprobado' ? '✅' :
                            h.estado_nuevo === 'aprobado_asesor' ? '✅' :
                            h.estado_nuevo === 'rechazado' ? '❌' :
                            h.estado_nuevo === 'enviado' ? '📩' :
                            h.estado_nuevo === 'radicado' ? '📁' : '•'
              const fecha = new Date(h.created_at)
              const fechaLabel = fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) +
                ' · ' + fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                      {icono}
                    </div>
                    {!esUltimo && <div className="w-0.5 bg-gray-100 flex-1 my-1" />}
                  </div>
                  <div className={`pb-4 flex-1 min-w-0 ${esUltimo ? '' : ''}`}>
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{h.estado_nuevo ? (h.estado_nuevo.replace('_', ' ')) : 'Actualizado'}</span>
                      {h.usuario?.nombre_completo && (
                        <span className="text-gray-500"> por {h.usuario.nombre_completo}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{fechaLabel}</p>
                    {h.comentario && (
                      <p className="text-xs text-gray-500 mt-1 italic bg-gray-50 px-2 py-1 rounded-lg">
                        {h.comentario}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Documents section ── */}
      {puedeVerDocumentos && (
        <div className="bg-white rounded-2xl border p-6 mt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Documentos del periodo</h3>

          {!puedeDescargarPaquete && (
            <p className="text-xs text-amber-600 mb-4">
              El paquete completo (documentos firmados) estará disponible cuando la secretaria apruebe.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Always available after sending */}
            <a href={`/api/pdf/${periodoId}/informe`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <span className="text-lg">📝</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Informe de Actividades</p>
                <p className="text-xs text-gray-400">Generado automáticamente</p>
              </div>
            </a>

            <a href={`/api/pdf/${periodoId}/cuenta-cobro`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <span className="text-lg">💰</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Cuenta de Cobro</p>
                <p className="text-xs text-gray-400">Generado automáticamente</p>
              </div>
            </a>

            <a href={`/api/pdf/${periodoId}/acta-supervision`} target="_blank" rel="noopener noreferrer"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                puedeDescargarPaquete ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100'
              }`}>
              <span className="text-lg">📋</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Acta de Supervisión</p>
                <p className="text-xs text-gray-400">
                  {puedeDescargarPaquete ? '✓ Firmada' : 'Pendiente aprobación'}
                </p>
              </div>
            </a>

            <a href={`/api/pdf/${periodoId}/acta-pago`} target="_blank" rel="noopener noreferrer"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                puedeDescargarPaquete ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100'
              }`}>
              <span className="text-lg">🧾</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Acta de Pago</p>
                <p className="text-xs text-gray-400">
                  {puedeDescargarPaquete ? '✓ Firmada' : 'Pendiente aprobación'}
                </p>
              </div>
            </a>

            {/* ── Planilla de Seguridad Social — dropdown ── */}
            {(esPlanillaGestionable || periodo.planilla_ss_url || esAsesor) && (
              <div className="relative col-span-1 sm:col-span-2">
                {/* Trigger button */}
                <button
                  onClick={() => setPlanillaMenuAbierto(v => !v)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors border ${
                    periodo.planilla_estado === 'aprobada'
                      ? 'bg-green-50 border-green-200 hover:bg-green-100'
                      : periodo.planilla_estado === 'rechazada'
                        ? 'bg-red-50 border-red-200 hover:bg-red-100'
                        : periodo.planilla_ss_url
                          ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-lg">🏥</span>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">Planilla de Seguridad Social</p>
                    <p className="text-xs text-gray-500">
                      {subiendoPlanilla
                        ? 'Subiendo...'
                        : !periodo.planilla_ss_url
                          ? 'Sin cargar — haz clic para subir'
                          : periodo.planilla_estado === 'aprobada'
                            ? `✓ Aprobada${periodo.numero_planilla ? ` · No. ${periodo.numero_planilla}` : ''}`
                            : periodo.planilla_estado === 'rechazada'
                              ? `✕ Rechazada${periodo.numero_planilla ? ` · No. ${periodo.numero_planilla}` : ''} — requiere corrección`
                              : periodo.numero_planilla
                                ? `No. ${periodo.numero_planilla} · Pendiente revisión asesor`
                                : 'Cargada · Pendiente No. planilla y revisión'}
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${planillaMenuAbierto ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown */}
                <div className={`overflow-hidden transition-all duration-200 ease-in-out ${
                  planillaMenuAbierto ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">

                    {/* Ver documento */}
                    {periodo.planilla_ss_url && (
                      <a
                        href={periodo.planilla_ss_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-base">👁️</span>
                        <span className="text-sm text-gray-700 font-medium">Ver documento</span>
                      </a>
                    )}

                    {/* Subir / Reemplazar (contratista, hasta aprobado) */}
                    {esPlanillaGestionable && (
                      <label className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                        <span className="text-base">{periodo.planilla_ss_url ? '🔄' : '⬆️'}</span>
                        <span className="text-sm text-gray-700 font-medium">
                          {subiendoPlanilla
                            ? 'Subiendo...'
                            : periodo.planilla_ss_url
                              ? 'Reemplazar planilla'
                              : 'Subir planilla (PDF o imagen)'}
                        </span>
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          className="hidden"
                          disabled={subiendoPlanilla}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleSubirPlanilla(file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}

                    {/* N.° planilla (contratista, hasta aprobado) */}
                    {esPlanillaGestionable && (
                      <div className="px-4 py-3 flex items-center gap-2">
                        <span className="text-base">🔢</span>
                        <input
                          value={numPlanilla}
                          onChange={(e) => setNumPlanilla(e.target.value)}
                          placeholder="N.° de planilla"
                          className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        <button
                          onClick={handleGuardarNumeroPlanilla}
                          disabled={guardandoPlanilla || !numPlanilla.trim()}
                          className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 disabled:opacity-50"
                        >
                          {guardandoPlanilla ? '...' : 'Guardar'}
                        </button>
                      </div>
                    )}

                    {/* Asesor: Aprobar */}
                    {esAsesor && !esSecretaria && periodo.planilla_ss_url && (
                      <button
                        onClick={() => handleRevisarPlanilla('aprobada')}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors text-left"
                      >
                        <span className="text-base">✅</span>
                        <div>
                          <p className="text-sm font-medium text-green-700">Aprobar planilla</p>
                          <p className="text-xs text-gray-400">Confirmar que la planilla está correcta</p>
                        </div>
                      </button>
                    )}

                    {/* Asesor: Rechazar */}
                    {esAsesor && !esSecretaria && periodo.planilla_ss_url && (
                      <button
                        onClick={() => {
                          const motivo = window.prompt('Motivo del rechazo (opcional):')
                          if (motivo !== null) handleRevisarPlanilla('rechazada', motivo || undefined)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left"
                      >
                        <span className="text-base">❌</span>
                        <div>
                          <p className="text-sm font-medium text-red-600">Rechazar planilla</p>
                          {periodo.planilla_comentario
                            ? <p className="text-xs text-gray-400">Motivo anterior: {periodo.planilla_comentario}</p>
                            : <p className="text-xs text-gray-400">Solicitar corrección al contratista</p>}
                        </div>
                      </button>
                    )}

                    {/* Eliminar (contratista, hasta aprobado) */}
                    {esPlanillaGestionable && periodo.planilla_ss_url && (
                      <button
                        onClick={handleEliminarPlanilla}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left"
                      >
                        <span className="text-base">🗑️</span>
                        <span className="text-sm text-red-600 font-medium">Eliminar planilla</span>
                      </button>
                    )}

                    {/* Número de planilla readonly (cuando no es gestionable) */}
                    {!esPlanillaGestionable && periodo.numero_planilla && (
                      <div className="px-4 py-3 flex items-center gap-2">
                        <span className="text-base">🔢</span>
                        <p className="text-sm text-gray-700">
                          N.° de planilla: <strong className="text-gray-900">{periodo.numero_planilla}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
