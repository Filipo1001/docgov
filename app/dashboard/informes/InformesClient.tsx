'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUsuario } from '@/lib/user-context'
import { MESES, ESTADO_COLOR, ESTADO_LABEL } from '@/lib/constants'
import { getInformesMensuales, getInformesBorrador } from '@/services/periodos'
import {
  aprobarComoAsesor,
  rechazarComoAsesor,
  aprobarPeriodos,
  rechazarPeriodos,
  devolverPeriodoAContratista,
  enviarRecordatorioInforme,
  enviarRecordatoriosMasivos,
} from '@/app/actions/periodos'
import type { Periodo } from '@/lib/types'
import RadicacionRapida from './RadicacionRapida'
import DescargaMasiva from './DescargaMasiva'

import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import FilterTabs from '@/components/ui/FilterTabs'
import EmptyState from '@/components/ui/EmptyState'
import SearchInput from '@/components/ui/SearchInput'
import { Iconos } from '@/lib/iconos'

// ─── Helpers ──────────────────────────────────────────────────

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

/**
 * Normaliza para búsqueda: minúsculas y sin tildes, de modo que "muñoz"
 * encuentre "MUÑOZ" y "jose" encuentre "JOSÉ". Imprescindible con nombres
 * colombianos, donde la tilde y la ñ son frecuentes.
 */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

type Filtro = 'todos' | 'sin_revisar' | 'revision' | 'aprobados' | 'sin_enviar'

// ─── Informe Card ─────────────────────────────────────────────

function InformeCard({
  periodo,
  rol,
  onUpdate,
  onPatch,
}: {
  periodo: Periodo
  rol: string
  onUpdate: () => void | Promise<void>
  onPatch: (periodoId: string, patch: Partial<Periodo>) => void
}) {
  const [procesando, setProcesando] = useState(false)
  const [mostrarRechazo, setMostrarRechazo] = useState(false)
  const [motivo, setMotivo] = useState('')

  const contrato = periodo.contrato
  const nombre = contrato?.contratista?.nombre_completo ?? 'Sin nombre'
  const foto = contrato?.contratista?.foto_url
  // Nota de la secretaria sobre un informe aún en revisión (devuelto a asesores)
  const tieneNotaSecretaria = periodo.motivo_rechazo && periodo.estado === 'enviado'
  // Motivo por el que se devolvió al contratista — debe seguir visible cuando
  // el informe ya quedó en "rechazado", si no la tarjeta no explicaría por qué.
  const tieneMotivoRechazo = periodo.motivo_rechazo && periodo.estado === 'rechazado'
  const detalleHref = `/dashboard/contratos/${periodo.contrato_id}/periodo/${periodo.id}`

  const esHistorico = periodo.es_historico === true
  const esAsesorCard = rol === 'asesor' || rol === 'admin'
  const esSecretariaCard = rol === 'supervisor' || rol === 'admin'

  async function handleAprobarAsesor() {
    setProcesando(true)
    const res = await aprobarComoAsesor(periodo.id)
    if (res.error) toast.error(res.error)
    else {
      toast.success('Informe aprobado como asesor')
      onPatch(periodo.id, { estado: 'revision', motivo_rechazo: null })
      void onUpdate()
    }
    setProcesando(false)
  }

  async function handleRevocarAsesor() {
    setProcesando(true)
    const res = await rechazarComoAsesor(periodo.id, 'Aprobacion revocada por asesor')
    if (res.error) toast.error(res.error)
    else {
      toast.success('Aprobacion revocada')
      onPatch(periodo.id, { estado: 'rechazado', motivo_rechazo: 'Aprobacion revocada por asesor' })
      void onUpdate()
    }
    setProcesando(false)
  }

  async function handleAprobar() {
    setProcesando(true)
    const res = await aprobarPeriodos([periodo.id])
    if (res.error) toast.error(res.error)
    else {
      toast.success('Informe aprobado')
      onPatch(periodo.id, { estado: 'aprobado', motivo_rechazo: null })
      void onUpdate()
    }
    setProcesando(false)
  }

  async function handleRechazarAsesor() {
    if (!motivo.trim()) return
    setProcesando(true)
    const res = await rechazarComoAsesor(periodo.id, motivo)
    if (res.error) toast.error(res.error)
    else {
      toast.success('Devuelto al contratista')
      onPatch(periodo.id, { estado: 'rechazado', motivo_rechazo: motivo })
      setMostrarRechazo(false); setMotivo(''); void onUpdate()
    }
    setProcesando(false)
  }

  // La secretaria devuelve directamente AL CONTRATISTA: el informe queda en
  // "rechazado" para que lo corrija y lo reenvíe. (La devolución a los asesores
  // para re-revisión sigue disponible en el detalle del periodo, donde la
  // secretaria elige explícitamente el destino.)
  async function handleRechazarSecretaria() {
    if (!motivo.trim()) return
    setProcesando(true)
    const res = await devolverPeriodoAContratista(periodo.id, motivo)
    if (res.error) toast.error(res.error)
    else {
      toast.success('Devuelto al contratista')
      onPatch(periodo.id, { estado: 'rechazado', motivo_rechazo: motivo })
      setMostrarRechazo(false); setMotivo(''); void onUpdate()
    }
    setProcesando(false)
  }

  const cardBorder = esHistorico
    ? 'border-amber-200 bg-amber-50/40'
    : tieneNotaSecretaria || tieneMotivoRechazo
      ? 'border-red-200 bg-red-50/30'
      : periodo.estado === 'revision'
        ? 'border-indigo-200 bg-indigo-50/30'
        : 'border-gray-200 bg-white'

  return (
    <div
      className={`relative rounded-2xl border p-5 transition-all hover:shadow-md hover:border-gray-300 focus-within:ring-2 focus-within:ring-blue-400 ${cardBorder}`}
    >
      {/* Toda la tarjeta navega al detalle: un <Link> que la cubre por completo.
          Es un ancla real (soporta ⌘+clic, "abrir en pestaña nueva", teclado y
          prefetch de Next) y no cuesta JS ni handlers. Los controles de acción
          llevan `relative z-10` para quedar POR ENCIMA de esta capa y seguir
          funcionando con normalidad. */}
      <Link
        href={detalleHref}
        aria-label={`Ver detalle del informe de ${nombre}`}
        className="absolute inset-0 z-0 rounded-2xl outline-none"
      />
      <div className="flex items-start gap-3">
        <Avatar nombre={nombre} foto={foto} />
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
          {(tieneNotaSecretaria || tieneMotivoRechazo) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-2">
              <p className="text-[10px] text-red-600">
                <strong>{tieneMotivoRechazo ? 'Motivo de la devolución:' : 'Nota secretaria:'}</strong>{' '}
                {periodo.motivo_rechazo}
              </p>
            </div>
          )}

          {/* Actions for enviado -- asesor can approve or reject */}
          {!esHistorico && periodo.estado === 'enviado' && !mostrarRechazo && (
            <div className="relative z-10 mt-3 flex items-center gap-2 flex-wrap">
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
            </div>
          )}

          {/* Actions for revision — asesor has reviewed, secretary can approve */}
          {!esHistorico && periodo.estado === 'revision' && !mostrarRechazo && (
            <div className="relative z-10 mt-3 flex items-center gap-2 flex-wrap">
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
            </div>
          )}

          {!esHistorico && (periodo.estado === 'aprobado' || periodo.estado === 'radicado') && (
            <div className="relative z-10 mt-3 flex items-center gap-2 flex-wrap">
              {(esAsesorCard || esSecretariaCard) && (
                <a
                  href={`/api/pdf/${periodo.id}/actas`}
                  download
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Descargar Documentos
                </a>
              )}
            </div>
          )}

          {/* Inline rejection form */}
          {!esHistorico && mostrarRechazo && (
            <div className="relative z-10 mt-3 space-y-2">
              {/* Ambas rutas (asesor y secretaria) devuelven ya al contratista */}
              <p className="text-xs text-gray-500 font-medium">
                Motivo (visible para el contratista):
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
  const foto = contrato?.contratista?.foto_url

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
        <Avatar nombre={nombre} foto={foto} />
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

interface InformesProps {
  initialPeriodos: Periodo[]
  initialBorradores: Periodo[]
  /** The month name (e.g. "MAYO") that was pre-fetched server-side */
  initialMes: string
  initialAnio: number
  /** Server-side timestamp used as initialDataUpdatedAt for TanStack Query */
  ssrTimestamp: number
}

export default function InformesPage({
  initialPeriodos,
  initialBorradores,
  initialMes,
  initialAnio,
  ssrTimestamp,
}: InformesProps) {
  const { usuario, cargando: cargandoUser } = useUsuario()
  const queryClient = useQueryClient()

  // Month navigation — starts on the SSR-fetched month so the initial data matches
  const now = new Date()
  const [mesIdx, setMesIdx] = useState(now.getMonth())
  const [anio, setAnio] = useState(now.getFullYear())
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')

  // Secretary action state
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [procesandoMasivo, setProcesandoMasivo] = useState(false)
  const [mostrarRechazoMasivo, setMostrarRechazoMasivo] = useState(false)
  const [motivoMasivo, setMotivoMasivo] = useState('')

  // Reminder state
  const [enviandoRecordatorios, setEnviandoRecordatorios] = useState(false)
  const [recordatoriosEnviados, setRecordatoriosEnviados] = useState(false)

  // Radicación rápida (masiva)
  const [mostrarRadicacion, setMostrarRadicacion] = useState(false)

  // Descarga masiva del mes (ZIP organizado)
  const [mostrarDescargaMasiva, setMostrarDescargaMasiva] = useState(false)

  const mesNombre = MESES[mesIdx]

  // Asesor only sees their dependencia
  const depId = usuario?.rol === 'asesor' ? (usuario.dependencia_id ?? undefined) : undefined

  const informesKey = ['informes', mesNombre, anio, usuario?.id]

  // True when the displayed month matches what the server pre-fetched
  const isInitialMonth = mesNombre === initialMes && anio === initialAnio

  const { data: periodos = [], isLoading } = useQuery<Periodo[]>({
    queryKey: informesKey,
    queryFn: () => getInformesMensuales(mesNombre, anio, depId),
    enabled: !!usuario,
    // 60 s cache — return-visits within that window show data instantly.
    // refetchInterval handles background freshness regardless.
    // Raised 30s → 60s; TanStack pauses the interval while the tab is hidden
    // (refetchIntervalInBackground defaults to false), so this cuts background
    // query load without users noticing.
    staleTime: 60_000,
    refetchInterval: 60_000,
    // Pre-populate with SSR data for the initial month so there is zero
    // loading spinner on first render, even before the client fetches.
    initialData: isInitialMonth ? initialPeriodos : undefined,
    initialDataUpdatedAt: isInitialMonth ? ssrTimestamp : undefined,
  })

  const { data: periodosBorrador = [] } = useQuery<Periodo[]>({
    queryKey: ['informes-borrador', mesNombre, anio, usuario?.id],
    queryFn: () => getInformesBorrador(mesNombre, anio, depId),
    enabled: !!usuario,
    staleTime: 60_000,
    refetchInterval: 60_000,
    initialData: isInitialMonth ? initialBorradores : undefined,
    initialDataUpdatedAt: isInitialMonth ? ssrTimestamp : undefined,
  })

  // Actualización OPTIMISTA del estado en el caché local.
  //
  // Es la fuente de verdad inmediata de la UI: cambia el estado en pantalla al
  // instante, SIN depender de que un refetch de red responda. Antes la vista
  // dependía de invalidateQueries/refetch para actualizarse; si ese refetch
  // tardaba o fallaba (p. ej. red intermitente), la tarjeta se quedaba con el
  // estado viejo hasta un F5. Con este parche el badge cambia de inmediato y el
  // refetch posterior solo reconcilia con el servidor en segundo plano.
  function patchPeriodoLocal(periodoId: string, patch: Partial<Periodo>) {
    queryClient.setQueryData<Periodo[]>(informesKey, (old) =>
      (old ?? []).map((p) => (p.id === periodoId ? { ...p, ...patch } : p)),
    )
  }

  // Refetch de reconciliación tras una acción del servidor. Cubre AMBAS listas
  // (la principal y la de borradores, cuya key no matchea por prefijo con
  // ['informes']). Ya no es la vía crítica de actualización —el parche optimista
  // lo es— sino la que asegura consistencia con el servidor.
  async function refrescar() {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['informes'] }),
      queryClient.refetchQueries({ queryKey: ['informes-borrador'] }),
    ])
  }

  // Reset reminder sent state + filter tab when month changes.
  // Resetear a "todos" evita que, al navegar a un mes sin registros en la
  // pestaña activa (p. ej. quedaste en "Aprobados" y vas a un mes que solo
  // tiene borradores), la vista parezca vacía aunque sí haya informes.
  useEffect(() => {
    setRecordatoriosEnviados(false)
    setFiltro('todos')
    setBusqueda('')
  }, [mesIdx, anio])

  // Navigation — when the query key changes (new month), TanStack Query fetches fresh
  // data client-side. The 60 s staleTime only benefits same-month return visits.
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
  // NOTA: 'enviado' y 'revision' son estados de revisión activa, por lo que un
  // periodo histórico nunca los tiene — el guard !es_historico ahí es inocuo.
  // En cambio 'aprobado'/'radicado' SÍ existen en periodos históricos (meses
  // anteriores a la digitalización ya radicados): incluirlos hace que la
  // pestaña "Aprobados" muestre los informes de meses pasados en vez de 0.
  const enviados = periodos.filter(p => p.estado === 'enviado' && !p.es_historico)
  const aprobadosAsesor = periodos.filter(p => p.estado === 'revision' && !p.es_historico)
  const sinRevisar = enviados.filter(p => (p.preaprobaciones?.length ?? 0) === 0)
  const aprobados = periodos.filter(p => ['aprobado', 'radicado'].includes(p.estado))
  // Radicación rápida: solo aprobados aún sin radicar (excluye históricos)
  const pendientesRadicar = periodos.filter(p => p.estado === 'aprobado' && !p.es_historico)
  // Descarga masiva: aprobados+radicados no históricos (los históricos no
  // tienen actividades digitalizadas — sus PDFs saldrían vacíos)
  const descargables = aprobados.filter(p => !p.es_historico)

  const periodosDelFiltro = (() => {
    switch (filtro) {
      case 'sin_revisar': return sinRevisar
      case 'revision': return aprobadosAsesor
      case 'aprobados': return aprobados
      case 'sin_enviar': return periodosBorrador
      default: return periodos
    }
  })()

  // Búsqueda por contratista o número de contrato. Se aplica SOLO sobre la
  // lista que se está viendo: los contadores de las pestañas y las acciones
  // masivas siguen refiriéndose al mes completo, para que buscar nunca cambie
  // en silencio el alcance de un "aprobar todos" o una descarga masiva.
  // Es filtrado en cliente sobre datos ya cargados → instantáneo, sin red.
  const q = normalizar(busqueda.trim())
  const buscando = q.length > 0
  const periodosVisibles = buscando
    ? periodosDelFiltro.filter(p => {
        const c = p.contrato
        return (
          normalizar(c?.contratista?.nombre_completo ?? '').includes(q) ||
          normalizar(String(c?.numero ?? '')).includes(q)
        )
      })
    : periodosDelFiltro

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
      ids.forEach(id => patchPeriodoLocal(id, { estado: 'aprobado', motivo_rechazo: null }))
      void refrescar()
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
      idsParaAprobar.forEach(id => patchPeriodoLocal(id, { estado: 'enviado', motivo_rechazo: motivoMasivo }))
      setMostrarRechazoMasivo(false)
      setMotivoMasivo('')
      void refrescar()
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

  if (cargandoUser || (isLoading && !periodos.length)) return <p className="text-gray-500">Cargando...</p>
  if (!usuario) return null

  const esAsesor = usuario.rol === 'asesor'
  const esSecretaria = usuario.rol === 'supervisor'
  const esAdmin = usuario.rol === 'admin'

  // ¿Hay alguna acción masiva visible? Evita dejar un hueco vacío bajo los
  // filtros cuando ninguna aplica al rol/pestaña actual.
  const hayAcciones =
    (filtro === 'sin_enviar' && (esAsesor || esAdmin) && periodosBorrador.length > 0) ||
    (filtro === 'aprobados' && (pendientesRadicar.length > 0 || descargables.length > 0)) ||
    ((esSecretaria || esAdmin) && idsParaAprobar.length > 0)

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
      {periodos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total" value={periodos.length} color="gray" />
          <StatCard label="Enviados" value={enviados.length} color="blue" />
          <StatCard label="En revisión" value={aprobadosAsesor.length} color="indigo" />
          <StatCard label="Aprobados final" value={aprobados.length} color="emerald" />
        </div>
      )}

      {/* Barra de búsqueda y filtros — panel unificado */}
      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar por contratista o número de contrato..."
          />
          {/* Las pestañas se desplazan horizontalmente en móvil en vez de
              romper el layout (5 opciones no caben en pantallas pequeñas). */}
          <div className="-mx-1 overflow-x-auto px-1 lg:ml-auto lg:overflow-visible">
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
          </div>
        </div>

        {/* Resultado de la búsqueda — aclara que los contadores de las
            pestañas siguen siendo los totales del mes. */}
        {buscando && (
          <div className="mt-2.5 flex items-center gap-2 px-1 text-xs text-gray-500">
            <span>
              {periodosVisibles.length === 0
                ? 'Sin coincidencias'
                : `${periodosVisibles.length} ${periodosVisibles.length === 1 ? 'resultado' : 'resultados'}`}
              {' para '}
              <span className="font-medium text-gray-700">«{busqueda.trim()}»</span>
            </span>
            <button
              onClick={() => setBusqueda('')}
              className="font-medium text-gray-400 underline-offset-2 transition-colors hover:text-gray-700 hover:underline"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Acciones contextuales — solo se reserva espacio si hay alguna */}
      <div className={`flex flex-col sm:flex-row sm:items-center gap-4 ${hayAcciones ? 'mb-4' : ''}`}>
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

        {/* Radicación rápida + Descarga masiva — pestaña Aprobados, asesor/secretaria/admin */}
        {filtro === 'aprobados' && (pendientesRadicar.length > 0 || descargables.length > 0) && (
          <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
            {descargables.length > 0 && (
              <button
                onClick={() => setMostrarDescargaMasiva(true)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Descargar mes ({descargables.length})
              </button>
            )}
            {pendientesRadicar.length > 0 && (
              <button
                onClick={() => setMostrarRadicacion(true)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Radicación rápida ({pendientesRadicar.length})
              </button>
            )}
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

      {/* Descarga masiva del mes — modal con selección de documentos */}
      {mostrarDescargaMasiva && (
        <DescargaMasiva
          mesNombre={mesNombre}
          anio={anio}
          totalCuentas={descargables.length}
          onClose={() => setMostrarDescargaMasiva(false)}
        />
      )}

      {/* Radicación rápida — modal masivo */}
      {mostrarRadicacion && (
        <RadicacionRapida
          periodos={pendientesRadicar}
          mesNombre={mesNombre}
          anio={anio}
          onRadicados={(radicados) => {
            // Parche optimista: badge y número cambian al instante; el refetch
            // posterior reconcilia con el servidor en segundo plano.
            radicados.forEach(({ periodoId, numeroRadicado }) =>
              patchPeriodoLocal(periodoId, { estado: 'radicado', numero_radicado: numeroRadicado }),
            )
            void refrescar()
          }}
          onClose={() => setMostrarRadicacion(false)}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : periodosVisibles.length === 0 ? (
        <Card>
          <EmptyState
            icono={buscando || filtro !== 'todos' ? Iconos.accion.buscar : Iconos.navegacion.informes}
            title={buscando || filtro !== 'todos' ? 'Sin resultados' : 'Sin informes este mes'}
            description={
              buscando
                ? `Ningún informe de ${mesNombre} ${anio} coincide con «${busqueda.trim()}».`
                : filtro === 'todos'
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
              : <InformeCard key={p.id} periodo={p} rol={usuario.rol} onUpdate={refrescar} onPatch={patchPeriodoLocal} />
          ))}
        </div>
      )}
    </div>
  )
}
