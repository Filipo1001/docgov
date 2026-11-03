'use client'

import { useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { invalidarPeriodos } from '@/lib/invalidar-periodos'
import { useUsuario } from '@/lib/user-context'
import { MESES } from '@/lib/constants'
import { obtenerInformesDelMes } from '@/app/actions/informes'
import { conLimite } from '@/lib/con-limite'
import { mesVecino, type InformesDelMes } from '@/lib/informes-mes'
import {
  aprobarComoAsesor,
  rechazarComoAsesor,
  aprobarPeriodos,
  devolverPeriodoAContratista,
  enviarRecordatorioInforme,
  enviarRecordatoriosMasivos,
  habilitarEnvioTardio,
} from '@/app/actions/periodos'
import TarjetaInforme, { type DatosTarjetaInforme, type EstadoTarjeta } from '@/components/informes/TarjetaInforme'
import { opcionesDeInforme } from '@/components/informes/opciones-informe'
import Dialogo from '@/components/ui/Dialogo'
import type { Periodo } from '@/lib/types'
import RadicacionRapida from './RadicacionRapida'
import DescargaMasiva from './DescargaMasiva'

import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import FilterTabs from '@/components/ui/FilterTabs'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import InformesLoading from './loading'
import EsqueletoInformes from './EsqueletoInformes'
import SearchInput from '@/components/ui/SearchInput'
import { Iconos } from '@/lib/iconos'

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Normaliza para búsqueda: minúsculas y sin tildes, de modo que "muñoz"
 * encuentre "MUÑOZ" y "jose" encuentre "JOSÉ". Imprescindible con nombres
 * colombianos, donde la tilde y la ñ son frecuentes.
 */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Las pestañas (rediseño de noviembre de 2026): lo que espera revisión, lo aprobado por radicar, lo radicado, lo devuelto, lo
 *  que no se ha enviado y todo junto. «Sin revisar» y «En revisión» se unieron: el paso del asesor casi no se usa. */
type Filtro = 'por_revisar' | 'aprobados' | 'radicados' | 'devueltos' | 'sin_enviar' | 'todos'

const DIA_MS = 24 * 3600_000

/** El estado que muestra la tarjeta, a partir del periodo. */
function estadoDeTarjeta(p: Periodo, sinEnviar: boolean): EstadoTarjeta {
  if (sinEnviar) return 'sin_enviar'
  if (p.es_historico) return 'historico'
  switch (p.estado) {
    case 'enviado':
    case 'revision': return 'por_revisar'
    case 'aprobado': return 'aprobado'
    case 'radicado': return 'radicado'
    case 'rechazado': return 'devuelto'
    default: return 'sin_enviar'
  }
}

/** Lo que pinta la tarjeta: solo lo que la secretaría necesita (components/informes/TarjetaInforme.tsx). */
function datosDeTarjeta(p: Periodo, sinEnviar: boolean): DatosTarjetaInforme {
  const estado = estadoDeTarjeta(p, sinEnviar)
  const planilla = estado === 'por_revisar' || estado === 'devuelto'
    ? (p.planilla_estado === 'rechazada' ? 'devuelta' : p.planilla_estado === 'pendiente' && p.planilla_ss_url ? 'pendiente' : null)
    : null
  return {
    id: p.id,
    nombre: p.contrato?.contratista?.nombre_completo ?? '',
    foto: p.contrato?.contratista?.foto_url ?? null,
    numeroContrato: String(p.contrato?.numero ?? '—'),
    dependencia: p.contrato?.dependencia?.abreviatura ?? null,
    valor: p.valor_cobro ?? null,
    estado,
    diasEsperando: estado === 'por_revisar' && p.fecha_envio
      ? Math.max(0, Math.floor((Date.now() - new Date(p.fecha_envio).getTime()) / DIA_MS))
      : null,
    numeroRadicado: p.numero_radicado ?? null,
    motivo: estado === 'devuelto' ? (p.motivo_rechazo ?? null) : null,
    planilla,
  }
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
  // Abre en «Por revisar»: es lo que la secretaría tiene que atender.
  const [filtro, setFiltro] = useState<Filtro>('por_revisar')
  const [busqueda, setBusqueda] = useState('')
  // Filtros para quien ve TODO el municipio. El supervisor no los necesita:
  // la base ya lo acota a sus contratos (periodos_supervisor_read), igual que
  // al asesor a su dependencia. Solo el admin —y contratación— navegan las
  // 78 activas de golpe, y ahí una lista sin cortes es inservible.
  const [depFiltro, setDepFiltro] = useState<string>('todas')
  const [planillaFiltro, setPlanillaFiltro] = useState<'todas' | 'rechazada' | 'pendiente' | 'sin_planilla'>('todas')

  // Acciones de una tarjeta: cuál se está aprobando y cuál se está devolviendo (el diálogo pide el motivo).
  const [aprobandoId, setAprobandoId] = useState<string | null>(null)
  const [devolviendo, setDevolviendo] = useState<Periodo | null>(null)
  const [motivoDevolucion, setMotivoDevolucion] = useState('')
  const [enviandoDevolucion, setEnviandoDevolucion] = useState(false)

  // Reminder state
  const [enviandoRecordatorios, setEnviandoRecordatorios] = useState(false)
  const [recordatoriosEnviados, setRecordatoriosEnviados] = useState(false)

  // Radicación rápida (masiva)
  const [mostrarRadicacion, setMostrarRadicacion] = useState(false)

  // Descarga masiva del mes (ZIP organizado)
  const [mostrarDescargaMasiva, setMostrarDescargaMasiva] = useState(false)

  const mesNombre = MESES[mesIdx]

  // True when the displayed month matches what the server pre-fetched
  const isInitialMonth = mesNombre === initialMes && anio === initialAnio

  // UNA consulta por mes, que devuelve las dos listas (presentados y sin enviar).
  //
  // Cargar un mes distinto al inicial se hacía con el cliente de Supabase del NAVEGADOR, y ahí vivía el «Cargando…»
  // eterno: la capa de autenticación de ese cliente se puede quedar colgada (pestaña dormida, red móvil intermitente) y la
  // consulta ni sale ni falla; solo recargar la página lo arreglaba. Ahora va por Server Action (app/actions/informes.ts),
  // por HTTP a través del middleware, que renueva la sesión. En la base la consulta tarda 1,5 ms: la demora no era de los datos.
  const claveMes = ['informes-mes', mesNombre, anio, usuario?.id] as const
  const hoy = new Date()
  // Un mes ya cerrado casi no cambia: se guarda más tiempo. El mes en curso se refresca cada minuto.
  const mesCerrado = anio < hoy.getFullYear() || (anio === hoy.getFullYear() && mesIdx < hoy.getMonth())

  const {
    data: delMes,
    isLoading,
    isFetching,
    isError,
    isPlaceholderData,
    refetch,
  } = useQuery<InformesDelMes>({
    queryKey: claveMes,
    // Ninguna petición puede quedar colgada sin límite: pasados 12 s se vuelve un error visible y reintentable.
    queryFn: () => conLimite(obtenerInformesDelMes(mesNombre, anio), 'Informes del mes', 12_000),
    enabled: !!usuario,
    staleTime: mesCerrado ? 5 * 60_000 : 60_000,
    refetchInterval: 60_000,
    retry: 1,
    retryDelay: 1_000,
    // Al cambiar de mes se sigue mostrando el anterior (atenuado, con aviso) hasta que llega el nuevo, en vez de dejar la
    // pantalla en blanco o con un «Cargando…» suelto.
    placeholderData: keepPreviousData,
    // Pre-populate with SSR data for the initial month so there is zero
    // loading spinner on first render, even before the client fetches.
    initialData: isInitialMonth ? { periodos: initialPeriodos, borradores: initialBorradores } : undefined,
    initialDataUpdatedAt: isInitialMonth ? ssrTimestamp : undefined,
  })

  const periodos = delMes?.periodos ?? []
  const periodosBorrador = delMes?.borradores ?? []
  /** Lo que se ve todavía es el mes anterior: el nuevo está en camino. */
  const mostrandoMesAnterior = isPlaceholderData

  // «Está tardando»: si la carga del mes pasa de unos segundos, se dice y se ofrece reintentar, sin tener que recargar la
  // página. Se guarda QUÉ mes tardó (no un sí/no) para que un mes nuevo empiece sin el aviso.
  const claveTexto = claveMes.join('|')
  const [mesLento, setMesLento] = useState<string | null>(null)
  const cargandoMes = isFetching && (isLoading || mostrandoMesAnterior)
  useEffect(() => {
    if (!cargandoMes) return
    const t = setTimeout(() => setMesLento(claveTexto), 5_000)
    return () => clearTimeout(t)
  }, [cargandoMes, claveTexto])
  const tardando = cargandoMes && mesLento === claveTexto

  /** Cancela lo que esté colgado y vuelve a pedir el mes. */
  async function reintentarMes() {
    await queryClient.cancelQueries({ queryKey: claveMes })
    await refetch()
  }

  // Los meses vecinos se piden de antemano, un instante después de que la pantalla esté lista: pulsar «mes anterior» o
  // «mes siguiente» muestra el dato al momento. Una sola petición por mes; las acciones del servidor se atienden de a una,
  // por eso se pide el anterior primero (lo más probable) y sin competir con la carga del mes visible.
  useEffect(() => {
    if (!usuario || isLoading || isFetching) return
    const t = setTimeout(() => {
      for (const delta of [-1, 1]) {
        const v = mesVecino(mesIdx, anio, delta)
        queryClient.prefetchQuery({
          queryKey: ['informes-mes', MESES[v.mesIdx], v.anio, usuario.id],
          queryFn: () => conLimite(obtenerInformesDelMes(MESES[v.mesIdx], v.anio), 'Informes del mes', 12_000),
          staleTime: 5 * 60_000,
        }).catch(() => {})
      }
    }, 800)
    return () => clearTimeout(t)
  }, [usuario, isLoading, isFetching, mesIdx, anio, queryClient])

  // Actualización OPTIMISTA del estado en el caché local.
  //
  // Es la fuente de verdad inmediata de la UI: cambia el estado en pantalla al
  // instante, SIN depender de que un refetch de red responda. Antes la vista
  // dependía de invalidateQueries/refetch para actualizarse; si ese refetch
  // tardaba o fallaba (p. ej. red intermitente), la tarjeta se quedaba con el
  // estado viejo hasta un F5. Con este parche el badge cambia de inmediato y el
  // refetch posterior solo reconcilia con el servidor en segundo plano.
  function patchPeriodoLocal(periodoId: string, patch: Partial<Periodo>) {
    queryClient.setQueryData<InformesDelMes>(claveMes, (old) => {
      if (!old) return old
      const aplicar = (lista: Periodo[]) => lista.map((p) => (p.id === periodoId ? { ...p, ...patch } : p))
      return { periodos: aplicar(old.periodos), borradores: aplicar(old.borradores) }
    })
  }

  // Refetch de reconciliación tras una acción del servidor. Cubre AMBAS listas
  // (la principal y la de borradores, cuya key no matchea por prefijo con
  // ['informes']). Ya no es la vía crítica de actualización —el parche optimista
  // lo es— sino la que asegura consistencia con el servidor.
  async function refrescar() {
    await queryClient.refetchQueries({ queryKey: ['informes-mes'] })
    // Y avisar al resto de pantallas que muestran este mismo periodo: sin
    // esto, aprobar aquí dejaba el panel y el detalle con el estado viejo.
    invalidarPeriodos(queryClient)
  }

  // Reset reminder sent state + filter tab when month changes.
  // Resetear a "todos" evita que, al navegar a un mes sin registros en la
  // pestaña activa (p. ej. quedaste en "Aprobados" y vas a un mes que solo
  // tiene borradores), la vista parezca vacía aunque sí haya informes.
  useEffect(() => {
    setRecordatoriosEnviados(false)
    setFiltro('por_revisar')
    // Los acotamientos también se resetean: una dependencia que existía en
    // un mes puede no tener nada en otro, y la lista quedaría vacía sin que
    // se vea por qué.
    setDepFiltro('todas')
    setPlanillaFiltro('todas')
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
  const porRevisar = periodos.filter(p => (p.estado === 'enviado' || p.estado === 'revision') && !p.es_historico)
  const aprobadosPorRadicar = periodos.filter(p => p.estado === 'aprobado')
  const radicados = periodos.filter(p => p.estado === 'radicado')
  const devueltos = periodos.filter(p => p.estado === 'rechazado' && !p.es_historico)
  // Radicación rápida: solo aprobados aún sin radicar (excluye históricos)
  const pendientesRadicar = aprobadosPorRadicar.filter(p => !p.es_historico)
  // Descarga masiva: aprobados+radicados no históricos (los históricos no
  // tienen actividades digitalizadas — sus PDFs saldrían vacíos)
  const descargables = [...aprobadosPorRadicar, ...radicados].filter(p => !p.es_historico)

  const periodosDelFiltro = (() => {
    switch (filtro) {
      case 'por_revisar': return porRevisar
      case 'aprobados': return aprobadosPorRadicar
      case 'radicados': return radicados
      case 'devueltos': return devueltos
      case 'sin_enviar': return periodosBorrador
      default: return periodos
    }
  })()

  // Búsqueda por contratista o número de contrato. Se aplica SOLO sobre la
  // lista que se está viendo: los contadores de las pestañas y las acciones
  // masivas siguen refiriéndose al mes completo, para que buscar nunca cambie
  // en silencio el alcance de un "aprobar todos" o una descarga masiva.
  // Es filtrado en cliente sobre datos ya cargados → instantáneo, sin red.
  // Dependencias presentes en el mes. Se derivan de los datos ya cargados en
  // vez de consultar la tabla: así el desplegable solo ofrece opciones que
  // devuelven algo, y no hay una consulta más que pueda fallar.
  const dependencias = (() => {
    const m = new Map<string, string>()
    for (const p of periodos) {
      const id = p.contrato?.dependencia_id
      const nombre = p.contrato?.dependencia?.nombre
      if (id && nombre && !m.has(id)) m.set(id, nombre)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  })()

  // Dependencia y estado de la planilla se aplican antes de la búsqueda: son
  // acotamientos del conjunto, no una consulta sobre él.
  const periodosAcotados = periodosDelFiltro.filter(p => {
    if (depFiltro !== 'todas' && p.contrato?.dependencia_id !== depFiltro) return false
    if (planillaFiltro === 'rechazada'  && p.planilla_estado !== 'rechazada') return false
    if (planillaFiltro === 'pendiente'  && p.planilla_estado !== 'pendiente') return false
    if (planillaFiltro === 'sin_planilla' && !!p.planilla_ss_url) return false
    return true
  })

  const q = normalizar(busqueda.trim())
  const buscando = q.length > 0
  const periodosVisibles = buscando
    ? periodosAcotados.filter(p => {
        const c = p.contrato
        return (
          normalizar(c?.contratista?.nombre_completo ?? '').includes(q) ||
          normalizar(String(c?.numero ?? '')).includes(q)
        )
      })
    : periodosAcotados

  // ── Acciones de una tarjeta ──────────────────────────────────────────
  //
  // Aprobar: la secretaría (o administración) aprueba de una vez lo enviado o lo que ya revisó el asesor; el asesor solo
  // lo pre-aprueba. Devolver pide un motivo y lo devuelve al contratista para que lo corrija.
  async function aprobar(p: Periodo) {
    if (!usuario) return
    setAprobandoId(p.id)
    const comoAsesor = usuario.rol === 'asesor'
    const res = comoAsesor ? await aprobarComoAsesor(p.id) : await aprobarPeriodos([p.id])
    if (res.error) toast.error(res.error)
    else {
      toast.success(comoAsesor ? 'Informe pre-aprobado' : 'Informe aprobado')
      patchPeriodoLocal(p.id, { estado: comoAsesor ? 'revision' : 'aprobado', motivo_rechazo: null })
      void refrescar()
    }
    setAprobandoId(null)
  }

  async function confirmarDevolucion() {
    if (!usuario || !devolviendo || !motivoDevolucion.trim()) return
    setEnviandoDevolucion(true)
    const motivo = motivoDevolucion.trim()
    const res = usuario.rol === 'asesor'
      ? await rechazarComoAsesor(devolviendo.id, motivo)
      : await devolverPeriodoAContratista(devolviendo.id, motivo)
    if (res.error) toast.error(res.error)
    else {
      toast.success('Devuelto al contratista')
      patchPeriodoLocal(devolviendo.id, { estado: 'rechazado', motivo_rechazo: motivo })
      setDevolviendo(null)
      setMotivoDevolucion('')
      void refrescar()
    }
    setEnviandoDevolucion(false)
  }

  async function recordar(p: Periodo) {
    const res = await enviarRecordatorioInforme(p.id)
    if (res.error) toast.error(res.error)
    else toast.success(`Recordatorio enviado a ${(p.contrato?.contratista?.nombre_completo ?? '').split(' ')[0] || 'la persona'}`)
  }

  async function habilitarTardio(p: Periodo) {
    const res = await habilitarEnvioTardio(p.id, true)
    if (res.error) toast.error(res.error)
    else {
      toast.success('Envío tardío habilitado: ya puede completar y enviar su informe')
      void refrescar()
    }
  }

  async function copiarRadicado(numero: string) {
    try {
      await navigator.clipboard.writeText(numero)
      toast.success(`Copiado: ${numero}`)
    } catch {
      toast.error('No se pudo copiar el número')
    }
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

  // Mientras llega la sesión se dibuja el esqueleto de la pantalla, no un texto suelto. La carga de un MES no entra aquí:
  // la cabecera con los botones de mes se queda siempre a la vista (ver más abajo).
  if (cargandoUser) return <InformesLoading />
  if (!usuario) return null

  const esAsesor = usuario.rol === 'asesor'
  const esSecretaria = usuario.rol === 'supervisor'
  const esAdmin = usuario.rol === 'admin'

  // ¿Hay alguna acción masiva visible? Evita dejar un hueco vacío bajo los
  // filtros cuando ninguna aplica al rol/pestaña actual.
  const hayAcciones =
    (filtro === 'sin_enviar' && (esAsesor || esAdmin) && periodosBorrador.length > 0) ||
    ((filtro === 'aprobados' || filtro === 'radicados') && (pendientesRadicar.length > 0 || descargables.length > 0))

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
            <button onClick={mesAnterior} aria-label="Mes anterior" className="p-2 hover:bg-gray-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900">
              <svg aria-hidden="true" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <button onClick={mesSiguiente} aria-label="Mes siguiente" className="p-2 hover:bg-gray-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900">
              <svg aria-hidden="true" className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        }
      />

      {/* Si la carga del mes pasa de unos segundos se dice, con salida: nunca una espera muda. El esqueleto de abajo ya
          indica que algo carga; esto solo aparece cuando tarda más de lo normal. */}
      {tardando && (
        <div role="status" aria-live="polite" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-700">
          <span>Cargando {mesNombre.toLowerCase()} de {anio} está tardando más de lo normal.</span>
          <button onClick={reintentarMes} className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-700">Reintentar</button>
        </div>
      )}
      {isError && !mostrandoMesAnterior && delMes && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span>No se pudo actualizar este mes. Estás viendo lo último que se cargó.</span>
          <button onClick={reintentarMes} className="font-medium underline underline-offset-2 hover:text-amber-700">Reintentar</button>
        </div>
      )}

      {/* Mientras llega el mes (la primera vez o al cambiar de mes) se dibuja la pantalla sin datos, con la misma forma que la
          real; así no se ven las cifras de otro mes bajo el nombre del mes nuevo ni salta el contenido al llegar. */}
      {(isLoading || mostrandoMesAnterior) && !(isError && !delMes) ? (
        <EsqueletoInformes etiqueta={`Cargando los informes de ${mesNombre.toLowerCase()} de ${anio}`} />
      ) : (
      <>
      {/* Barra de búsqueda y filtros — panel unificado */}
      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar por nombre o número de contrato…"
          />
          {/* Las pestañas se desplazan horizontalmente en móvil en vez de
              romper el layout (5 opciones no caben en pantallas pequeñas). */}
          <div className="-mx-1 overflow-x-auto px-1 lg:ml-auto lg:overflow-visible">
            <FilterTabs<Filtro>
              options={[
                { key: 'por_revisar', label: 'Por revisar', count: porRevisar.length },
                { key: 'aprobados', label: 'Aprobados', count: aprobadosPorRadicar.length },
                { key: 'radicados', label: 'Radicados', count: radicados.length },
                { key: 'devueltos', label: 'Devueltos', count: devueltos.length },
                { key: 'sin_enviar', label: 'Sin enviar', count: periodosBorrador.length },
                { key: 'todos', label: 'Todos', count: periodos.length },
              ]}
              value={filtro}
              onChange={setFiltro}
            />
          </div>
        </div>

        {/* Acotamientos extra: solo donde hay varias dependencias a la vista.
            Para supervisor y asesor sobran — ya llegan acotados de la base. */}
        {dependencias.length > 1 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-xs text-gray-500">
              Dependencia
              <select
                value={depFiltro}
                onChange={e => setDepFiltro(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
              >
                <option value="todas">Todas ({dependencias.length})</option>
                {dependencias.map(([id, nombre]) => (
                  <option key={id} value={id}>{nombre}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              Planilla
              <select
                value={planillaFiltro}
                onChange={e => setPlanillaFiltro(e.target.value as typeof planillaFiltro)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
              >
                <option value="todas">Cualquiera</option>
                <option value="rechazada">Devuelta</option>
                <option value="pendiente">Sin revisar</option>
                <option value="sin_planilla">Sin adjuntar</option>
              </select>
            </label>
            {(depFiltro !== 'todas' || planillaFiltro !== 'todas') && (
              <button
                onClick={() => { setDepFiltro('todas'); setPlanillaFiltro('todas') }}
                className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline sm:ml-auto"
              >
                Quitar filtros
              </button>
            )}
          </div>
        )}

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
              className="font-medium text-gray-500 underline-offset-2 transition-colors hover:text-gray-700 hover:underline"
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
        {(filtro === 'aprobados' || filtro === 'radicados') && (pendientesRadicar.length > 0 || descargables.length > 0) && (
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
            {filtro === 'aprobados' && pendientesRadicar.length > 0 && (
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
      </div>

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
          onRadicados={(nuevos) => {
            // Parche optimista: badge y número cambian al instante; el refetch
            // posterior reconcilia con el servidor en segundo plano.
            nuevos.forEach(({ periodoId, numeroRadicado }) =>
              patchPeriodoLocal(periodoId, { estado: 'radicado', numero_radicado: numeroRadicado }),
            )
            void refrescar()
          }}
          onClose={() => setMostrarRadicacion(false)}
        />
      )}

      {/* Content */}
      {isError && !delMes ? (
        <ErrorState
          mensaje={`No se pudieron cargar los informes de ${mesNombre.toLowerCase()} de ${anio}. Revisa tu conexión e inténtalo de nuevo.`}
          onReintentar={reintentarMes}
          reintentando={isFetching}
        />
      ) : periodosVisibles.length === 0 ? (
        <Card>
          <EmptyState
            icono={buscando ? Iconos.accion.buscar : Iconos.navegacion.informes}
            title={buscando ? 'Sin resultados' : filtro === 'por_revisar' ? 'Nada por revisar' : 'Sin informes aquí'}
            description={
              buscando
                ? `Ningún informe de ${mesNombre.toLowerCase()} de ${anio} coincide con «${busqueda.trim()}».`
                : filtro === 'por_revisar'
                  ? `No hay informes esperando revisión en ${mesNombre.toLowerCase()} de ${anio}.`
                  : filtro === 'todos'
                    ? `No hay informes enviados en ${mesNombre.toLowerCase()} de ${anio}.`
                    : `No hay informes ${({ por_revisar: 'por revisar', aprobados: 'aprobados por radicar', radicados: 'radicados', devueltos: 'devueltos', sin_enviar: 'sin enviar', todos: '' })[filtro]} en ${mesNombre.toLowerCase()} de ${anio}.`
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {periodosVisibles.map(p => {
            const datos = datosDeTarjeta(p, filtro === 'sin_enviar')
            const hrefInforme = `/dashboard/contratos/${p.contrato_id}/periodo/${p.id}`
            // Aprobar: la secretaría y administración, sobre lo enviado o lo que ya revisó el asesor; el asesor, solo lo
            // enviado (su pre-aprobación).
            const puedeAprobar = datos.estado === 'por_revisar' && (esSecretaria || esAdmin || (esAsesor && p.estado === 'enviado'))
            const puedeGestionarTardio = esSecretaria || esAdmin
            return (
              <TarjetaInforme
                key={p.id}
                datos={datos}
                href={hrefInforme}
                mostrarDependencia={dependencias.length > 1}
                onAprobar={puedeAprobar ? () => aprobar(p) : undefined}
                aprobando={aprobandoId === p.id}
                opciones={opcionesDeInforme(datos.estado, {
                  hrefInforme,
                  hrefContrato: `/dashboard/contratos/${p.contrato_id}`,
                  hrefHistorial: `${hrefInforme}?detalle=1`,
                  hrefDocumentos: `/api/pdf/${p.id}/actas`,
                  numeroRadicado: p.numero_radicado ?? null,
                  mesCerrado: mesCerrado && !p.habilitado_tardio,
                  onCopiarRadicado: p.numero_radicado ? () => copiarRadicado(p.numero_radicado!) : undefined,
                  onDevolver: datos.estado === 'por_revisar' ? () => { setMotivoDevolucion(''); setDevolviendo(p) } : undefined,
                  onRecordar: () => recordar(p),
                  onHabilitarTardio: puedeGestionarTardio ? () => habilitarTardio(p) : undefined,
                })}
              />
            )
          })}
        </div>
      )}
      </>
      )}

      {devolviendo && (
        <Dialogo
          titulo="Devolver el informe"
          descripcion={`${(devolviendo.contrato?.contratista?.nombre_completo ?? '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())} · CN ${devolviendo.contrato?.numero ?? ''}`}
          icono={Iconos.accion.devolver}
          onCerrar={() => setDevolviendo(null)}
          ocupado={enviandoDevolucion}
          pie={
            <>
              <button
                type="button"
                onClick={() => setDevolviendo(null)}
                disabled={enviandoDevolucion}
                className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarDevolucion}
                disabled={enviandoDevolucion || !motivoDevolucion.trim()}
                className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {enviandoDevolucion ? 'Devolviendo…' : 'Devolver al contratista'}
              </button>
            </>
          }
        >
          <label htmlFor="motivo-devolucion" className="mb-1.5 block text-sm font-medium text-gray-700">
            ¿Qué debe corregir? <span className="font-normal text-gray-500">(lo leerá el contratista)</span>
          </label>
          <textarea
            id="motivo-devolucion"
            data-autofocus
            value={motivoDevolucion}
            onChange={e => setMotivoDevolucion(e.target.value)}
            rows={4}
            placeholder="Por ejemplo: falta la evidencia de la obligación 3."
            className="w-full resize-y rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/15"
          />
        </Dialogo>
      )}
    </div>
  )
}
