'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import { MESES, ESTADO_COLOR, ESTADO_LABEL } from '@/lib/constants'
import { getInformesMensuales, getInformesBorrador } from '@/services/periodos'
import {
  aprobarComoAsesor,
  rechazarComoAsesor,
  aprobarPeriodos,
  rechazarPeriodos,
  enviarRecordatorioInforme,
  enviarRecordatoriosMasivos,
} from '@/app/actions/periodos'
import type { Periodo } from '@/lib/types'

import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import FilterTabs from '@/components/ui/FilterTabs'
import EmptyState from '@/components/ui/EmptyState'

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

type Filtro = 'todos' | 'sin_revisar' | 'revision' | 'aprobados' | 'sin_enviar'

// ─── Informe Card ─────────────────────────────────────────────

function InformeCard({
  periodo,
  rol,
  onUpdate,
}: {
  periodo: Periodo
  rol: string
  onUpdate: () => void
}) {
  const [procesando, setProcesando] = useState(false)
  const [mostrarRechazo, setMostrarRechazo] = useState(false)
  const [motivo, setMotivo] = useState('')

  const contrato = periodo.contrato
  const nombre = contrato?.contratista?.nombre_completo ?? 'Sin nombre'
  const tieneNotaSecretaria = periodo.motivo_rechazo && periodo.estado === 'enviado'

  const esAsesorCard = rol === 'asesor' || rol === 'admin'
  const esSecretariaCard = rol === 'supervisor' || rol === 'admin'

  async function handleAprobarAsesor() {
    setProcesando(true)
    const res = await aprobarComoAsesor(periodo.id)
    if (res.error) toast.error(res.error)
    else { toast.success('Informe aprobado como asesor'); onUpdate() }
    setProcesando(false)
  }

  async function handleRevocarAsesor() {
    setProcesando(true)
    const res = await rechazarComoAsesor(periodo.id, 'Aprobacion revocada por asesor')
    if (res.error) toast.error(res.error)
    else { toast.success('Aprobacion revocada'); onUpdate() }
    setProcesando(false)
  }

  async function handleAprobar() {
    setProcesando(true)
    const res = await aprobarPeriodos([periodo.id])
    if (res.error) toast.error(res.error)
    else { toast.success('Informe aprobado'); onUpdate() }
    setProcesando(false)
  }

  async function handleRechazarAsesor() {
    if (!motivo.trim()) return
    setProcesando(true)
    const res = await rechazarComoAsesor(periodo.id, motivo)
    if (res.error) toast.error(res.error)
    else { toast.success('Devuelto al contratista'); setMostrarRechazo(false); setMotivo(''); onUpdate() }
    setProcesando(false)
  }

  async function handleRechazarSecretaria() {
    if (!motivo.trim()) return
    setProcesando(true)
    const res = await rechazarPeriodos([periodo.id], motivo)
    if (res.error) toast.error(res.error)
    else { toast.success('Devuelto a asesores'); setMostrarRechazo(false); setMotivo(''); onUpdate() }
    setProcesando(false)
  }

  const esHistorico = periodo.es_historico === true
  const cardBorder = esHistorico
    ? 'border-amber-200 bg-amber-50/40'
    : tieneNotaSecretaria
      ? 'border-red-200 bg-red-50/30'
      : periodo.estado === 'revision'
        ? 'border-indigo-200 bg-indigo-50/30'
        : 'border-gray-200 bg-white'

  return (
    <div className={`rounded-2xl border p-5 transition-all ${cardBorder}`}>
      <div className="flex items-start gap-3">
        <Avatar nombre={nombre} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">{nombre}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Contrato N.° {contrato?.numero} — {contrato?.dependencia?.abreviatura}
              </p>
            </div>
            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
              <p className="font-bold text-gray-900 text-sm">{fmt(periodo.valor_cobro)}</p>
              {esHistorico ? (
                <Badge size="xs" variant="amber">🔒 Histórico</Badge>
              ) : (
                <Badge
                  size="xs"
                  variant={
                    periodo.estado === 'aprobado' || periodo.estado === 'radicado' ? 'green'
                      : periodo.estado === 'revision' ? 'indigo'
                      : periodo.estado === 'rechazado' ? 'red'
                      : 'blue'
                  }
                >
                  {ESTADO_LABEL[periodo.estado]}
                </Badge>
              )}
            </div>
          </div>

          {/* Secretary rejection note */}
          {tieneNotaSecretaria && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-2">
              <p className="text-[10px] text-red-600">
                <strong>Nota secretaria:</strong> {periodo.motivo_rechazo}
              </p>
            </div>
          )}

          {/* Actions for enviado -- asesor can approve or reject */}
          {!esHistorico && periodo.estado === 'enviado' && !mostrarRechazo && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {esAsesorCard && (
                <button
                  onClick={handleAprobarAsesor}
                  disabled={procesando}
                  className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {procesando ? '...' : 'Aprobar'}
                </button>
              )}

              {/* Secretary can also approve enviado (admin skip) */}
              {esSecretariaCard && !esAsesorCard && (
                <button
                  onClick={handleAprobar}
                  disabled={procesando}
                  className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {procesando ? '...' : 'Aprobar'}
                </button>
              )}

              <button
                onClick={() => setMostrarRechazo(true)}
                className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                Devolver
              </button>

              <Link
                href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-auto"
              >
                Ver detalle
              </Link>
            </div>
          )}

          {/* Actions for revision — asesor has reviewed, secretary can approve */}
          {!esHistorico && periodo.estado === 'revision' && !mostrarRechazo && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {/* Secretary approves */}
              {esSecretariaCard && (
                <button
                  onClick={handleAprobar}
                  disabled={procesando}
                  className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {procesando ? '...' : 'Aprobar'}
                </button>
              )}

              {/* Asesor can revoke their approval */}
              {esAsesorCard && (
                <button
                  onClick={handleRevocarAsesor}
                  disabled={procesando}
                  className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  {procesando ? '...' : 'Revocar aprobacion'}
                </button>
              )}

              {/* Secretary can reject back to asesor */}
              {esSecretariaCard && (
                <button
                  onClick={() => setMostrarRechazo(true)}
                  className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Devolver
                </button>
              )}

              <Link
                href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-auto"
              >
                Ver detalle
              </Link>
            </div>
          )}

          {!esHistorico && (periodo.estado === 'aprobado' || periodo.estado === 'radicado') && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {(esAsesorCard || esSecretariaCard) && (
                <>
                  <a
                    href={`/api/pdf/${periodo.id}/acta-supervision`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium hover:bg-emerald-100 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Acta Supervisión
                  </a>
                  <a
                    href={`/api/pdf/${periodo.id}/acta-pago`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-medium hover:bg-blue-100 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Acta de Pago
                  </a>
                </>
              )}
              <Link
                href={`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-auto"
              >
                Ver documentos
              </Link>
            </div>
          )}

          {/* Inline rejection form */}
          {mostrarRechazo && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium">
                {esSecretariaCard && !esAsesorCard
                  ? 'Motivo (visible para asesores):'
                  : 'Motivo (visible para el contratista):'}
              </p>
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Escribe el motivo..."
                rows={2}
                className="w-full px-3 py-2 border border-red-200 rounded-xl text-xs outline-none resize-none focus:ring-2 focus:ring-red-300"
              />
              <div className="flex gap-2">
                <button
                  onClick={esSecretariaCard && !esAsesorCard ? handleRechazarSecretaria : handleRechazarAsesor}
                  disabled={procesando || !motivo.trim()}
                  className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {procesando ? '...' : 'Confirmar'}
                </button>
                <button onClick={() => { setMostrarRechazo(false); setMotivo('') }}
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

// ─── Sin Enviar Card ──────────────────────────────────────────

type RecordatorioEstado = 'idle' | 'enviando' | 'enviado' | 'error'

function SinEnviarCard({
  periodo,
}: {
  periodo: Periodo
}) {
  const [estado, setEstado] = useState<RecordatorioEstado>('idle')

  const contrato = periodo.contrato
  const nombre = contrato?.contratista?.nombre_completo ?? 'Sin nombre'

  async function handleRecordar() {
    setEstado('enviando')
    const res = await enviarRecordatorioInforme(periodo.id)
    if (res.error) {
      toast.error(res.error)
      setEstado('error')
    } else {
      toast.success(`Recordatorio enviado a ${nombre.split(' ')[0]}`)
      setEstado('enviado')
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 transition-all">
      <div className="flex items-start gap-3">
        <Avatar nombre={nombre} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">{nombre}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Contrato N.° {contrato?.numero} — {contrato?.dependencia?.abreviatura}
              </p>
            </div>
            <Badge size="xs" variant="amber">Sin enviar</Badge>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleRecordar}
              disabled={estado === 'enviando' || estado === 'enviado'}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                estado === 'enviado'
                  ? 'bg-green-100 text-green-700 cursor-default'
                  : estado === 'error'
                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                    : 'bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50'
              }`}
            >
              {estado === 'enviando' ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Enviando...
                </>
              ) : estado === 'enviado' ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Recordatorio enviado
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {estado === 'error' ? 'Reintentar' : 'Recordar'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function InformesPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()

  // Month navigation
  const now = new Date()
  const [mesIdx, setMesIdx] = useState(now.getMonth())
  const [anio, setAnio] = useState(now.getFullYear())

  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [periodosBorrador, setPeriodosBorrador] = useState<Periodo[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todos')

  // Secretary action state
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [procesandoMasivo, setProcesandoMasivo] = useState(false)
  const [mostrarRechazoMasivo, setMostrarRechazoMasivo] = useState(false)
  const [motivoMasivo, setMotivoMasivo] = useState('')

  // Reminder state
  const [enviandoRecordatorios, setEnviandoRecordatorios] = useState(false)
  const [recordatoriosEnviados, setRecordatoriosEnviados] = useState(false)

  const mesNombre = MESES[mesIdx]

  const cargar = useCallback(async (silencioso = false) => {
    if (!usuario) return
    if (!silencioso) setCargando(true)

    // Asesor only sees their dependencia
    const depId = usuario.rol === 'asesor' ? usuario.dependencia_id ?? undefined : undefined
    const [data, borradores] = await Promise.all([
      getInformesMensuales(mesNombre, anio, depId),
      getInformesBorrador(mesNombre, anio, depId),
    ])
    setPeriodos(data)
    setPeriodosBorrador(borradores)
    if (!silencioso) setCargando(false)
  }, [usuario, mesNombre, anio])

  // Reset reminder sent state when month changes
  useEffect(() => { setRecordatoriosEnviados(false) }, [mesIdx, anio])

  // Initial load
  useEffect(() => { cargar() }, [cargar])

  // Background polling every 30s — keeps all roles in sync without manual refresh
  useEffect(() => {
    const timer = setInterval(() => cargar(true), 30_000)
    return () => clearInterval(timer)
  }, [cargar])

  // Navigation
  function mesAnterior() {
    if (mesIdx === 0) { setMesIdx(11); setAnio(a => a - 1) }
    else setMesIdx(m => m - 1)
  }
  function mesSiguiente() {
    if (mesIdx === 11) { setMesIdx(0); setAnio(a => a + 1) }
    else setMesIdx(m => m + 1)
  }
  function irAMesActual() {
    setMesIdx(now.getMonth())
    setAnio(now.getFullYear())
  }
  const esMesActual = mesIdx === now.getMonth() && anio === now.getFullYear()

  // Filters
  const enviados = periodos.filter(p => p.estado === 'enviado' && !p.es_historico)
  const aprobadosAsesor = periodos.filter(p => p.estado === 'revision' && !p.es_historico)
  const sinRevisar = enviados.filter(p => (p.preaprobaciones?.length ?? 0) === 0)
  const aprobados = periodos.filter(p => ['aprobado', 'radicado'].includes(p.estado) && !p.es_historico)

  const periodosVisibles = (() => {
    switch (filtro) {
      case 'sin_revisar': return sinRevisar
      case 'revision': return aprobadosAsesor
      case 'aprobados': return aprobados
      case 'sin_enviar': return periodosBorrador
      default: return periodos
    }
  })()

  // Secretary mass actions — revision (asesor reviewed) + enviado (direct)
  const idsAprobadosAsesor = aprobadosAsesor.map(p => p.id)
  const idsEnviados = enviados.map(p => p.id)
  const idsParaAprobar = [...idsAprobadosAsesor, ...idsEnviados]

  async function accionMasiva(accion: string) {
    setMenuAbierto(false)
    setProcesandoMasivo(true)

    if (accion === 'rechazar_todos') {
      setMostrarRechazoMasivo(true)
      setProcesandoMasivo(false)
      return
    }

    const ids = accion.includes('pre_aprobados') ? idsAprobadosAsesor : idsParaAprobar
    if (ids.length === 0) {
      toast.error('No hay informes para procesar')
      setProcesandoMasivo(false)
      return
    }

    const res = await aprobarPeriodos(ids)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success(`${res.data?.aprobados ?? 0} informes aprobados`)
      cargar()
    }

    setProcesandoMasivo(false)
  }

  async function handleRechazoMasivo() {
    if (!motivoMasivo.trim()) return
    setProcesandoMasivo(true)
    const res = await rechazarPeriodos(idsParaAprobar, motivoMasivo)
    if (res.error) toast.error(res.error)
    else {
      toast.success(`${res.data?.rechazados ?? 0} informes devueltos a asesores`)
      setMostrarRechazoMasivo(false)
      setMotivoMasivo('')
      cargar()
    }
    setProcesandoMasivo(false)
  }

  async function handleRecordatoriosMasivos() {
    if (!periodosBorrador.length) return
    setEnviandoRecordatorios(true)
    const ids = periodosBorrador.map(p => p.id)
    const res = await enviarRecordatoriosMasivos(ids)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success(`Recordatorios enviados a ${res.data?.enviados ?? 0} contratistas`)
      setRecordatoriosEnviados(true)
    }
    setEnviandoRecordatorios(false)
  }

  if (cargandoUser) return <p className="text-gray-500">Cargando...</p>
  if (!usuario) return null

  const esAsesor = usuario.rol === 'asesor'
  const esSecretaria = usuario.rol === 'supervisor'
  const esAdmin = usuario.rol === 'admin'

  const subtitulo = esAsesor
    ? 'Informes de los contratistas de tu dependencia'
    : esSecretaria
      ? 'Informes de todos los contratistas'
      : 'Informes mensuales'

  return (
    <div className="max-w-5xl">
      <Toaster position="top-center" richColors />

      {/* Month navigation header */}
      <PageHeader
        title="Informes"
        subtitle={subtitulo}
        action={
          <div className="flex items-center gap-2">
            <button onClick={mesAnterior} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={irAMesActual}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                esMesActual ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {mesNombre} {anio}
            </button>
            <button onClick={mesSiguiente} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        }
      />

      {/* Stats bar */}
      {!cargando && periodos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total" value={periodos.length} color="gray" />
          <StatCard label="Enviados" value={enviados.length} color="blue" />
          <StatCard label="En revisión" value={aprobadosAsesor.length} color="indigo" />
          <StatCard label="Aprobados final" value={aprobados.length} color="emerald" />
        </div>
      )}

      {/* Filter bar + secretary mass action */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
        <FilterTabs<Filtro>
          options={[
            { key: 'todos', label: 'Todos', count: periodos.length },
            { key: 'sin_revisar', label: 'Sin revisar', count: sinRevisar.length },
            { key: 'revision', label: 'En revisión', count: aprobadosAsesor.length },
            { key: 'aprobados', label: 'Aprobados', count: aprobados.length },
            { key: 'sin_enviar', label: 'Sin enviar', count: periodosBorrador.length },
          ]}
          value={filtro}
          onChange={setFiltro}
        />

        {/* Reminder bulk button — only on Sin Enviar tab, for asesor/admin */}
        {filtro === 'sin_enviar' && (esAsesor || esAdmin) && periodosBorrador.length > 0 && (
          <div className="sm:ml-auto">
            <button
              onClick={handleRecordatoriosMasivos}
              disabled={enviandoRecordatorios || recordatoriosEnviados}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                recordatoriosEnviados
                  ? 'bg-green-100 text-green-700 cursor-default'
                  : 'bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50'
              }`}
            >
              {enviandoRecordatorios ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Enviando...
                </>
              ) : recordatoriosEnviados ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Recordatorios enviados
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Recordar a todos ({periodosBorrador.length})
                </>
              )}
            </button>
          </div>
        )}

        {/* Secretary mass action button */}
        {(esSecretaria || esAdmin) && idsParaAprobar.length > 0 && (
          <div className="sm:ml-auto relative">
            <button
              onClick={() => setMenuAbierto(!menuAbierto)}
              disabled={procesandoMasivo}
              className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {procesandoMasivo ? 'Procesando...' : 'Generar Docs'}
              <svg className={`w-4 h-4 transition-transform ${menuAbierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuAbierto && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border shadow-lg z-20 py-1">
                  <button onClick={() => accionMasiva('aprobar_pre_aprobados')}
                    disabled={idsAprobadosAsesor.length === 0}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    <p className="font-medium text-gray-900">Aprobar aprobados por asesor</p>
                    <p className="text-xs text-gray-400">{idsAprobadosAsesor.length} informes</p>
                  </button>
                  <button onClick={() => accionMasiva('aprobar_todos')}
                    disabled={idsParaAprobar.length === 0}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    <p className="font-medium text-gray-900">Aprobar todos</p>
                    <p className="text-xs text-gray-400">{idsParaAprobar.length} informes</p>
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button onClick={() => accionMasiva('aprobar_pre_aprobados_descargar')}
                    disabled={idsAprobadosAsesor.length === 0}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    <p className="font-medium text-gray-900">Aprobar aprobados por asesor + descargar</p>
                    <p className="text-xs text-gray-400">{idsAprobadosAsesor.length} informes -- genera ZIP</p>
                  </button>
                  <button onClick={() => accionMasiva('aprobar_todos_descargar')}
                    disabled={idsParaAprobar.length === 0}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    <p className="font-medium text-gray-900">Aprobar todos + descargar</p>
                    <p className="text-xs text-gray-400">{idsParaAprobar.length} informes -- genera ZIP</p>
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button onClick={() => accionMasiva('rechazar_todos')}
                    disabled={idsParaAprobar.length === 0}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-red-50 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed">
                    <p className="font-medium">Rechazar todos</p>
                    <p className="text-xs text-red-400">{idsParaAprobar.length} informes -- devuelve a asesores</p>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Mass rejection modal */}
      {mostrarRechazoMasivo && (
        <Card className="!bg-red-50 !border-red-200 mb-6">
          <h3 className="text-sm font-semibold text-red-700 mb-2">
            Rechazar {idsParaAprobar.length} informes
          </h3>
          <textarea
            value={motivoMasivo}
            onChange={e => setMotivoMasivo(e.target.value)}
            placeholder="Motivo del rechazo para todos los informes..."
            rows={3}
            className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-red-400 bg-white"
          />
          <div className="flex gap-3 mt-3">
            <button onClick={handleRechazoMasivo}
              disabled={procesandoMasivo || !motivoMasivo.trim()}
              className="bg-red-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {procesandoMasivo ? 'Procesando...' : 'Confirmar rechazo masivo'}
            </button>
            <button onClick={() => { setMostrarRechazoMasivo(false); setMotivoMasivo('') }}
              className="text-sm text-gray-500 px-4 py-2 border border-gray-200 rounded-xl hover:bg-white">
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {/* Content */}
      {cargando ? (
        <div className="space-y-4 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : periodosVisibles.length === 0 ? (
        <Card>
          <EmptyState
            icon={filtro === 'todos' ? '📭' : '🔍'}
            title={filtro === 'todos' ? 'Sin informes este mes' : 'Sin resultados'}
            description={
              filtro === 'todos'
                ? `No hay informes enviados en ${mesNombre} ${anio}.`
                : `No hay informes que coincidan con el filtro "${filtro}".`
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {periodosVisibles.map(p => (
            filtro === 'sin_enviar'
              ? <SinEnviarCard key={p.id} periodo={p} />
              : <InformeCard key={p.id} periodo={p} rol={usuario.rol} onUpdate={cargar} />
          ))}
        </div>
      )}
    </div>
  )
}
