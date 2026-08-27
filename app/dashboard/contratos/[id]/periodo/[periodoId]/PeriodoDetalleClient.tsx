'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import {
  ESTADO_LABEL,
  ESTADO_COLOR,
  ESTADOS_EDITABLES,
  DEFAULT_BASE_COTIZACION_SS,
  MESES,
} from '@/lib/constants'
import type { Contrato, Periodo, Obligacion, Actividad, EstadoPeriodo, DuplicadoMatch, EvidenciaParaBackfill } from '@/lib/types'
import { createClient } from '@/lib/supabase'
import { getPeriodoConContrato } from '@/services/periodos'
import ActaTerminacionModal, { type ActaPrefill } from './ActaTerminacionModal'
import VisorPDF from '@/components/VisorPDF'
import SubiendoArchivo from '@/components/ui/SubiendoArchivo'
import EnvioInforme from '@/components/EnvioInforme'
import TarjetaAdjunto from '@/components/TarjetaAdjunto'
import {
  prepararUploadAdjunto, registrarAdjunto, eliminarAdjunto, listarAdjuntos,
  type AdjuntoDTO,
} from '@/app/actions/adjuntos'
import { verificarActaTerminacionRequerida } from '@/app/actions/actas-terminacion'
import {
  enviarPeriodo,
  aprobarComoAsesor,
  revocarPreaprobacion,
  rechazarComoAsesor,
  aprobarPeriodos,
  rechazarPeriodos,
  marcarRadicado,
  actualizarNumeroRadicado,
  prepararUploadPlanilla,
  prepararUploadFactura,
  confirmarUploadFactura,
  eliminarFactura,
  confirmarUploadPlanilla,
  eliminarPlanilla,
  guardarNumeroPlanilla,
  guardarMesCotizacion,
  revisarPlanilla,
  actualizarObservacionSupervisor,
  actualizarBaseCotizacion,
  adminDevolverPeriodo,
  habilitarEnvioTardio,
} from '@/app/actions/periodos'
import { validarNumeroPlanilla } from '@/lib/validaciones'
import { prepararUploadEvidencia, registrarEvidencia, eliminarEvidencia, guardarHashesBatch } from '@/app/actions/evidencias'
import { comprimirEvidencia } from '@/lib/compress'
import { computeFileHash, computePerceptualHash, computePerceptualHashFromUrl } from '@/lib/pHash'
import { actualizarActividad, crearActividad, eliminarActividad } from '@/app/actions/actividades'
import { toggleAprobacionObligacion, guardarNotaObligacion } from '@/app/actions/obligacion-revisiones'
import { devolverPeriodoAContratista } from '@/app/actions/periodos'
import MejorarRedaccion from '@/components/MejorarRedaccion'
import Badge from '@/components/ui/Badge'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import NotaSupervision from '@/components/ui/NotaSupervision'

/** Revisión local por obligación (✓ + nota). Sin entrada → aprobada por defecto. */
type RevisionLocal = { aprobada: boolean; nota: string | null }

/** Periodo "hermano" del mismo contrato — usado para detectar repetición de planilla */
export interface PeriodoHermano {
  id: string
  numero_periodo: number
  mes: string
  numero_planilla: string | null
  cotizacion_mes: string | null
}

interface InitialData {
  initialContrato: Contrato
  initialPeriodo: Periodo
  initialObligaciones: Obligacion[]
  initialActividades: Actividad[]
  initialRevisiones?: Record<string, RevisionLocal>
  certDisponible?: boolean
  actaTerminacionDisponible?: boolean
  periodosHermanos?: PeriodoHermano[]
  initialDuplicados?: Record<string, DuplicadoMatch[]>
  initialParaBackfill?: EvidenciaParaBackfill[]
  /** URL canónica (BD) → URL firmada. Los buckets son privados: toda imagen/PDF
   *  de evidencias o documentos se renderiza a través de este mapa. */
  initialUrlsFirmadas?: Record<string, string>
  /** URL canónica → URL firmada de una miniatura 160×160 (Storage image
   *  transform). Usada solo en la grilla de thumbnails; el lightbox y el PDF
   *  siguen usando la resolución completa via initialUrlsFirmadas. */
  initialUrlsMiniatura?: Record<string, string>
  /** Adjuntos PDF agrupados por actividad, con su URL ya firmada. */
  initialAdjuntos?: Record<string, AdjuntoDTO[]>
}

export default function PeriodoDetallePage({
  initialContrato,
  initialPeriodo,
  initialObligaciones,
  initialActividades,
  initialRevisiones = {},
  certDisponible = false,
  actaTerminacionDisponible = false,
  periodosHermanos = [],
  initialDuplicados = {},
  initialParaBackfill = [],
  initialUrlsFirmadas = {},
  initialUrlsMiniatura = {},
  initialAdjuntos = {},
}: InitialData) {
  const { id: contratoId, periodoId } = useParams<{ id: string; periodoId: string }>()
  const { usuario } = useUsuario()
  const router = useRouter()

  // Data is pre-fetched server-side and passed as props — no blank page on refresh.
  // cargarDatos() is still used for post-mutation refreshes and background polling.
  const [contrato, setContrato] = useState<Contrato | null>(initialContrato)
  const [periodo, setPeriodo] = useState<Periodo | null>(initialPeriodo)
  const [obligaciones, setObligaciones] = useState<Obligacion[]>(initialObligaciones)
  const [actividades, setActividades] = useState<Actividad[]>(initialActividades)
  const [cargando, setCargando] = useState(false)
  const [tardioLoading, setTardioLoading] = useState(false)

  // ── URLs firmadas (buckets privados) ───────────────────────────────────────
  // El SSR firma todas las URLs de evidencias/planilla; las subidas nuevas
  // agregan su propia entrada desde la respuesta del server action.
  const [urlsFirmadas, setUrlsFirmadas] = useState<Record<string, string>>(initialUrlsFirmadas)
  const prevUrlsFirmadasRef = useRef(initialUrlsFirmadas)
  useEffect(() => {
    if (prevUrlsFirmadasRef.current !== initialUrlsFirmadas) {
      prevUrlsFirmadasRef.current = initialUrlsFirmadas
      // Merge (no replace): conserva entradas de subidas recientes que el
      // nuevo SSR podría no incluir todavía.
      setUrlsFirmadas(prev => ({ ...prev, ...initialUrlsFirmadas }))
    }
  }, [initialUrlsFirmadas])
  const resolverUrl = useCallback(
    (url: string | null | undefined) => (url ? (urlsFirmadas[url] ?? url) : ''),
    [urlsFirmadas],
  )

  // Miniaturas 160×160 (Storage image transform) para la grilla de evidencias.
  // El lightbox y el PDF siguen usando resolverUrl (resolución completa).
  const [urlsMiniatura, setUrlsMiniatura] = useState<Record<string, string>>(initialUrlsMiniatura)
  const prevUrlsMiniaturaRef = useRef(initialUrlsMiniatura)
  useEffect(() => {
    if (prevUrlsMiniaturaRef.current !== initialUrlsMiniatura) {
      prevUrlsMiniaturaRef.current = initialUrlsMiniatura
      setUrlsMiniatura(prev => ({ ...prev, ...initialUrlsMiniatura }))
    }
  }, [initialUrlsMiniatura])
  // Fallback a resolución completa si aún no hay miniatura (p.ej. imagen recién
  // subida, antes del próximo SSR que genera su thumbnail).
  const resolverMiniatura = useCallback(
    (url: string | null | undefined) => (url ? (urlsMiniatura[url] ?? urlsFirmadas[url] ?? url) : ''),
    [urlsMiniatura, urlsFirmadas],
  )

  // Si una imagen falla (URL firmada expirada tras >6 h con la página abierta),
  // un refresh re-firma todo. Throttled para no ciclar.
  const ultimoRefreshImgRef = useRef(0)
  const onImgError = useCallback(() => {
    const now = Date.now()
    if (now - ultimoRefreshImgRef.current < 30_000) return
    ultimoRefreshImgRef.current = now
    router.refresh()
  }, [router])

  // ── Sync SSR props → state when router.refresh() delivers new server data ──
  // router.refresh() re-runs the server component (page.tsx) which fetches fresh
  // data and passes new props to this component. Since useState only initialises
  // from props once, we need a useEffect to pick up prop changes after the first
  // render. This is the reliable path when the browser Supabase client has a
  // stale/missing session (e.g. after token expiry between refreshes).
  const prevInitialActividadesRef = useRef(initialActividades)
  useEffect(() => {
    if (prevInitialActividadesRef.current !== initialActividades) {
      prevInitialActividadesRef.current = initialActividades
      setActividades(initialActividades)
    }
  }, [initialActividades])

  // ── Sync initialPeriodo SSR prop → periodo state ──────────────────────────
  // router.refresh() re-runs page.tsx on the server (fresh DB fetch), producing
  // a new initialPeriodo object. Without this effect the updated prop is silently
  // ignored because useState only reads the initial value on first render.
  // This is the fix for the "Informe enviado" button staying visible after submit.
  const prevInitialPeriodoRef = useRef(initialPeriodo)
  useEffect(() => {
    if (prevInitialPeriodoRef.current !== initialPeriodo) {
      prevInitialPeriodoRef.current = initialPeriodo
      setPeriodo(initialPeriodo)
      // Keep numPlanilla input in sync with any server-side value change
      if (initialPeriodo?.numero_planilla) {
        setNumPlanilla(initialPeriodo.numero_planilla)
      }
      // Keep mes de cotización in sync with server-side value
      setMesCotizacion(initialPeriodo?.cotizacion_mes ?? initialPeriodo?.mes ?? '')
    }
  }, [initialPeriodo])

  // Action state
  const [procesando, setProcesando] = useState(false)
  const [mostrarRechazo, setMostrarRechazo] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  // Fases del envío. Una sola variable en vez de un booleano: el botón queda
  // bloqueado de principio a fin —incluida la recarga del expediente— y a la
  // vez puede decir en qué va, que es lo que faltaba para no dejar al
  // contratista mirando un botón mudo sin saber si su informe salió.
  const [faseEnvio, setFaseEnvio] = useState<null | 'verificando' | 'enviando' | 'actualizando'>(null)

  // Confirmación del envío. Se separa de `faseEnvio` a propósito: la capa sigue
  // en pantalla un instante DESPUÉS de que el envío terminó, para dibujar el
  // check. Atarla a la misma variable la haría desaparecer justo cuando toca
  // mostrar que salió bien.
  const [mostrarEnvio, setMostrarEnvio] = useState(false)
  const [envioCompletado, setEnvioCompletado] = useState(false)
  const [envioError, setEnvioError] = useState<string | null>(null)

  // Qué clase de archivo se está adjuntando como evidencia. La galería admite
  // imágenes y PDF por el mismo camino, y el indicador necesita saberlo para no
  // llamar «imagen» a un documento.
  const [tipoEvidencia, setTipoEvidencia] = useState<'imagen' | 'documento'>('imagen')
  // Acta de terminación — modal obligatorio previo al último envío
  const [mostrarActa, setMostrarActa] = useState(false)
  const [actaPrefill, setActaPrefill] = useState<ActaPrefill | null>(null)
  const [actaFaltaFirma, setActaFaltaFirma] = useState(false)

  // Activity form state
  const [formActivo, setFormActivo] = useState<string | null>(null)
  const [nuevaActividad, setNuevaActividad] = useState('')
  const [nuevaCantidad, setNuevaCantidad] = useState(1)
  const [guardando, setGuardando] = useState(false)

  // Activity inline edit state
  const [editandoActividad, setEditandoActividad] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editCantidad, setEditCantidad] = useState(1)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  // Activity delete — inline confirmation + in-flight guard
  const [confirmarEliminarId, setConfirmarEliminarId] = useState<string | null>(null)
  const [eliminandoActividad, setEliminandoActividad] = useState<string | null>(null)


  // Planilla state
  const [numPlanilla, setNumPlanilla] = useState(initialPeriodo.numero_planilla ?? '')
  const [guardandoPlanilla, setGuardandoPlanilla] = useState(false)

  // Mes de cotización (validado por asesor/supervisor/admin durante la revisión)
  const [mesCotizacion, setMesCotizacion] = useState(
    initialPeriodo.cotizacion_mes ?? initialPeriodo.mes ?? ''
  )
  const [guardandoMesCotizacion, setGuardandoMesCotizacion] = useState(false)


  // Radicado state
  const [numRadicado, setNumRadicado] = useState('')
  const [radicando, setRadicando] = useState(false)
  const [editandoRadicado, setEditandoRadicado] = useState(false)
  const [numRadicadoEdit, setNumRadicadoEdit] = useState('')
  const [guardandoRadicado, setGuardandoRadicado] = useState(false)

  // Upload progress state per activity (null = idle, number = count of files uploading)
  const [subiendoEvidencia, setSubiendoEvidencia] = useState<Record<string, number | null>>({})
  // Adjuntos PDF por actividad + estado de subida y del visor integrado
  const [adjuntos, setAdjuntos] = useState<Record<string, AdjuntoDTO[]>>(initialAdjuntos)
  const [subiendoAdjunto, setSubiendoAdjunto] = useState<Record<string, string>>({})
  const [visorPDF, setVisorPDF] = useState<{ url: string; nombre: string } | null>(null)
  const [subiendoFactura, setSubiendoFactura] = useState(false)
  // Byte-level progress 0-100 per activity (M-1)
  // Pending DB registration: file uploaded to Storage but registrarEvidencia failed.
  // Persisted to localStorage so the user can retry step 3 after a page refresh.
  const PENDING_KEY = `pendiente_reg_${periodoId}`
  const [pendienteRegistro, setPendienteRegistro] = useState<Record<string, { publicUrl: string; storagePath: string; nombre: string; bytes?: number } | null>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = localStorage.getItem(`pendiente_reg_${periodoId}`)
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })

  // Shared file input refs — one for gallery, one for camera.
  // Using refs + programmatic .click() instead of hidden inputs inside <label> tags
  // because display:none inputs are silently ignored by iOS Safari and many Android
  // WebViews regardless of whether they are triggered via a wrapping label.
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef  = useRef<HTMLInputElement>(null)
  const uploadTargetId  = useRef<string>('')  // stores which actividadId is being uploaded

  // Planilla dropdown state
  const [planillaMenuAbierto, setPlanillaMenuAbierto] = useState(false)
  // Descarga del paquete desde el pipeline (con feedback)
  const [descargandoPaquete, setDescargandoPaquete] = useState(false)
  const [subiendoPlanilla, setSubiendoPlanilla] = useState(false)

  // Inline planilla rejection form (replaces window.prompt)
  const [mostrarFormRechazo, setMostrarFormRechazo] = useState(false)
  const [motivoRechazoInline, setMotivoRechazoInline] = useState('')
  const [rechazandoPlanilla, setRechazandoPlanilla] = useState(false)

  // Supervisor observation on the acta
  const [editandoObservacion, setEditandoObservacion] = useState(false)
  const [textoObservacion, setTextoObservacion] = useState('')
  const [guardandoObservacion, setGuardandoObservacion] = useState(false)

  // Lightbox — ampliar imagen de evidencia (evId opcional para eliminar desde lightbox)
  const [lightbox, setLightbox] = useState<{ url: string; alt: string; evId?: string } | null>(null)

  // Inline planilla validation (submit section)
  const [erroresCampos, setErroresCampos] = useState({ planilla: false, numero: false })
  const [errorFormatoPlanilla, setErrorFormatoPlanilla] = useState<string | null>(null)

  // Admin: base cotización SS
  const [editandoBase, setEditandoBase] = useState(false)
  const [valorBaseInput, setValorBaseInput] = useState('')
  const [guardandoBase, setGuardandoBase] = useState(false)

  // Admin: devoluciones forzadas
  const [destinoDevolver, setDestinoDevolver] = useState<'asesores' | 'supervisor' | 'contratista' | null>(null)
  const [motivoDevolver, setMotivoDevolver] = useState('')
  const [procesandoDevolver, setProcesandoDevolver] = useState(false)
  const seccionEnvioRef = useRef<HTMLDivElement>(null)

  // Secretaria: modal de devolución con elección de destino
  const [mostrarDevolverModal, setMostrarDevolverModal] = useState(false)
  const [destinoDevolucion, setDestinoDevolucion] = useState<'asesores' | 'contratista' | null>(null)
  const [motivoDevolucion, setMotivoDevolucion] = useState('')
  const [procesandoDevolucion, setProcesandoDevolucion] = useState(false)
  // Secretaria: confirmación de aprobación cuando faltan obligaciones por revisar
  const [mostrarConfirmacionAprobacion, setMostrarConfirmacionAprobacion] = useState(false)

  // ── Accordion: qué obligaciones están expandidas ───────────────
  // Vista colapsada por defecto (lista limpia, sin descargar imágenes hasta
  // que el usuario expande). Excepción: el contratista con informe rechazado
  // arranca expandido porque su tarea es justamente corregir actividades.
  const [obligacionesAbiertas, setObligacionesAbiertas] = useState<Set<string>>(() => {
    if (usuario?.rol === 'contratista' && initialPeriodo.estado === 'rechazado') {
      return new Set(initialObligaciones.map((o) => o.id))
    }
    return new Set()
  })
  const toggleObligacion = (oblId: string) => {
    setObligacionesAbiertas((prev) => {
      const next = new Set(prev)
      if (next.has(oblId)) next.delete(oblId)
      else next.add(oblId)
      return next
    })
  }
  const todasAbiertas = obligaciones.length > 0 && obligaciones.every((o) => obligacionesAbiertas.has(o.id))
  const toggleTodas = () => {
    setObligacionesAbiertas(todasAbiertas ? new Set() : new Set(obligaciones.map((o) => o.id)))
  }

  // ── Duplicate-evidence detection (asesor/supervisor only) ─────────────────
  const [duplicados, setDuplicados] = useState<Record<string, DuplicadoMatch[]>>(initialDuplicados)
  const [duplicadoModal, setDuplicadoModal] = useState<{ evId: string; matches: DuplicadoMatch[] } | null>(null)

  const prevInitialDuplicadosRef = useRef(initialDuplicados)
  useEffect(() => {
    if (prevInitialDuplicadosRef.current !== initialDuplicados) {
      prevInitialDuplicadosRef.current = initialDuplicados
      setDuplicados(initialDuplicados)
    }
  }, [initialDuplicados])

  // Silent background backfill: compute pHash for historical evidencias that didn't
  // have it at upload time, save to DB, then refresh to run the comparison again.
  useEffect(() => {
    if (!initialParaBackfill.length) return
    // Only run for reviewers — contratistas don't need duplicate detection
    if (!usuario) return

    async function runBackfill() {
      const updates: { id: string; phash: string }[] = []
      for (const ev of initialParaBackfill) {
        // resolverUrl: el bucket es privado — el Canvas necesita la URL firmada
        const phash = await computePerceptualHashFromUrl(resolverUrl(ev.url)).catch(() => '')
        if (phash) updates.push({ id: ev.id, phash })
      }
      if (updates.length) {
        await guardarHashesBatch(updates)
        // Refresh so page.tsx re-runs buscarDuplicados with the newly-stored hashes
        if (mountedRef.current) router.refresh()
      }
    }

    runBackfill()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParaBackfill])

  // ── Revisión por obligación (asesor/supervisor): ✓ aprobar + nota ─────────
  const [revisiones, setRevisiones] = useState<Record<string, RevisionLocal>>(initialRevisiones)
  // Default sin fila = aprobada, sin nota.
  const getRevision = (oblId: string): RevisionLocal => revisiones[oblId] ?? { aprobada: true, nota: null }
  const [notaModal, setNotaModal] = useState<{ obligacionId: string; texto: string } | null>(null)
  const [guardandoNota, setGuardandoNota] = useState(false)
  const [obligacionProcesando, setObligacionProcesando] = useState<string | null>(null)

  async function handleToggleAprobacion(obligacionId: string, numero: number) {
    const actual = getRevision(obligacionId)
    // Una obligación SIN REVISAR (sin fila) se muestra como pendiente aunque el
    // acta la dé por cumplida: el primer clic debe APROBARLA explícitamente.
    // Antes se calculaba !actual.aprobada, y como el default es `true`, ese
    // primer clic la marcaba como NO aprobada — lo contrario de lo que el
    // usuario creía estar haciendo, y sin ningún aviso.
    const sinRevisar = revisiones[obligacionId] === undefined
    const nuevoValor = sinRevisar ? true : !actual.aprobada
    // Optimista
    setRevisiones((prev) => ({
      ...prev,
      [obligacionId]: { aprobada: nuevoValor, nota: prev[obligacionId]?.nota ?? actual.nota },
    }))
    setObligacionProcesando(obligacionId)
    const res = await toggleAprobacionObligacion(periodoId, obligacionId, nuevoValor)
    if (res.error) {
      // Revertir
      setRevisiones((prev) => {
        const copia = { ...prev }
        if (sinRevisar) delete copia[obligacionId]
        else copia[obligacionId] = { aprobada: actual.aprobada, nota: prev[obligacionId]?.nota ?? actual.nota }
        return copia
      })
      toast.error(res.error)
    } else {
      toast.success(
        nuevoValor
          ? `Obligación ${numero} aprobada`
          : `Obligación ${numero} marcada como no cumplida`,
      )
    }
    setObligacionProcesando(null)
  }

  async function handleGuardarNota() {
    if (!notaModal) return
    const { obligacionId, texto } = notaModal
    const previa = getRevision(obligacionId)
    const limpio = texto.trim()
    setGuardandoNota(true)
    const res = await guardarNotaObligacion(periodoId, obligacionId, limpio)
    if (res.error) {
      toast.error(res.error)
      setGuardandoNota(false)
      return
    }
    // Optimista: la nota no cambia la aprobación.
    setRevisiones((prev) => ({
      ...prev,
      [obligacionId]: { aprobada: prev[obligacionId]?.aprobada ?? previa.aprobada, nota: limpio || null },
    }))
    setGuardandoNota(false)
    setNotaModal(null)
    toast.success(limpio ? 'Nota guardada' : 'Nota eliminada')
  }

  // Scroll anchors for rejection guidance
  const seccionActividadesRef = useRef<HTMLDivElement>(null)

  // Track mount state to prevent setState after unmount (e.g. navigation during upload)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Persist pendienteRegistro across page refreshes so the user can retry step 3
  useEffect(() => {
    try {
      const hasAny = Object.values(pendienteRegistro).some(v => v !== null)
      if (hasAny) localStorage.setItem(PENDING_KEY, JSON.stringify(pendienteRegistro))
      else localStorage.removeItem(PENDING_KEY)
    } catch { /* storage full or private mode — silent */ }
  }, [pendienteRegistro, PENDING_KEY])

  const cargarDatos = useCallback(async (silencioso = false) => {
    try {
      const datos = await getPeriodoConContrato(periodoId, contratoId)
      setContrato(datos.contrato)
      setPeriodo(datos.periodo)
      setObligaciones(datos.obligaciones)
      setActividades(datos.actividades)
      if (datos.periodo?.numero_planilla) setNumPlanilla(datos.periodo.numero_planilla)
    } catch {
      // Keep showing existing data on transient network errors
    } finally {
      if (!silencioso) setCargando(false)
    }
  }, [periodoId, contratoId])

  // Lightweight refresh — only re-fetches actividades+evidencias after activity mutations.
  // Avoids the full 4-query reload that cargarDatos() does (contrato+periodo+obligaciones+actividades).
  const cargarActividades = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('actividades')
        .select('*, evidencias(*)')
        .eq('periodo_id', periodoId)
        .order('orden')
      if (data) setActividades(data as Actividad[])
    } catch {
      // Keep showing existing data on transient errors
    }
  }, [periodoId])

  // No initial useEffect fetch — data arrives as SSR props (see page.tsx).
  // cargarDatos is called explicitly after mutations and by the 30s poller below.

  // Background polling — contratista sees estado changes without manual refresh.
  // Interval raised 30s → 90s and paused while the tab is hidden to cut the
  // background query load on Supabase (Disk IO). When the tab regains focus we
  // fetch once immediately so the user never sees stale data on return.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') cargarDatos(true)
    }
    const timer = setInterval(tick, 90_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') cargarDatos(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [cargarDatos])

  // Dismiss delete-confirm on click-outside or Escape
  useEffect(() => {
    if (!confirmarEliminarId) return
    const dismiss = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      setConfirmarEliminarId(null)
    }
    document.addEventListener('click', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('click', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [confirmarEliminarId])

  // Cerrar lightbox con tecla Escape
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

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
        ? `Tu informe ha sido radicado con el No. ${periodo.numero_radicado}`
        : 'Tu informe ha sido radicado exitosamente'
      toast.success(msg, { duration: 6000 })
    }
  }, [periodo?.estado, periodo?.numero_radicado, usuario?.rol])

  // ── Derived values ──────────────────────────────────────────

  const esHistorico = periodo?.es_historico === true
  const esAsesor = usuario?.rol === 'asesor' || usuario?.rol === 'admin'
  const esSecretaria = usuario?.rol === 'supervisor' || usuario?.rol === 'admin'
  const esContratista = usuario?.rol === 'contratista'

  /**
   * Único punto del flujo que cambia para los contratistas obligados a
   * facturar electrónicamente: no se les genera la Cuenta de Cobro, adjuntan
   * su factura. Todo lo demás —informe, actas, planilla— es idéntico.
   */
  const exigeFacturaElectronica =
    (contrato as { contratista?: { obligado_facturar_electronicamente?: boolean | null } })
      ?.contratista?.obligado_facturar_electronicamente === true


  // Progreso de revisión por obligación — usado en el panel de secretaria
  const obligacionesConRevision = obligaciones.filter(obl => revisiones[obl.id] !== undefined)
  const obligacionesSinRevisar = obligaciones.filter(obl => revisiones[obl.id] === undefined)
  const todasRevisadas = obligaciones.length > 0 && obligacionesSinRevisar.length === 0
  const progresoRevision = obligaciones.length > 0 ? obligacionesConRevision.length / obligaciones.length : 0

  // Past-month lock: contratistas cannot edit borrador periods from previous months
  // (rechazado periods remain editable regardless of date)
  const MES_INDEX: Record<string, number> = {
    ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3,
    MAYO: 4, JUNIO: 5, JULIO: 6, AGOSTO: 7,
    SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
  }
  const periodoVencido = (() => {
    if (!esContratista || !periodo) return false
    if (periodo.estado === 'rechazado') return false
    if (periodo.habilitado_tardio) return false
    const now = new Date()
    const mesIdx = MES_INDEX[(periodo.mes as string).toUpperCase()] ?? -1
    if ((periodo.anio as number) < now.getFullYear()) return true
    if ((periodo.anio as number) === now.getFullYear() && mesIdx < now.getMonth()) return true
    return false
  })()

  // Same check, but visible to all roles — used to show supervisor's late-unlock panel.
  // Only relevant when the period can still be acted on (borrador/rechazado).
  const esPeriodoPasado = (() => {
    if (!periodo || periodo.es_historico) return false
    if (!['borrador', 'rechazado'].includes(periodo.estado)) return false
    const now = new Date()
    const mesIdx = MES_INDEX[(periodo.mes as string).toUpperCase()] ?? -1
    if ((periodo.anio as number) < now.getFullYear()) return true
    if ((periodo.anio as number) === now.getFullYear() && mesIdx < now.getMonth()) return true
    return false
  })()

  const esEditable = !esHistorico && !periodoVencido && (periodo ? ESTADOS_EDITABLES.includes(periodo.estado) : false)
  /**
   * Quién puede adjuntarla: la contratista mientras el informe sea editable, y
   * el administrador siempre —también sobre informes ya enviados, igual que
   * ocurre con la planilla—. Es el mismo alcance que aplica prepararUploadFactura
   * en el servidor.
   */
  const puedeAdjuntarFactura =
    usuario?.rol === 'admin' || (esEditable && esContratista)

  // ── Mes de cotización: meses disponibles (rango del contrato) ──────────────
  // El selector ofrece cualquier mes dentro del rango del contrato.
  const mesesContrato = (() => {
    if (!contrato?.fecha_inicio || !contrato?.fecha_fin) return [...MESES]
    const ini = new Date(contrato.fecha_inicio + 'T00:00:00')
    const fin = new Date(contrato.fecha_fin + 'T00:00:00')
    const out: string[] = []
    const cursor = new Date(ini.getFullYear(), ini.getMonth(), 1)
    const tope = new Date(fin.getFullYear(), fin.getMonth(), 1)
    while (cursor <= tope && out.length < 24) {
      out.push(MESES[cursor.getMonth()])
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return out.length ? out : [...MESES]
  })()

  // Detección de "mes vencido": el mes de cotización confirmado/sugerido difiere
  // del mes del informe. Es una ayuda visual, no un bloqueo.
  const mesCotizacionActual = periodo?.cotizacion_mes ?? periodo?.mes ?? ''
  const esMesVencido = !!periodo && !!mesCotizacionActual &&
    mesCotizacionActual.toLowerCase() !== (periodo.mes ?? '').toLowerCase()
  const mesCotizacionSinVerificar = periodo?.cotizacion_origen !== 'confirmado'

  // ── Alertas de planilla (2 niveles) ────────────────────────────────────────
  // Cuenta cuántos periodos del contrato usan el MISMO número de planilla que el
  // periodo actual. Una planilla PILA cubre un solo pago; reutilizarla está
  // amparado por "mes vencido" hasta 2 periodos (pago al día + 1 mes de desfase).
  // Un 3er uso implica un desfase ≥ 2 meses → un mes probablemente quedó sin cotizar.
  const numPlanillaActual = (periodo?.numero_planilla ?? '').trim()
  const repeticionesPlanilla = numPlanillaActual
    ? periodosHermanos.filter(p => (p.numero_planilla ?? '').trim() === numPlanillaActual).length
    : 0

  // 🔴 Roja: el mismo número aparece en 3 o más periodos del contrato.
  const alertaRojaPlanilla = repeticionesPlanilla >= 3
  // 🟠 Naranja: mes vencido (la planilla cotiza un mes distinto al del informe),
  //    o el número se reutiliza en 2 periodos. No se muestra si ya hay alerta roja.
  const alertaNaranjaPlanilla = !alertaRojaPlanilla && (esMesVencido || repeticionesPlanilla === 2)

  const nivelAlertaPlanilla: 'roja' | 'naranja' | null =
    alertaRojaPlanilla ? 'roja' : alertaNaranjaPlanilla ? 'naranja' : null

  const mensajeAlertaPlanilla = alertaRojaPlanilla
    ? `La planilla N.° ${numPlanillaActual} se está usando en ${repeticionesPlanilla} periodos de este contrato. ` +
      `El "mes vencido" solo cubre un desfase de un mes; reutilizarla más veces sugiere que un mes de cotización quedó sin pagar. ` +
      `Verifica que no falte la planilla de un mes intermedio antes de aprobar.`
    : alertaNaranjaPlanilla
      ? (esMesVencido
          ? `Esta planilla cotiza ${mesCotizacionActual}, distinto al mes del informe (${periodo?.mes}). ` +
            `Corresponde a un pago de seguridad social por mes vencido, lo cual es válido. Verifica que sea correcto.`
          : `La planilla N.° ${numPlanillaActual} se repite en dos periodos del contrato, lo que suele indicar un pago por mes vencido. Verifica que sea correcto.`)
      : ''

  // Planilla: contratista puede gestionar hasta que esté aprobado o radicado
  const esPlanillaGestionable = !esHistorico && !periodoVencido && esContratista && periodo
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

  // La certificación de retención es única por contrato → su descarga se
  // muestra SOLO en el primer periodo (el de menor número) y solo si ya existe.
  const esPrimerPeriodo = periodo != null && (
    periodosHermanos.length > 0
      ? periodo.numero_periodo === Math.min(...periodosHermanos.map(p => p.numero_periodo))
      : periodo.numero_periodo === 1
  )
  const mostrarCertificacion = esPrimerPeriodo && certDisponible

  // El acta de terminación es única por contrato → su descarga se muestra SOLO
  // en el último periodo (el de mayor número) y solo si ya fue aceptada.
  const esUltimoPeriodo = periodo != null && periodosHermanos.length > 0 &&
    periodo.numero_periodo === Math.max(...periodosHermanos.map(p => p.numero_periodo))
  const mostrarActaTerminacion = esUltimoPeriodo && actaTerminacionDisponible

  // ── Descarga del pipeline (Opción B) — ZIP completo filtrado por rol ───────
  // Al tocar el nodo Aprobado/Radicado se descargan TODOS los documentos del
  // rol de una vez (un solo ZIP, ya existente): contratista → SECOP
  // (Informe + Cuenta + Planilla); asesor/supervisor → ACTAS (Supervisión + Pago).
  const zipPipelineHref = esContratista
    ? `/api/pdf/${periodoId}/secop`
    : (esAsesor || esSecretaria)
      ? `/api/pdf/${periodoId}/actas`
      : null

  // Can see documents after sending
  // La sección de documentos se destapa en cuanto el periodo deja de ser
  // borrador. Durante el envío eso ocurría MIENTRAS la confirmación seguía en
  // pantalla: el expediente completo se materializaba al fondo, tras un velo
  // que deja verlo. Con la capa visible el fondo se queda quieto; los
  // documentos aparecen al cerrarse, como consecuencia de lo que se acaba de
  // ver.
  const puedeVerDocumentos = periodo
    ? periodo.estado !== 'borrador' && !mostrarEnvio
    : false

  function actividadesPorObligacion(obligacionId: string) {
    return actividades.filter((a) => a.obligacion_id === obligacionId)
  }

  function evidenciasPorObligacion(obligacionId: string) {
    return actividadesPorObligacion(obligacionId).reduce(
      (sum, a) => sum + (a.evidencias?.length ?? 0),
      0,
    )
  }

  function totalAcciones() {
    return actividades.reduce((sum, a) => sum + (a.cantidad || 1), 0)
  }

  // ── Handlers ────────────────────────────────────────────────

  async function doEnviar() {
    setFaseEnvio('enviando')
    setEnvioError(null)
    setEnvioCompletado(false)
    setMostrarEnvio(true)
    try {
      const result = await enviarPeriodo(periodoId)
      if (result.error) {
        // El error se muestra DENTRO de la confirmación: un aviso flotante
        // detrás de una capa a pantalla completa no se lee.
        setEnvioError(result.error)
        return
      }

      // AQUÍ el envío ya es un hecho: el servidor respondió sin error, el
      // periodo cambió de estado y los avisos salieron. La confirmación se
      // marca en este punto y NO después de recargar la pantalla.
      //
      // Antes esperaba a `cargarDatos()`, y eso ataba la confirmación a una
      // consulta del navegador que no tiene timeout (ver lib/supabase.ts: el
      // corte de 15 s cubre solo /auth/v1/, para no abortar subidas lentas).
      // Si esa consulta se colgaba, el aviso se quedaba en pantalla para
      // siempre pese a que el informe se había enviado correctamente —llegaba
      // el correo y todo—, y solo recargando se veía que había funcionado.
      setEnvioCompletado(true)

      // La recarga es cortesía visual, no parte de la confirmación: refresca
      // el expediente por detrás mientras la capa termina su animación. Si
      // tarda o falla, la pantalla se actualizará igual cuando responda.
      setFaseEnvio('actualizando')
      router.refresh()
      void cargarDatos()
    } catch {
      // Caída de red al invocar la acción. Sin este catch el botón se quedaría
      // deshabilitado para siempre y solo un F5 lo recuperaría.
      setEnvioError('No se pudo completar el envío. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setFaseEnvio(null)
    }
  }

  async function handleEnviar() {
    if (faseEnvio) return

    const faltaPlanilla = !periodo?.planilla_ss_url
    const faltaNumero = !numPlanilla.trim()

    if (faltaPlanilla || faltaNumero) {
      setErroresCampos({ planilla: faltaPlanilla, numero: faltaNumero })
      toast.error('Para enviar el informe de actividades, debes adjuntar la planilla de seguridad social valida')
      seccionEnvioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setErroresCampos({ planilla: false, numero: false })

    // Acta de terminación: obligatoria antes del ÚLTIMO informe del contrato.
    setFaseEnvio('verificando')
    let acta: Awaited<ReturnType<typeof verificarActaTerminacionRequerida>>
    try {
      acta = await verificarActaTerminacionRequerida(periodoId)
    } catch {
      toast.error('No se pudo verificar el informe. Revisa tu conexión e inténtalo de nuevo.')
      setFaseEnvio(null)
      return
    }

    if (acta.requerida && acta.prefill) {
      setActaPrefill(acta.prefill)
      setActaFaltaFirma(acta.faltaFirma)
      setMostrarActa(true)
      setFaseEnvio(null)
      return
    }

    // Sin soltar la fase entre la verificación y el envío: si se pusiera a
    // null aquí, el botón parpadearía «Enviar a revisión» un instante y
    // admitiría un segundo clic.
    await doEnviar()
  }

  async function handleAprobarAsesor() {
    setProcesando(true)
    const result = await aprobarComoAsesor(periodoId)
    if (result.error) toast.error(result.error)
    else { toast.success('Informe aprobado como asesor'); router.refresh(); cargarDatos() }
    setProcesando(false)
  }

  async function handleRevocarPreaprobacion() {
    setProcesando(true)
    const result = await revocarPreaprobacion(periodoId)
    if (result.error) toast.error(result.error)
    else { toast.success('Aprobación revocada'); router.refresh(); cargarDatos() }
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
      router.refresh(); cargarDatos()
    }
    setProcesando(false)
  }

  async function handleAprobarSecretaria() {
    // Si hay obligaciones sin revisar, pedir confirmación antes de aprobar
    if (!todasRevisadas && obligaciones.length > 0) {
      setMostrarConfirmacionAprobacion(true)
      return
    }
    setProcesando(true)
    const result = await aprobarPeriodos([periodoId])
    if (result.error) toast.error(result.error)
    else { toast.success('Informe aprobado'); router.refresh(); cargarDatos() }
    setProcesando(false)
  }

  async function handleConfirmarAprobacion() {
    setMostrarConfirmacionAprobacion(false)
    setProcesando(true)
    const result = await aprobarPeriodos([periodoId])
    if (result.error) toast.error(result.error)
    else { toast.success('Informe aprobado'); router.refresh(); cargarDatos() }
    setProcesando(false)
  }

  async function handleDevolverSecretaria(destino: 'asesores' | 'contratista', motivo: string) {
    if (!motivo.trim()) {
      toast.error('El motivo es obligatorio')
      return
    }
    setProcesandoDevolucion(true)
    const result = destino === 'asesores'
      ? await rechazarPeriodos([periodoId], motivo.trim())
      : await devolverPeriodoAContratista(periodoId, motivo.trim())
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(destino === 'asesores' ? 'Informe devuelto a los asesores' : 'Informe devuelto al contratista')
      setMostrarDevolverModal(false)
      setDestinoDevolucion(null)
      setMotivoDevolucion('')
      router.refresh()
      cargarDatos()
    }
    setProcesandoDevolucion(false)
  }

  async function handleRechazarSecretaria() {
    setProcesando(true)
    const result = await rechazarPeriodos([periodoId], motivoRechazo)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Devuelto a los asesores para revisión')
      setMostrarRechazo(false)
      setMotivoRechazo('')
      router.refresh(); cargarDatos()
    }
    setProcesando(false)
  }

  async function handleRadicado() {
    setRadicando(true)
    const result = await marcarRadicado(periodoId, numRadicado)
    if (result.error) toast.error(result.error)
    else {
      const msg = numRadicado.trim()
        ? `Radicado con No. ${numRadicado.trim()}`
        : 'Periodo marcado como radicado'
      toast.success(msg)
      router.refresh(); cargarDatos()
    }
    setRadicando(false)
  }

  function handleAbrirEditRadicado() {
    setNumRadicadoEdit(periodo?.numero_radicado ?? '')
    setEditandoRadicado(true)
  }

  async function handleGuardarRadicadoEdit() {
    setGuardandoRadicado(true)
    const result = await actualizarNumeroRadicado(periodoId, numRadicadoEdit)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Número de radicado actualizado')
      setEditandoRadicado(false)
      cargarDatos()
    }
    setGuardandoRadicado(false)
  }

  async function handleGuardarObservacion(texto: string | null) {
    setGuardandoObservacion(true)
    const result = await actualizarObservacionSupervisor(periodoId, texto)
    if (result.error) toast.error(result.error)
    else {
      toast.success(texto?.trim() ? 'Observación guardada' : 'Observación eliminada')
      setEditandoObservacion(false)
      cargarDatos()
    }
    setGuardandoObservacion(false)
  }

  async function handleAdminDevolver() {
    if (!destinoDevolver) return
    if (destinoDevolver === 'contratista' && !motivoDevolver.trim()) {
      toast.error('El motivo es obligatorio al devolver al contratista')
      return
    }
    setProcesandoDevolver(true)
    const result = await adminDevolverPeriodo(periodoId, destinoDevolver, motivoDevolver.trim() || undefined)
    if (result.error) {
      toast.error(result.error)
    } else {
      const label = destinoDevolver === 'asesores' ? 'asesores' : destinoDevolver === 'supervisor' ? 'supervisor' : 'contratista'
      toast.success(`Periodo devuelto a ${label}`)
      setDestinoDevolver(null)
      setMotivoDevolver('')
      router.refresh(); cargarDatos()
    }
    setProcesandoDevolver(false)
  }

  async function handleGuardarBase() {
    const valor = parseInt(valorBaseInput.replace(/\D/g, ''), 10)
    if (!valorBaseInput.trim() || isNaN(valor) || valor <= 0) {
      toast.error('Ingresa un valor numérico válido')
      return
    }
    setGuardandoBase(true)
    const result = await actualizarBaseCotizacion(periodoId, valor)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Base de cotización actualizada')
      setEditandoBase(false)
      cargarDatos()
    }
    setGuardandoBase(false)
  }

  async function handleRestablecerBase() {
    setGuardandoBase(true)
    const result = await actualizarBaseCotizacion(periodoId, null)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Base restablecida al valor por defecto')
      setEditandoBase(false)
      cargarDatos()
    }
    setGuardandoBase(false)
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
    else {
      toast.success('Actividad registrada')
      setNuevaActividad('')
      setNuevaCantidad(1)
      setFormActivo(null)
      // router.refresh() re-runs the server component which always has a valid
      // server-side session. The new initialActividades prop is then picked up
      // by the useEffect above and synced into local state.
      // cargarActividades() runs concurrently as an optimistic fast path —
      // whichever resolves first wins; if the browser client session is stale
      // the server refresh is the reliable fallback.
      router.refresh()
      cargarActividades()
    }
    setGuardando(false)
  }

  async function handleConfirmarEliminar(actId: string) {
    setConfirmarEliminarId(null)
    setEliminandoActividad(actId)
    const result = await eliminarActividad(actId)
    if (result.error) toast.error(result.error)
    else { toast.success('Actividad eliminada'); router.refresh(); cargarActividades() }
    setEliminandoActividad(null)
  }

  function handleAbrirEdicion(actId: string, descripcion: string, cantidad: number) {
    setEditandoActividad(actId)
    setEditDesc(descripcion)
    setEditCantidad(cantidad)
  }

  function handleCancelarEdicion() {
    setEditandoActividad(null)
    setEditDesc('')
    setEditCantidad(1)
  }

  async function handleGuardarEdicion(actId: string) {
    if (!editDesc.trim()) { toast.error('La descripción no puede estar vacía'); return }
    setGuardandoEdicion(true)
    const result = await actualizarActividad(actId, periodoId, editDesc, editCantidad)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Actividad actualizada')
      handleCancelarEdicion()
      router.refresh()
      cargarActividades()
    }
    setGuardandoEdicion(false)
  }

  // ── Evidence upload helpers ──────────────────────────────────

  /**
   * Upload 1–5 evidence files for an activity.
   *
   * Architecture — why this order matters:
   *   A) Compress in PARALLEL — pure browser Canvas API; safe to parallelise.
   *   B) Prepare signed URLs SEQUENTIALLY — prevents Date.now() path collision
   *      when calls arrive within the same millisecond, and avoids saturating
   *      Supabase's free-tier connection pool with 5 simultaneous query chains.
   *      Auth is validated server-side inside each prepararUploadEvidencia call.
   *   C) XHR uploads in PARALLEL — browser → Supabase Storage directly,
   *      completely bypasses Vercel; no serverless timeout risk here.
   *   D) DB registration SEQUENTIALLY — keeps insert order deterministic.
   *      If session expired, registrarEvidencia returns an error and the file
   *      is stored in pendienteRegistro for the user to retry.
   *   E) try/finally ALWAYS clears the overlay — eliminates the "stuck loading"
   *      state that occurred when an unhandled throw left the counter non-null.
   */
  /**
   * Sube un PDF como anexo de la actividad. Se separa de las imágenes porque el
   * pipeline es distinto: sin compresión (un PDF no se recomprime en el
   * navegador) y con verificación del contenido real en el servidor.
   */
  /**
   * Reconsulta los anexos del periodo.
   *
   * Necesario tras añadir o eliminar: el servidor renumera TODOS los anexos en
   * orden de lectura del informe, así que un cambio en una actividad puede
   * mover el número de otra. Sin esta resincronización la pantalla mostraría
   * un "Anexo N" que no coincide con el del PDF.
   */
  async function sincronizarAdjuntos() {
    const filas = await listarAdjuntos(periodoId)
    const porActividad: Record<string, AdjuntoDTO[]> = {}
    for (const f of filas) {
      if (!f.actividad_id) continue
      ;(porActividad[f.actividad_id] ??= []).push(f)
    }
    setAdjuntos(porActividad)
  }

  async function handleSubirAdjuntos(actividadId: string, files: File[]) {
    for (const file of files) {
      setSubiendoAdjunto(prev => ({ ...prev, [actividadId]: file.name }))
      try {
        const prep = await prepararUploadAdjunto(periodoId, file.name, file.size, actividadId)
        if (prep.error || !prep.data) { toast.error(prep.error ?? 'No se pudo preparar la subida'); continue }

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.timeout = 120_000
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
            ? resolve() : reject(new Error(`Error al subir (HTTP ${xhr.status})`))
          xhr.onerror = () => reject(new Error('Error de red al subir el documento'))
          xhr.ontimeout = () => reject(new Error('La subida tardó demasiado. Verifica tu conexión.'))
          xhr.open('PUT', prep.data!.signedUrl)
          xhr.setRequestHeader('Content-Type', 'application/pdf')
          xhr.send(file)
        })

        const res = await registrarAdjunto(periodoId, prep.data.path, file.name, actividadId)
        if (res.error) { toast.error(res.error); continue }
        if (res.data) {
          setAdjuntos(prev => ({ ...prev, [actividadId]: [...(prev[actividadId] ?? []), res.data!] }))
          toast.success(`Documento adjuntado: ${file.name}`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al subir el documento')
      } finally {
        setSubiendoAdjunto(prev => { const c = { ...prev }; delete c[actividadId]; return c })
      }
    }
    // Una sola reconsulta al final del lote: la numeración de los demás anexos
    // pudo desplazarse al insertar estos.
    await sincronizarAdjuntos().catch(() => {})
  }

  async function handleEliminarAdjunto(actividadId: string, adjuntoId: string) {
    const res = await eliminarAdjunto(periodoId, adjuntoId)
    if (res.error) { toast.error(res.error); return }
    setAdjuntos(prev => ({
      ...prev,
      [actividadId]: (prev[actividadId] ?? []).filter(a => a.id !== adjuntoId),
    }))
    toast.success('Documento eliminado')
    // Los anexos posteriores bajan un número: hay que releerlos.
    await sincronizarAdjuntos().catch(() => {})
  }

  /**
   * Punto de entrada único de "Adjuntar evidencia": reparte los archivos según
   * su tipo real. El usuario elige de una sola vez y no tiene que saber si lo
   * que sube es una foto o un documento.
   */
  function handleAdjuntarEvidencia(actividadId: string, files: File[]) {
    const esPdf = (f: File) =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    const pdfs = files.filter(esPdf)
    const imagenes = files.filter(f => !esPdf(f))

    if (imagenes.length) void handleSubirEvidencias(actividadId, imagenes)
    if (pdfs.length) void handleSubirAdjuntos(actividadId, pdfs)
  }

  async function handleSubirEvidencias(actividadId: string, files: File[]) {
    const limited = files.slice(0, 5)
    if (files.length > 5) {
      toast.warning('Solo se permiten 5 imágenes a la vez. Se subirán las primeras 5.')
    }

    setTipoEvidencia(limited.every(f => f.type === 'application/pdf') ? 'documento' : 'imagen')
    setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: limited.length }))

    try {
      // A: Compress files and compute hashes in parallel (all pure Canvas / Web Crypto)
      const [compressed, hashes] = await Promise.all([
        Promise.all(limited.map(f => comprimirEvidencia(f))),
        Promise.all(limited.map(async f => ({
          fileHash: await computeFileHash(f).catch(() => ''),
          phash: await computePerceptualHash(f).catch(() => ''),
        }))),
      ])

      // B+D: For each file, request its signed URL and start the XHR upload immediately,
      //      all in parallel. Each file tracks its own byte-level progress (M-1) and
      //      retries up to 2× on network/timeout failures (M-2).
      const totalBytes = Math.max(1, compressed.reduce((sum, f) => sum + f.size, 0))
      const loadedBytes = new Array(compressed.length).fill(0)

      // M-2: XHR upload with automatic retry on network/timeout failures.
      // HTTP errors (4xx/5xx) are NOT retried — they indicate a real problem.
      function subirConReintentos(
        signedUrl: string, file: File, mime: string,
        onProgress: (loaded: number) => void,
        maxReintentos = 2,
      ): Promise<void> {
        async function intento(n: number): Promise<void> {
          if (n > 0) await new Promise(r => setTimeout(r, n * 1_000)) // 1 s, 2 s backoff
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.timeout = 90_000
            // M-1: report actual bytes loaded so the UI can show real progress
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded) }
            xhr.onload = () => xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(Object.assign(new Error(`HTTP ${xhr.status}`), { esHttp: true }))
            xhr.onerror = () => reject(new Error('Error de red al subir la imagen'))
            xhr.ontimeout = () => reject(new Error('La imagen tardó demasiado en subirse. Intenta con una imagen más pequeña o verifica tu conexión.'))
            xhr.open('PUT', signedUrl)
            xhr.setRequestHeader('Content-Type', mime)
            xhr.send(file)
          })
        }
        async function loop(n: number): Promise<void> {
          try { await intento(n) }
          catch (e: unknown) {
            if ((e as { esHttp?: boolean }).esHttp || n >= maxReintentos) throw e
            return loop(n + 1)
          }
        }
        return loop(0)
      }

      const xhrResults = await Promise.allSettled(
        compressed.map(async (fileToUpload, idx) => {
          const mime = fileToUpload.type.startsWith('image/') ? fileToUpload.type : 'image/jpeg'

          // Step 1: get signed URL just-in-time (server-side auth + validation)
          const prep = await prepararUploadEvidencia(
            actividadId, periodoId,
            fileToUpload.name, fileToUpload.size, fileToUpload.type,
          )
          if (prep.error || !prep.data) {
            throw new Error(prep.error ?? 'Error al preparar la subida')
          }

          const { signedUrl, path, publicUrl } = prep.data

          // Step 2: upload with retry. El avance en bytes ya no se muestra —el
          // indicador es igual en los doce puntos de carga— pero el callback
          // sigue existiendo porque subirConReintentos lo exige.
          await subirConReintentos(signedUrl, fileToUpload, mime, (loaded) => {
            loadedBytes[idx] = loaded
          })

          return { publicUrl, storagePath: path, nombre: fileToUpload.name, bytes: fileToUpload.size }
        }),
      )

      // E: Register successful uploads in DB sequentially
      let successCount = 0
      for (let i = 0; i < xhrResults.length; i++) {
        const res = xhrResults[i]
        if (res.status === 'rejected') {
          toast.error(res.reason instanceof Error ? res.reason.message : 'Error al subir imagen')
          continue
        }

        const { publicUrl, storagePath, nombre, bytes } = res.value
        const reg = await registrarEvidencia(
          actividadId, periodoId, publicUrl, storagePath, nombre,
          hashes[i]?.fileHash || undefined,
          hashes[i]?.phash || undefined,
          bytes,
        )
        // La imagen recién subida se renderiza con la URL firmada devuelta por
        // el registro (el bucket es privado; router.refresh() la renovará).
        if (reg.data?.urlFirmada) {
          setUrlsFirmadas(prev => ({ ...prev, [publicUrl]: reg.data!.urlFirmada! }))
        }
        if (reg.error) {
          setPendienteRegistro(prev => ({ ...prev, [actividadId]: { publicUrl, storagePath, nombre, bytes } }))
          toast.error('La imagen se subió pero no se pudo registrar. Toca "Reintentar" para completar.', { duration: 8000 })
        } else {
          successCount++
        }
      }

      if (successCount > 0) {
        toast.success(successCount === 1 ? 'Imagen subida' : `${successCount} imágenes subidas`)
        if (mountedRef.current) {
          router.refresh()
          cargarActividades()
        }
      }
    } finally {
      // F: Always clear overlay + progress — no more "stuck loading" state
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
    }
  }

  async function handleEliminarEvidencia(evId: string) {
    const result = await eliminarEvidencia(evId)
    if (result.error) toast.error(result.error)
    else { toast.success('Evidencia eliminada'); router.refresh(); cargarActividades() }
  }

  async function handleReintentarRegistro(actividadId: string) {
    const pending = pendienteRegistro[actividadId]
    if (!pending) return
    setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: 1 }))
    try {
      const reg = await registrarEvidencia(actividadId, periodoId, pending.publicUrl, pending.storagePath ?? '', pending.nombre, undefined, undefined, pending.bytes)
      if (reg.error) {
        toast.error(`Reintento fallido: ${reg.error}`)
      } else {
        setPendienteRegistro(prev => ({ ...prev, [actividadId]: null }))
        toast.success('Evidencia registrada')
        if (mountedRef.current) { router.refresh(); cargarActividades() }
      }
    } finally {
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
    }
  }

  async function handleSubirPlanilla(file: File) {
    setSubiendoPlanilla(true)
    try {
      // Step 1 — server validates auth + period state, returns presigned URL
      const prep = await prepararUploadPlanilla(periodoId, file.name, file.size)
      if (prep.error || !prep.data) {
        toast.error(prep.error ?? 'Error al preparar la subida')
        return
      }
      const { signedUrl, publicUrl } = prep.data

      // Step 2 — XHR upload directly to Supabase Storage (bypasses Vercel entirely)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.timeout = 120_000  // 2 min — PDFs can be large
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Error al subir: HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Error de red al subir la planilla'))
        xhr.ontimeout = () => reject(new Error('Tiempo de espera agotado. Verifica tu conexión e intenta de nuevo.'))
        xhr.open('PUT', signedUrl)
        xhr.setRequestHeader('Content-Type', 'application/pdf')
        xhr.send(file)
      })

      // Step 3 — register the URL in the DB
      const confirm = await confirmarUploadPlanilla(periodoId, publicUrl)
      if (confirm.error) { toast.error(confirm.error); return }
      // URL firmada para que el enlace "ver planilla" funcione de inmediato
      if (confirm.data?.urlFirmada) {
        setUrlsFirmadas(prev => ({ ...prev, [publicUrl]: confirm.data!.urlFirmada! }))
      }

      toast.success('Planilla subida exitosamente')
      setPlanillaMenuAbierto(false)
      cargarDatos()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al subir la planilla')
    } finally {
      setSubiendoPlanilla(false)
    }
  }

  /**
   * Factura electrónica — mismo recorrido que la planilla: URL prefirmada y
   * subida directa del navegador a Storage, sin pasar por Vercel.
   */
  async function handleSubirFactura(file: File) {
    setSubiendoFactura(true)
    try {
      const prep = await prepararUploadFactura(periodoId, file.name, file.size)
      if (prep.error || !prep.data) { toast.error(prep.error ?? 'Error al preparar la subida'); return }
      const { signedUrl, publicUrl, path } = prep.data

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.timeout = 120_000
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300
          ? resolve() : reject(new Error(`Error al subir: HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Error de red al subir la factura'))
        xhr.ontimeout = () => reject(new Error('Tiempo de espera agotado. Verifica tu conexión.'))
        xhr.open('PUT', signedUrl)
        xhr.setRequestHeader('Content-Type', 'application/pdf')
        xhr.send(file)
      })

      const confirm = await confirmarUploadFactura(periodoId, publicUrl, path)
      if (confirm.error) { toast.error(confirm.error); return }
      if (confirm.data?.urlFirmada) {
        setUrlsFirmadas(prev => ({ ...prev, [publicUrl]: confirm.data!.urlFirmada! }))
      }
      toast.success('Factura electrónica adjuntada')
      cargarDatos()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al subir la factura')
    } finally {
      setSubiendoFactura(false)
    }
  }

  async function handleEliminarFactura() {
    const res = await eliminarFactura(periodoId)
    if (res.error) toast.error(res.error)
    else { toast.success('Factura eliminada'); cargarDatos() }
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
      toast.success(estado === 'aprobada' ? 'Planilla aprobada' : 'Planilla rechazada')
      setPlanillaMenuAbierto(false)
      cargarDatos()
    }
  }

  async function handleGuardarNumeroPlanilla() {
    const errorFormato = validarNumeroPlanilla(numPlanilla)
    if (errorFormato) { setErrorFormatoPlanilla(errorFormato); return }
    setErrorFormatoPlanilla(null)
    setGuardandoPlanilla(true)
    const result = await guardarNumeroPlanilla(periodoId, numPlanilla)
    if (result.error) toast.error(result.error)
    else toast.success('Número de planilla guardado')
    setGuardandoPlanilla(false)
  }

  async function handleGuardarMesCotizacion(mes: string) {
    setMesCotizacion(mes)
    setGuardandoMesCotizacion(true)
    const result = await guardarMesCotizacion(periodoId, mes)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Mes de cotización confirmado')
      router.refresh()
    }
    setGuardandoMesCotizacion(false)
  }

  // Descarga del paquete ZIP desde el nodo del pipeline, con feedback de progreso.
  // Hace fetch del ZIP (mostrando toast + spinner) y dispara la descarga al llegar,
  // en vez de un <a download> silencioso que deja al usuario sin saber qué pasa.
  async function handleDescargarPaquete(href: string) {
    if (descargandoPaquete) return
    setDescargandoPaquete(true)
    const toastId = toast.loading('Generando documentos…')
    try {
      const res = await fetch(href)
      if (!res.ok) {
        // Datos incompletos (422) u otro error: mostrar el mensaje real del servidor
        let msg = 'No se pudo generar el paquete'
        try {
          const j = await res.json()
          if (j?.error) msg = j.error
        } catch { /* respuesta no-JSON: usar mensaje genérico */ }
        throw new Error(msg)
      }
      const blob = await res.blob()

      // Nombre de archivo desde Content-Disposition, con fallback razonable
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const nombre = match?.[1] ?? `documentos_${periodo?.mes ?? ''}_${periodo?.anio ?? ''}.zip`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast.success('Descarga lista', { id: toastId })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al descargar', { id: toastId })
    } finally {
      setDescargandoPaquete(false)
    }
  }

  async function handleHabilitarTardio(habilitar: boolean) {
    if (!periodo) return
    setTardioLoading(true)
    const result = await habilitarEnvioTardio(periodo.id, habilitar)
    setTardioLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(habilitar ? 'Envío tardío habilitado' : 'Envío tardío deshabilitado')
      router.refresh()
    }
  }

  // Quién puede revisar/gestionar la planilla dentro de la tarjeta centralizada
  const puedeRevisarPlanilla = (esAsesor || esSecretaria)

  // Franja de alerta de planilla (naranja / roja). Visible para revisores.
  // Mensaje completo siempre visible (sin depender de hover) — claro y directo.
  const franjaAlertaPlanilla = nivelAlertaPlanilla && (esAsesor || esSecretaria) ? (
    <div className="px-4 py-3">
      <div
        className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${
          nivelAlertaPlanilla === 'roja'
            ? 'bg-red-50 border-red-200'
            : 'bg-orange-50 border-orange-200'
        }`}
      >
        <Icono glifo={Iconos.estado.advertencia} tamano="sm" className={`flex-shrink-0 mt-0.5 ${nivelAlertaPlanilla === 'roja' ? 'text-red-600' : 'text-amber-600'}`} />
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${nivelAlertaPlanilla === 'roja' ? 'text-red-700' : 'text-orange-700'}`}>
            {nivelAlertaPlanilla === 'roja'
              ? 'Posible cotización faltante'
              : 'Pago por mes vencido'}
          </p>
          <p className={`text-[11px] leading-relaxed mt-0.5 ${nivelAlertaPlanilla === 'roja' ? 'text-red-600/90' : 'text-orange-700/80'}`}>
            {mensajeAlertaPlanilla}
          </p>
        </div>
      </div>
    </div>
  ) : null

  // Selector de mes de cotización (asesor / supervisor / admin) dentro de la tarjeta.
  const selectorMesCotizacion = (esAsesor || esSecretaria) && periodo?.planilla_ss_url ? (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Icono glifo={Iconos.dominio.periodo} tamano="sm" className="text-gray-400" />
        <p className="text-sm font-medium text-gray-900">Mes de cotización</p>
        {mesCotizacionSinVerificar ? (
          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">sin verificar</span>
        ) : (
          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">confirmado</span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-2">
        Mes del informe: <strong className="text-gray-600">{periodo.mes}</strong>. Confirma el mes que realmente cubre la planilla.
      </p>
      <div className="flex items-center gap-2">
        <select
          value={mesCotizacion}
          onChange={(e) => handleGuardarMesCotizacion(e.target.value)}
          disabled={guardandoMesCotizacion}
          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-400 outline-none disabled:opacity-50"
        >
          {mesesContrato.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {guardandoMesCotizacion && <span className="text-xs text-gray-400">Guardando…</span>}
      </div>
    </div>
  ) : null

  // ── Render ──────────────────────────────────────────────────

  if (cargando) return (
    <div className="max-w-4xl animate-pulse space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 bg-gray-200 rounded" />
        <div className="h-4 w-3 bg-gray-100 rounded" />
        <div className="h-4 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-3 bg-gray-100 rounded" />
        <div className="h-4 w-24 bg-gray-200 rounded" />
      </div>
      {/* Timeline */}
      <div className="bg-white rounded-2xl border p-5">
        <div className="flex items-center gap-0">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center shrink-0">
                <div className="w-7 h-7 bg-gray-200 rounded-full" />
                <div className="h-2 w-10 bg-gray-100 rounded mt-1" />
              </div>
              {i < 4 && <div className="flex-1 h-0.5 bg-gray-100 mx-1 mb-4" />}
            </div>
          ))}
        </div>
      </div>
      {/* Header período */}
      <div className="bg-white rounded-2xl border p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <div className="h-6 w-36 bg-gray-200 rounded" />
            <div className="h-4 w-52 bg-gray-100 rounded" />
            <div className="h-4 w-44 bg-gray-100 rounded" />
          </div>
          <div className="space-y-2 text-right">
            <div className="h-5 w-20 bg-gray-200 rounded-full ml-auto" />
            <div className="h-6 w-28 bg-gray-200 rounded ml-auto" />
          </div>
        </div>
      </div>
      {/* Obligaciones */}
      {[...Array(2)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border p-6 space-y-4">
          <div className="flex gap-3">
            <div className="w-7 h-7 bg-gray-200 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="space-y-3 ml-0 sm:ml-10">
            {[...Array(2)].map((_, j) => (
              <div key={j} className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="h-3 w-20 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  if (!periodo || !contrato) return <p className="text-red-500">Periodo no encontrado</p>

  const estadoClass = ESTADO_COLOR[periodo.estado] ?? 'bg-gray-100 text-gray-600'
  const estadoTexto = ESTADO_LABEL[periodo.estado] ?? periodo.estado

  // ── Approval timeline steps
  const STEPS: { estado: EstadoPeriodo; label: string; short: string }[] = [
    { estado: 'borrador',       label: 'Borrador',          short: 'Borrador' },
    { estado: 'enviado',        label: 'En revisión',        short: 'Revisión' },
    { estado: 'revision', label: 'En revisión', short: 'Revisión' },
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

      {/* ── Firma suggestion banner (contratista, editable, no firma) ── */}
      {esEditable && esContratista && !usuario?.firma_url && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icono glifo={Iconos.navegacion.firmas} tamano="sm" className="shrink-0 text-gray-400" />
            <p className="text-xs text-amber-700">
              <strong>Recomendado:</strong> Registra tu firma para completar correctamente tus informes.
            </p>
          </div>
          <Link
            href="/dashboard/perfil"
            className="text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 shrink-0"
          >
            Ir a mi perfil
          </Link>
        </div>
      )}

      {/* ── Historical lock banner ──────────────────────────── */}
      {esHistorico && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <Icono glifo={Iconos.estado.bloqueado} tamano="lg" className="flex-shrink-0 text-gray-400" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Periodo histórico — solo lectura</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Este periodo fue procesado antes de la digitalización del sistema y no puede ser modificado.
              {periodo?.historico_nota ? ` ${periodo.historico_nota}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Past-month supervisor control panel ───────────────── */}
      {esPeriodoPasado && esSecretaria && !esAsesor && (
        <div className={`border rounded-2xl px-5 py-4 mb-6 flex items-start gap-3 ${periodo.habilitado_tardio ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
          <Icono glifo={periodo.habilitado_tardio ? Iconos.estado.desbloqueado : Iconos.estado.bloqueado} tamano="lg" className="flex-shrink-0 text-gray-400" />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${periodo.habilitado_tardio ? 'text-emerald-800' : 'text-blue-800'}`}>
              {periodo.habilitado_tardio ? 'Envío tardío activo' : 'Periodo vencido'}
            </p>
            <p className={`text-xs mt-0.5 ${periodo.habilitado_tardio ? 'text-emerald-700' : 'text-blue-700'}`}>
              El plazo del informe de <strong>{periodo.mes} {periodo.anio}</strong> ya venció.
              {periodo.habilitado_tardio
                ? ' El contratista puede completarlo y enviarlo.'
                : ' Puedes habilitarlo para que el contratista lo complete y envíe.'}
            </p>
          </div>
          <div className="flex-shrink-0">
            {!periodo.habilitado_tardio ? (
              <button
                disabled={tardioLoading}
                onClick={() => handleHabilitarTardio(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {tardioLoading ? 'Habilitando…' : 'Habilitar envío tardío'}
              </button>
            ) : (
              <button
                disabled={tardioLoading}
                onClick={() => handleHabilitarTardio(false)}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap"
              >
                {tardioLoading ? 'Deshabilitando…' : 'Deshabilitar'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Past-month lock banner (contratista, not unlocked) ── */}
      {periodoVencido && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <Icono glifo={Iconos.dominio.periodo} tamano="lg" className="flex-shrink-0 text-gray-400" />
          <div>
            <p className="text-sm font-semibold text-orange-800">Periodo cerrado para envío</p>
            <p className="text-xs text-orange-700 mt-0.5">
              El plazo para enviar el informe de <strong>{periodo.mes} {periodo.anio}</strong> ya venció.
              Solo puedes enviar el informe del mes actual. Si tienes alguna inquietud, contacta a tu supervisor.
            </p>
          </div>
        </div>
      )}

      {/* ── Late submission unlocked banner (contratista only) ── */}
      {esContratista && periodo.habilitado_tardio && !esHistorico && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <Icono glifo={Iconos.estado.aprobado} tamano="lg" className="flex-shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Envío tardío habilitado</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Tu supervisor habilitó el envío tardío del informe de <strong>{periodo.mes} {periodo.anio}</strong>.
              Ya puedes completarlo y enviarlo.
            </p>
          </div>
        </div>
      )}

      {/* ── Approval timeline ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border p-5 mb-6">
        {rechazado ? (
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-red-700">Informe devuelto para corrección</p>
              {periodo.motivo_rechazo
                ? <p className="text-xs text-red-500 mt-0.5">{periodo.motivo_rechazo}</p>
                : <p className="text-xs text-gray-400 mt-0.5">Sin motivo especificado</p>
              }
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-0">
            {STEPS.map((step, i) => {
              const done = i < currentIdx
              const active = i === currentIdx
              // Nodo descargable: Aprobado/Radicado ya alcanzado + hay ZIP para el rol.
              const esNodoDescargable =
                (step.estado === 'aprobado' || step.estado === 'radicado') &&
                i <= currentIdx &&
                puedeDescargarPaquete &&
                !!zipPipelineHref

              const circulo = (
                <div className={`relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  esNodoDescargable
                    ? 'bg-emerald-500 text-white group-hover:ring-2 group-hover:ring-emerald-300 group-hover:ring-offset-1 group-hover:scale-110'
                    : done ? 'bg-emerald-500 text-white'
                    : active ? 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-2'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {/* Nodo descargable: spinner si está descargando, si no check→descarga en hover */}
                  {esNodoDescargable ? (
                    descargandoPaquete ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 group-hover:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <svg className="w-3.5 h-3.5 hidden group-hover:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </>
                    )
                  ) : done ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
              )

              const etiqueta = (
                <span className={`text-[9px] mt-1 font-medium text-center leading-tight ${
                  active ? 'text-gray-900'
                  : done || esNodoDescargable ? 'text-emerald-600 hidden sm:block'
                  : 'text-gray-400 hidden sm:block'
                }`}>
                  {step.short}
                </span>
              )

              return (
                <div key={step.estado} className="flex items-center flex-1 min-w-0">
                  {esNodoDescargable ? (
                    <button
                      type="button"
                      onClick={() => zipPipelineHref && handleDescargarPaquete(zipPipelineHref)}
                      disabled={descargandoPaquete}
                      title={`Descargar ${esContratista ? 'documentos SECOP' : 'actas'} (${step.short})`}
                      className="group flex flex-col items-center flex-shrink-0 -m-2 p-2 cursor-pointer disabled:cursor-wait"
                    >
                      {circulo}
                      {etiqueta}
                    </button>
                  ) : (
                    <div className="flex flex-col items-center flex-shrink-0">
                      {circulo}
                      {etiqueta}
                    </div>
                  )}
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
                {pa.asesor?.nombre_completo || 'Asesor'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Rejection guidance card (contratista only) ─────────── */}
      {/* ── Unified "Acción requerida" banner (contratista only) ── */}
      {esContratista && (rechazado || periodo.planilla_estado === 'rechazada') && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6 space-y-4">

          {/* ── Informe rechazado ──────────────────────────────── */}
          {rechazado && (
            <div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">↩️</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-red-800">Tu informe fue devuelto — necesita corrección</p>
                  {periodo.motivo_rechazo ? (
                    <div className="mt-1.5 bg-white border border-red-200 rounded-xl px-3 py-2">
                      <p className="text-xs text-gray-500 font-medium mb-0.5">El asesor indicó:</p>
                      <p className="text-sm text-red-700 italic break-words">"{periodo.motivo_rechazo}"</p>
                    </div>
                  ) : (
                    <p className="text-xs text-red-600 mt-1">Revisa tus actividades y vuelve a enviar el informe.</p>
                  )}
                </div>
              </div>
              {/* Steps */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="bg-white rounded-xl border border-red-100 px-4 py-3 flex items-start gap-3">
                  <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">Corrige tus actividades</p>
                    <p className="text-xs text-gray-500 mt-0.5">Edita, elimina o agrega actividades según el motivo.</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-red-100 px-4 py-3 flex items-start gap-3">
                  <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">Reenvía el informe</p>
                    <p className="text-xs text-gray-500 mt-0.5">Usa el botón al final de la página cuando termines.</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => seccionActividadesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="mt-3 w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-medium min-h-[44px] rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Ir a mis actividades
              </button>
            </div>
          )}

          {/* Divider when both issues are present */}
          {rechazado && periodo.planilla_estado === 'rechazada' && (
            <hr className="border-red-200" />
          )}

          {/* ── Planilla rechazada ─────────────────────────────── */}
          {periodo.planilla_estado === 'rechazada' && (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0 text-red-600"><Icono glifo={Iconos.dominio.seguridadSocial} tamano="md" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-800">Tu planilla de seguridad social fue rechazada</p>
                {periodo.planilla_comentario ? (
                  <div className="mt-1.5 bg-white border border-red-200 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-500 font-medium mb-0.5">El asesor indicó:</p>
                    <p className="text-sm text-red-700 italic break-words">"{periodo.planilla_comentario}"</p>
                  </div>
                ) : (
                  <p className="text-xs text-red-600 mt-1">Sube una nueva planilla correcta para continuar.</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Ve a <strong>Documentos del periodo</strong> → <em>Planilla SS</em> → <em>Reemplazar planilla</em>.
                </p>
              </div>
            </div>
          )}

        </div>
      )}

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
          {periodo.numero_radicado && periodo.estado === 'radicado' && (
            <>
              <span className="text-gray-300">|</span>
              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-semibold text-xs">
                Radicado No. {periodo.numero_radicado}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Admin: Devoluciones forzadas ── */}
      {usuario?.rol === 'admin' && periodo.estado !== 'borrador' && (
        <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Icono glifo={Iconos.navegacion.configuracion} tamano="sm" className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-800">Devolución de periodo</h3>
            <span className="text-xs text-gray-400">Solo admin</span>
          </div>

          {/* Botones de destino */}
          <div className="flex flex-wrap gap-2 mb-3">
            {([
              { key: 'asesores',    label: 'Devolver a Asesores',    color: destinoDevolver === 'asesores'    ? 'bg-blue-600 text-white'    : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100' },
              { key: 'supervisor',  label: 'Devolver a Supervisor',  color: destinoDevolver === 'supervisor'  ? 'bg-purple-600 text-white'  : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100' },
              { key: 'contratista', label: 'Devolver a Contratista', color: destinoDevolver === 'contratista' ? 'bg-orange-600 text-white'  : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100' },
            ] as const).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => {
                  setDestinoDevolver(destinoDevolver === key ? null : key)
                  setMotivoDevolver('')
                }}
                disabled={procesandoDevolver}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${color}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Formulario de confirmación */}
          {destinoDevolver && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <textarea
                value={motivoDevolver}
                onChange={e => setMotivoDevolver(e.target.value)}
                placeholder={
                  destinoDevolver === 'contratista'
                    ? 'Motivo del rechazo (obligatorio)…'
                    : 'Motivo o comentario (opcional)…'
                }
                rows={2}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAdminDevolver}
                  disabled={procesandoDevolver || (destinoDevolver === 'contratista' && !motivoDevolver.trim())}
                  className="text-xs px-4 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-40 font-medium transition-colors"
                >
                  {procesandoDevolver ? 'Procesando...' : 'Confirmar devolución'}
                </button>
                <button
                  onClick={() => { setDestinoDevolver(null); setMotivoDevolver('') }}
                  className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Asesor panel (approve / reject) ── */}
      {(periodo.estado === 'enviado' || periodo.estado === 'revision' || periodo.estado === 'rechazado') && (esAsesor || esSecretaria) && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500"><Icono glifo={Iconos.accion.ver} tamano="sm" /></div>
            <div>
              <h3 className="font-medium text-gray-900">Revisión del informe</h3>
              <p className="text-xs text-gray-400">
                {periodo.estado === 'revision'
                  ? 'Este informe está marcado como revisado. Puedes revocar si detectas un problema.'
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
              {periodo.estado === 'revision' ? (
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
                  {procesando ? 'Procesando...' : periodo.estado === 'rechazado' ? 'Aprobar ahora' : 'Aprobar'}
                </button>
              )}
              {(periodo.estado === 'enviado' || periodo.estado === 'revision') && (
                <button
                  onClick={() => setMostrarRechazo(true)}
                  className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  Rechazar
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
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
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

      {/* Panel de secretaria movido a debajo de actividades — ver sección antes de Documentos del periodo */}

      {/* Mark as radicado — asesor/supervisor/admin when aprobado */}
      {!esHistorico && periodo.estado === 'aprobado' && (esAsesor || esSecretaria) && (
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
              className="flex-1 min-w-[200px] px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-300"
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
      <div ref={seccionActividadesRef} className="space-y-4 mb-6">

        {/* Paso 1 header — only when contractor is in rejected state */}
        {rechazado && esContratista && (
          <div className="flex items-center gap-3 pt-1">
            <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
            <p className="text-sm font-semibold text-gray-800">Corrige tus actividades</p>
          </div>
        )}

        {/* Control global expandir/colapsar — solo si hay obligaciones */}
        {obligaciones.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-gray-400">
              {obligaciones.length} obligación{obligaciones.length !== 1 ? 'es' : ''}
            </p>
            <button
              type="button"
              onClick={toggleTodas}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              {todasAbiertas ? 'Colapsar todo' : 'Expandir todo'}
            </button>
          </div>
        )}

        {obligaciones.map((obl, oblIndex) => {
          const actsDeObl = actividadesPorObligacion(obl.id)
          const numEvidencias = evidenciasPorObligacion(obl.id)
          const abierta = obligacionesAbiertas.has(obl.id)
          const rev = getRevision(obl.id)
          const tieneNota = !!rev.nota?.trim()
          // TRES estados, no dos. "Sin revisar" (nadie la ha tocado) se
          // distingue de "Aprobada" (alguien la aprobó explícitamente), que es
          // justo lo que la barra de progreso de arriba ya cuenta. Antes ambos
          // se pintaban con el mismo check verde, así que aprobar no producía
          // ningún cambio visible.
          const revisada = revisiones[obl.id] !== undefined
          const estadoRev: 'aprobada' | 'sin_aprobar' | 'sin_revisar' =
            !revisada ? 'sin_revisar' : rev.aprobada ? 'aprobada' : 'sin_aprobar'
          const puedeRevisar = (esAsesor || esSecretaria) && !esHistorico &&
            !!periodo && ['enviado', 'revision', 'rechazado'].includes(periodo.estado)
          return (
            <div
              key={obl.id}
              className={`rounded-2xl border border-l-4 p-6 transition-colors ${
                estadoRev === 'aprobada'
                  ? 'bg-green-50/40 border-gray-200 border-l-green-500'
                  : estadoRev === 'sin_aprobar'
                    ? 'bg-amber-50/40 border-amber-200 border-l-amber-400'
                    : 'bg-white border-gray-200 border-l-gray-200'
              }`}
            >
              {/* Cabecera — zona clickable (expandir) + acciones de revisión.
                  Colapsada por defecto: las actividades y evidencias (imágenes)
                  no se montan hasta abrir, evitando descargar fotos innecesarias. */}
              <div className={`flex items-start gap-3 ${abierta ? 'mb-4' : ''}`}>
                {/* Zona clickable: expande/colapsa */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleObligacion(obl.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleObligacion(obl.id) }
                  }}
                  aria-expanded={abierta}
                  className="flex items-start gap-3 flex-1 min-w-0 text-left cursor-pointer"
                >
                  <span className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-white">{oblIndex + 1}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 break-words">{obl.descripcion}</p>
                    {/* Estado con ETIQUETA, no solo color: el color por sí solo
                        no es un indicador accesible (WCAG 1.4.1) y un botón
                        verde se lee como "acción disponible", no como "hecho". */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      {estadoRev === 'aprobada' && (
                        <Badge variant="green" size="xs">Aprobada por la supervisión</Badge>
                      )}
                      {estadoRev === 'sin_aprobar' && (
                        <Badge variant="amber" size="xs">Sin aprobar</Badge>
                      )}
                      {estadoRev === 'sin_revisar' && puedeRevisar && (
                        <Badge variant="gray" size="xs">Sin revisar</Badge>
                      )}
                      {/* La etiqueta pasa a ser el disparador de la nota: con
                          ratón se abre al pasar por encima, y al tocar queda
                          fijada. Antes solo anunciaba que existía una nota y
                          obligaba a ir a buscarla al acta de supervisión. */}
                      {tieneNota && (
                        <NotaSupervision
                          nota={rev.nota ?? ''}
                          esCorreccion={estadoRev === 'sin_aprobar'}
                        />
                      )}
                      <span className="text-xs text-gray-400">
                        {actsDeObl.length} actividad{actsDeObl.length !== 1 ? 'es' : ''}
                        {numEvidencias > 0 && ` · ${numEvidencias} evidencia${numEvidencias !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 shrink-0 mt-1 transition-transform ${abierta ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Acciones de revisión — solo asesor/supervisor, período no histórico */}
                {puedeRevisar && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Aprobar / desmarcar */}
                    {/* Botón con ETIQUETA: un icono suelto no dice si el verde
                        significa "ya está aprobada" o "pulsa para aprobar". El
                        texto elimina esa ambigüedad y anuncia qué hará el clic. */}
                    <button
                      type="button"
                      onClick={() => handleToggleAprobacion(obl.id, oblIndex + 1)}
                      disabled={obligacionProcesando === obl.id}
                      aria-pressed={estadoRev === 'aprobada'}
                      title={
                        estadoRev === 'aprobada'
                          ? 'Aprobada — clic para retirar la aprobación'
                          : 'Marcar esta obligación como cumplida'
                      }
                      className={`h-9 px-2.5 sm:px-3 inline-flex items-center gap-1.5 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-40
                        ${estadoRev === 'aprobada'
                          ? 'bg-green-600 border-green-600 text-white hover:bg-green-700'
                          : 'bg-white border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-400'}`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="hidden sm:inline">
                        {estadoRev === 'aprobada' ? 'Aprobada' : 'Aprobar'}
                      </span>
                    </button>
                    {/* Agregar / editar nota */}
                    <button
                      type="button"
                      onClick={() => setNotaModal({ obligacionId: obl.id, texto: rev.nota ?? '' })}
                      title={tieneNota ? 'Editar nota de supervisión' : 'Agregar nota de supervisión'}
                      aria-label="Nota de supervisión"
                      className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors
                        ${tieneNota
                          ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                          : 'bg-white border-gray-200 text-gray-400 hover:text-blue-500 hover:border-blue-300'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {abierta && (
              <>
              {/* Activity list */}
              {actsDeObl.length > 0 && (
                <div className="space-y-3 mb-4 ml-0 sm:ml-10">
                  {actsDeObl.map((act, actIndex) => (
                    <div key={act.id} className="bg-gray-50 rounded-xl p-4">
                      {editandoActividad === act.id ? (
                        /* ── Inline edit mode ── */
                        <div>
                          <textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            rows={3}
                            autoFocus
                            maxLength={1500}
                            className="w-full px-3 py-2.5 bg-white border border-blue-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                          />
                          {/* Redacción asistida (LanguageTool) */}
                          <MejorarRedaccion texto={editDesc} onAceptar={setEditDesc} />
                          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-500">Cantidad:</label>
                              <input
                                type="number"
                                min={1}
                                value={editCantidad}
                                onChange={(e) => setEditCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 text-center"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleCancelarEdicion}
                                disabled={guardandoEdicion}
                                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleGuardarEdicion(act.id)}
                                disabled={guardandoEdicion || !editDesc.trim()}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                              >
                                {guardandoEdicion ? 'Guardando...' : 'Guardar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ── Read / normal mode ── */
                        <>
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs text-gray-400">{actIndex + 1}.</span>
                                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                                  {act.cantidad} {act.cantidad === 1 ? 'acción' : 'acciones'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 break-words">{act.descripcion}</p>
                            </div>
                            {esEditable && (
                              <div className="flex items-center gap-0 ml-1 shrink-0">
                                {/* Editar — 44×44 touch target */}
                                <button
                                  onClick={() => handleAbrirEdicion(act.id, act.descripcion, act.cantidad ?? 1)}
                                  disabled={eliminandoActividad === act.id}
                                  className="w-11 h-11 flex items-center justify-center rounded-xl
                                             text-gray-400 hover:text-blue-500 active:text-blue-600
                                             hover:bg-blue-50 active:bg-blue-100 transition-colors disabled:opacity-30"
                                  aria-label="Editar actividad"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                {/* Eliminar — 44×44 touch target, inline confirm on first tap */}
                                <button
                                  onClick={() => confirmarEliminarId === act.id
                                    ? handleConfirmarEliminar(act.id)
                                    : setConfirmarEliminarId(act.id)}
                                  disabled={eliminandoActividad === act.id}
                                  className={`w-11 h-11 flex items-center justify-center rounded-xl transition-colors
                                    disabled:opacity-30
                                    ${confirmarEliminarId === act.id
                                      ? 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
                                      : 'text-gray-400 hover:text-red-500 active:text-red-600 hover:bg-red-50 active:bg-red-100'
                                    }`}
                                  aria-label={confirmarEliminarId === act.id ? 'Confirmar eliminación' : 'Eliminar actividad'}
                                  title={confirmarEliminarId === act.id ? 'Toca de nuevo para confirmar' : 'Eliminar'}
                                >
                                  {eliminandoActividad === act.id ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Evidence */}
                          <div className="mt-3">
                            {/* Imágenes y documentos comparten una sola grilla:
                                para el supervisor la evidencia de la obligación
                                es un único conjunto, no dos listas separadas. */}
                            {((act.evidencias?.length ?? 0) > 0 || (adjuntos[act.id]?.length ?? 0) > 0) && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {(act.evidencias ?? []).map((ev) => {
                                  const evMatches = (esAsesor || esSecretaria) ? (duplicados[ev.id] ?? []) : []
                                  const tieneDuplicado = evMatches.length > 0
                                  return (
                                  <div key={ev.id} className="relative group">
                                    {/* Duplicate alert badge — only visible to asesor/supervisor */}
                                    {tieneDuplicado && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setDuplicadoModal({ evId: ev.id, matches: evMatches }) }}
                                        className="absolute -top-1.5 -left-1.5 z-20 w-5 h-5 bg-amber-500 hover:bg-amber-600 text-white rounded-full flex items-center justify-center shadow-sm transition-colors"
                                        title="Posible evidencia reutilizada — clic para ver detalles"
                                        aria-label="Alerta: posible evidencia duplicada"
                                      >
                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                        </svg>
                                      </button>
                                    )}
                                    {/* Thumbnail — abre lightbox (con evId para poder eliminar desde ahí) */}
                                    <button
                                      type="button"
                                      onClick={() => setLightbox({ url: resolverUrl(ev.url), alt: ev.nombre_archivo, evId: esEditable ? ev.id : undefined })}
                                      className="block focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-xl"
                                      aria-label="Ver imagen ampliada"
                                    >
                                      <img
                                        src={resolverMiniatura(ev.url)}
                                        alt={ev.nombre_archivo}
                                        loading="lazy"
                                        decoding="async"
                                        onError={onImgError}
                                        className={`w-20 h-20 object-cover rounded-xl border transition-opacity group-hover:opacity-80 ${tieneDuplicado ? 'border-amber-300' : 'border-gray-200'}`}
                                      />
                                    </button>
                                    {/* Botón eliminar:
                                        - mobile: siempre visible (opacity-100)
                                        - desktop: visible solo en hover (md:opacity-0 md:group-hover:opacity-100)
                                        Touch target 24×24px + posición exterior al thumb */}
                                    {esEditable && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleEliminarEvidencia(ev.id) }}
                                        className="absolute -top-1.5 -right-1.5
                                                   w-6 h-6 bg-red-500 hover:bg-red-600 text-white
                                                   rounded-full flex items-center justify-center
                                                   opacity-100 md:opacity-0 md:group-hover:opacity-100
                                                   active:bg-red-700 transition-opacity shadow-sm z-10"
                                        aria-label="Eliminar evidencia"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                  )
                                })}

                                {(adjuntos[act.id] ?? []).map((ad) => (
                                  <TarjetaAdjunto
                                    key={ad.id}
                                    adjunto={ad}
                                    editable={esEditable}
                                    onAbrir={() => ad.urlFirmada && setVisorPDF({ url: ad.urlFirmada, nombre: ad.nombre_original })}
                                    onEliminar={() => handleEliminarAdjunto(act.id, ad.id)}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Retry banner — file uploaded but DB registration failed */}
                            {pendienteRegistro[act.id] && subiendoEvidencia[act.id] == null && (
                              <div className="mb-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                <span className="text-xs text-amber-700 flex-1">La imagen se subió pero no se registró.</span>
                                <button
                                  onClick={() => handleReintentarRegistro(act.id)}
                                  className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
                                >
                                  Reintentar
                                </button>
                              </div>
                            )}

                            {esEditable && subiendoEvidencia[act.id] == null && (
                              <div className="flex flex-col xs:flex-row gap-2 mt-1">
                                {/* Gallery — multiple selection (up to 5 at once) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    uploadTargetId.current = act.id
                                    galleryInputRef.current?.click()
                                  }}
                                  className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 text-sm font-medium text-blue-600 hover:text-blue-700 active:text-blue-800 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 min-h-[44px] px-4 py-2 rounded-xl transition-colors"
                                >
                                  <span className="inline-flex items-center gap-1.5">
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                    </svg>
                                    Adjuntar evidencia
                                  </span>
                                  <span className="text-[10px] font-normal text-blue-400 leading-tight">imágenes o PDF</span>
                                </button>
                                {/* Camera — single capture */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    uploadTargetId.current = act.id
                                    cameraInputRef.current?.click()
                                  }}
                                  className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 active:text-gray-900 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 min-h-[44px] px-4 rounded-xl transition-colors"
                                >
                                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  Tomar foto
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add activity form */}
              {esEditable && (
                <div className="ml-0 sm:ml-10">
                  {formActivo === obl.id ? (
                    <div className="bg-blue-50 rounded-xl p-4">
                      <textarea
                        value={nuevaActividad}
                        onChange={(e) => setNuevaActividad(e.target.value)}
                        placeholder="Describe la actividad realizada..."
                        rows={3}
                        maxLength={1500}
                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                      />

                      {/* ── Redacción asistida (LanguageTool) ── */}
                      <MejorarRedaccion texto={nuevaActividad} onAceptar={setNuevaActividad} />

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Cantidad:</label>
                          <input
                            type="number" min={1} value={nuevaCantidad}
                            onChange={(e) => setNuevaCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 text-center"
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
              </>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit section (contratista) */}
      {esEditable && (
        <div ref={seccionEnvioRef} className={`rounded-2xl border p-6 mb-6 ${rechazado ? 'bg-red-50 border-red-200' : 'bg-white'}`}>

          {/* Step 2 indicator — only for rejected */}
          {rechazado && (
            <div className="flex items-center gap-3 mb-3">
              <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              <p className="text-sm font-semibold text-gray-800">Reenvía tu informe</p>
            </div>
          )}

          <h3 className="font-medium text-gray-900 mb-1">
            {rechazado ? '¿Ya corregiste todo?' : '¿Listo para enviar?'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {rechazado
              ? 'Verifica que la planilla esté adjunta y reenvía el informe a revisión.'
              : exigeFacturaElectronica
                ? 'Antes de enviar, adjunta la planilla de seguridad social con su número y tu factura electrónica.'
                : 'Antes de enviar, adjunta la planilla de seguridad social e ingresa su número.'
            }
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Factura electrónica — solo para quien está obligado a emitirla.
                Va aquí, junto a la planilla, y no en la sección de documentos:
                esa sección solo aparece DESPUÉS de enviar, y sin factura no se
                puede enviar. Debe estar donde se prepara el envío. */}
            {exigeFacturaElectronica && (
              <div className="sm:col-span-2">
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  periodo.factura_electronica_url
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-300'
                }`}>
                  <Icono glifo={Iconos.documentos.certificacion} tamano="md" className="shrink-0 text-gray-400" />

                  <label className={`flex-1 min-w-0 transition-opacity ${
                    puedeAdjuntarFactura ? 'cursor-pointer hover:opacity-75' : ''
                  }`}>
                    <p className="text-sm font-medium text-gray-900">Factura electrónica</p>
                    <p className={`text-xs truncate ${
                      periodo.factura_electronica_url ? 'text-gray-400' : 'text-amber-700 font-medium'
                    }`}>
                      {subiendoFactura
                        ? 'Subiendo...'
                        : periodo.factura_electronica_url
                          ? 'Adjuntada — clic para reemplazar'
                          : 'Requerida — sustituye a la Cuenta de Cobro'}
                    </p>
                    {puedeAdjuntarFactura && (
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        disabled={subiendoFactura}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file) void handleSubirFactura(file)
                        }}
                      />
                    )}
                  </label>

                  {periodo.factura_electronica_url && (
                    <>
                      <a
                        href={resolverUrl(periodo.factura_electronica_url)}
                        target="_blank" rel="noopener noreferrer"
                        title="Ver la factura"
                        className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </a>
                      {puedeAdjuntarFactura && (
                        <button
                          type="button"
                          onClick={handleEliminarFactura}
                          title="Quitar la factura"
                          className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Planilla file upload */}
            <div>
              {/*
                Outer div owns the visual card styling.
                Inner label only covers the text area — triggers the file input.
                Eye icon anchor sits beside it as a sibling, preventing the
                click from bubbling into the label and opening the file picker.
              */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                erroresCampos.planilla
                  ? 'bg-red-50 border-red-400'
                  : periodo.planilla_ss_url
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
              }`}>
                <Icono glifo={Iconos.dominio.seguridadSocial} tamano="md" className="shrink-0 text-gray-400" />

                {/* Clickable label area */}
                <label className="flex-1 min-w-0 cursor-pointer hover:opacity-75 transition-opacity">
                  <p className="text-sm font-medium text-gray-900">Planilla Seguridad Social</p>
                  <p className={`text-xs truncate ${erroresCampos.planilla ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                    {subiendoPlanilla
                      ? 'Subiendo...'
                      : periodo.planilla_ss_url
                        ? 'Cargada — clic para reemplazar'
                        : erroresCampos.planilla
                          ? 'Requerida — adjunta el archivo'
                          : 'Subir PDF'}
                  </p>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={subiendoPlanilla}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        handleSubirPlanilla(file)
                        setErroresCampos(prev => ({ ...prev, planilla: false }))
                      }
                      e.target.value = ''
                    }}
                  />
                </label>

                {/* Eye icon — preview without opening the file picker */}
                {periodo.planilla_ss_url && (
                  <a
                    href={resolverUrl(periodo.planilla_ss_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ver planilla cargada"
                    className="p-1.5 rounded-lg text-green-600 hover:text-green-800 hover:bg-green-100 active:bg-green-200 transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </a>
                )}
              </div>
            </div>

            {/* Número de planilla */}
            <div className="flex flex-col justify-center">
              <label className="block text-xs text-gray-500 mb-1">N.° de planilla</label>
              <input
                value={numPlanilla}
                onChange={(e) => {
                  setNumPlanilla(e.target.value)
                  setErrorFormatoPlanilla(null)
                  if (e.target.value.trim()) setErroresCampos(prev => ({ ...prev, numero: false }))
                }}
                onBlur={handleGuardarNumeroPlanilla}
                placeholder="Ej. 6016087440"
                inputMode="text"
                className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-900 outline-none focus:ring-2 transition-colors ${
                  erroresCampos.numero || errorFormatoPlanilla
                    ? 'bg-red-50 border-red-400 focus:ring-red-300 placeholder-red-400'
                    : 'bg-gray-50 border-gray-200 focus:ring-blue-400 focus:border-blue-500 placeholder-gray-400'
                }`}
              />
              {errorFormatoPlanilla && (
                <p className="text-xs text-red-500 mt-1">{errorFormatoPlanilla}</p>
              )}
              {erroresCampos.numero && !errorFormatoPlanilla && (
                <p className="text-xs text-red-500 mt-1">Ingresa el número de planilla</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-400" aria-live="polite">
              {faseEnvio === 'verificando' ? 'Verificando los requisitos del informe…'
                : faseEnvio === 'enviando' ? 'Enviando el informe. No cierres esta página.'
                : faseEnvio === 'actualizando' ? 'Listo. Actualizando tu expediente…'
                : rechazado
                  ? 'El asesor recibirá el informe corregido para revisión.'
                  : 'Los asesores y la secretaria recibirán este informe para revisión.'
              }
            </p>
            <button
              onClick={handleEnviar}
              disabled={faseEnvio !== null || actividades.length === 0}
              aria-busy={faseEnvio !== null}
              className={`text-white px-6 py-3 rounded-xl font-medium active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed flex-shrink-0 ml-4 flex items-center gap-2 ${
                rechazado
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {faseEnvio && (
                <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {faseEnvio === 'verificando' ? 'Verificando…'
                : faseEnvio === 'enviando' ? 'Enviando…'
                : faseEnvio === 'actualizando' ? 'Actualizando…'
                : rechazado ? '↩ Reenviar a revisión' : 'Enviar a revisión'}
            </button>
          </div>
        </div>
      )}

      {/* Read-only state */}
      {!esHistorico && !esEditable && periodo.estado === 'enviado' && usuario?.rol === 'contratista' && (
        <div className="bg-gray-50 rounded-2xl border p-6 mb-6 text-center">
          <p className="text-sm text-gray-500">
            Tu informe está <strong>en revisión</strong>. Recibirás una notificación cuando sea aprobado o rechazado.
          </p>
          {tienePreaprobaciones && (
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              {preaprobaciones.map(pa => (
                <span key={pa.id} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  Pre-aprobado por {pa.asesor?.nombre_completo || 'Asesor'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {periodo.estado === 'radicado' && (
        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icono glifo={Iconos.estado.verificado} tamano="lg" className="text-gray-400" />
              <p className="text-base font-bold text-emerald-700">Periodo radicado</p>
            </div>
            {/* Edit button — only for asesor/supervisor/admin */}
            {(esAsesor || esSecretaria) && !editandoRadicado && (
              <button
                onClick={handleAbrirEditRadicado}
                className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
                title="Editar número de radicado"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar No.
              </button>
            )}
          </div>

          {editandoRadicado ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={numRadicadoEdit}
                onChange={e => setNumRadicadoEdit(e.target.value)}
                placeholder="Número de radicado"
                className="flex-1 px-3 py-2 border border-emerald-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                autoFocus
              />
              <button
                onClick={handleGuardarRadicadoEdit}
                disabled={guardandoRadicado}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {guardandoRadicado ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => setEditandoRadicado(false)}
                className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
              {periodo.numero_radicado ? (
                <p className="text-2xl font-extrabold text-emerald-800 tracking-wide">
                  No. {periodo.numero_radicado}
                </p>
              ) : (
                <p className="text-sm text-emerald-600 italic">Sin número de radicado asignado</p>
              )}
              <p className="text-sm text-emerald-600 mt-1">
                El paquete de ${periodo.valor_cobro?.toLocaleString('es-CO')} ha sido radicado exitosamente.
              </p>
            </>
          )}
        </div>
      )}


      {/* ── Trazabilidad (historial) ── */}
      {historial.length > 0 && (
        <div className="bg-white rounded-2xl border p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Trazabilidad</h3>
          <div className="space-y-0">
            {historial.map((h, i) => {
              const esUltimo = i === historial.length - 1
              const icono = h.estado_nuevo === 'aprobado' ? Iconos.estado.aprobado :
                            h.estado_nuevo === 'revision' ? Iconos.accion.ver :
                            h.estado_nuevo === 'rechazado' ? Iconos.estado.rechazado :
                            h.estado_nuevo === 'enviado' ? Iconos.accion.enviar :
                            h.estado_nuevo === 'radicado' ? Iconos.estado.verificado : Iconos.estado.pendiente
              const fecha = new Date(h.created_at)
              const fechaLabel = fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) +
                ' · ' + fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
                      <Icono glifo={icono} tamano="sm" />
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

      {/* ── Panel de revisión de secretaria ── */}
      {(periodo.estado === 'revision' || periodo.estado === 'enviado') && (esSecretaria || usuario?.rol === 'admin') && usuario?.rol !== 'asesor' && (
        <div className="bg-white rounded-2xl border border-amber-100 p-5 mb-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 flex-shrink-0">
              <Icono glifo={Iconos.documentos.actaSupervision} tamano="md" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Revisión de supervisión</h3>
              {tienePreaprobaciones && (
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {preaprobaciones.map(pa => (
                    <span key={pa.id} className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {pa.asesor?.nombre_completo || 'Asesor'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Barra de progreso de revisión de obligaciones */}
          {obligaciones.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">Obligaciones revisadas</span>
                <span className={`text-xs font-semibold ${todasRevisadas ? 'text-green-600' : 'text-amber-600'}`}>
                  {obligacionesConRevision.length} de {obligaciones.length}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${todasRevisadas ? 'bg-green-500' : 'bg-amber-400'}`}
                  style={{ width: `${Math.round(progresoRevision * 100)}%` }}
                />
              </div>
              {!todasRevisadas && (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  Usa el botón <strong>Aprobar</strong> en cada obligación del acordeón de arriba para registrar tu seguimiento.
                </p>
              )}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex gap-2">
            <button
              onClick={handleAprobarSecretaria}
              disabled={procesando}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                todasRevisadas
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-green-100 hover:bg-green-200 text-green-700 border border-green-200'
              }`}
            >
              {procesando ? 'Aprobando...' : 'Aprobar informe'}
            </button>
            <button
              onClick={() => { setMostrarDevolverModal(true); setDestinoDevolucion(null); setMotivoDevolucion('') }}
              disabled={procesando}
              className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              ↩ Devolver
            </button>
          </div>
        </div>
      )}

      {/* ── Documents section ── */}
      {puedeVerDocumentos && (
        <div className="bg-white rounded-2xl border p-4 sm:p-6 mt-4">

          {/* Header + download buttons — apilado en móvil, en línea en desktop */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Documentos del periodo</h3>

            <div className="flex items-center gap-2">
              {/* Descargar Para Secop — solo contratista */}
              {esContratista && (
                puedeDescargarPaquete ? (
                  <a
                    href={`/api/pdf/${periodoId}/secop`}
                    download
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Para Secop
                  </a>
                ) : (
                  <div
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-gray-100 text-gray-400 text-xs font-semibold rounded-xl cursor-not-allowed select-none"
                    title="Disponible cuando la secretaria apruebe el periodo"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Para Secop
                  </div>
                )
              )}

              {/* Descargar Paquete completo — solo asesor / secretaria */}
              {(esAsesor || esSecretaria) && (
                puedeDescargarPaquete ? (
                  <a
                    href={`/api/pdf/${periodoId}/paquete`}
                    download
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Paquete
                  </a>
                ) : (
                  <div
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-gray-100 text-gray-400 text-xs font-semibold rounded-xl cursor-not-allowed select-none"
                    title="Disponible cuando la secretaria apruebe el periodo"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Paquete
                  </div>
                )
              )}
            </div>
          </div>

          {!puedeDescargarPaquete && (
            <p className="text-xs text-amber-600 mb-4 mt-2">
              {esContratista
                ? 'Los documentos SECOP estarán disponibles cuando la secretaria apruebe tu informe.'
                : 'El paquete completo (documentos firmados) estará disponible cuando la secretaria apruebe.'}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            {/* Always available after sending */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <a href={`/api/pdf/${periodoId}/informe`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 flex-1 min-w-0">
                <Icono glifo={Iconos.documentos.informe} tamano="md" className="shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Informe de Actividades</p>
                  <p className="text-xs text-gray-400">Generado automáticamente</p>
                </div>
              </a>
              <a href={`/api/pdf/${periodoId}/informe?force=1`} target="_blank" rel="noopener noreferrer"
                title="Actualizar documento"
                className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:bg-blue-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </a>
            </div>

            {/* Cuenta de Cobro — para quien factura electrónicamente la ruta
                entrega su factura adjunta en lugar de generarla. El campo de
                CARGA no vive aquí: esta sección solo existe una vez enviado el
                informe, y la factura hace falta ANTES, para poder enviarlo. */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <a href={`/api/pdf/${periodoId}/cuenta-cobro`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 flex-1 min-w-0">
                <Icono glifo={exigeFacturaElectronica ? Iconos.documentos.certificacion : Iconos.documentos.cuentaCobro} tamano="md" className="shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {exigeFacturaElectronica ? 'Factura electrónica' : 'Cuenta de Cobro'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {exigeFacturaElectronica ? 'Adjuntada por la contratista' : 'Generado automáticamente'}
                  </p>
                </div>
              </a>
              {!exigeFacturaElectronica && (
                <a href={`/api/pdf/${periodoId}/cuenta-cobro?force=1`} target="_blank" rel="noopener noreferrer"
                  title="Actualizar documento"
                  className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:bg-blue-100 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </a>
              )}
            </div>

            {/* Certificación de Retención — única por contrato, solo en el primer periodo */}
            {mostrarCertificacion && (
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <a href={`/api/certificacion/${periodoId}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 flex-1 min-w-0">
                  <Icono glifo={Iconos.documentos.certificacion} tamano="md" className="shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Certificación de Retención</p>
                    <p className="text-xs text-gray-400">Bajo la gravedad de juramento</p>
                  </div>
                </a>
              </div>
            )}

            {/* Acta de Terminación — única por contrato, solo en el último periodo */}
            {mostrarActaTerminacion && (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">
                <a href={`/api/acta-terminacion/${periodoId}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 flex-1 min-w-0">
                  <Icono glifo={Iconos.documentos.actaTerminacion} tamano="md" className="shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Acta de Terminación</p>
                    <p className="text-xs text-gray-400">Terminación bilateral del contrato</p>
                  </div>
                </a>
              </div>
            )}

            {/* Acta de Supervisión + observación del supervisor */}
            <div className="flex flex-col gap-2">
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-colors ${
                puedeDescargarPaquete ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100'
              }`}>
                <a href={`/api/pdf/${periodoId}/acta-supervision`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 flex-1 min-w-0">
                  <Icono glifo={Iconos.documentos.actaSupervision} tamano="md" className="shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Acta de Supervisión</p>
                    <p className="text-xs text-gray-400">
                      {puedeDescargarPaquete ? 'Firmada' : 'Pendiente aprobación'}
                    </p>
                  </div>
                </a>
                <a href={`/api/pdf/${periodoId}/acta-supervision?force=1`} target="_blank" rel="noopener noreferrer"
                  title="Actualizar documento"
                  className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:bg-blue-100 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </a>
              </div>

              {/* Observación del supervisor — solo visible para supervisor/admin */}
              {esSecretaria && (
                <div className="px-1">
                  {editandoObservacion ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800">Observación para el acta</p>
                      <textarea
                        value={textoObservacion}
                        onChange={(e) => setTextoObservacion(e.target.value)}
                        placeholder="Escribe una observación adicional para este periodo..."
                        rows={3}
                        autoFocus
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-amber-400 outline-none resize-none"
                      />
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handleGuardarObservacion(textoObservacion)}
                          disabled={guardandoObservacion}
                          className="flex-1 bg-amber-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                        >
                          {guardandoObservacion ? 'Guardando...' : 'Guardar'}
                        </button>
                        {periodo.observacion_supervisor && (
                          <button
                            onClick={() => handleGuardarObservacion(null)}
                            disabled={guardandoObservacion}
                            className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                          >
                            Eliminar
                          </button>
                        )}
                        <button
                          onClick={() => { setEditandoObservacion(false); setTextoObservacion(periodo.observacion_supervisor ?? '') }}
                          disabled={guardandoObservacion}
                          className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : periodo.observacion_supervisor ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-amber-700 mb-1">Observación registrada</p>
                          <p className="text-xs text-gray-700 italic leading-relaxed">{periodo.observacion_supervisor}</p>
                        </div>
                        <button
                          onClick={() => { setTextoObservacion(periodo.observacion_supervisor ?? ''); setEditandoObservacion(true) }}
                          className="flex-shrink-0 text-xs text-amber-600 font-medium hover:text-amber-800 transition-colors"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setTextoObservacion(''); setEditandoObservacion(true) }}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-600 transition-colors px-2 py-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Agregar observación al acta
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-colors ${
              puedeDescargarPaquete ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100'
            }`}>
              <a href={`/api/pdf/${periodoId}/acta-pago`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 flex-1 min-w-0">
                <Icono glifo={Iconos.documentos.certificacion} tamano="md" className="shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Acta de Pago</p>
                  <p className="text-xs text-gray-400">
                    {puedeDescargarPaquete ? 'Firmada' : 'Pendiente aprobación'}
                  </p>
                </div>
              </a>
              <a href={`/api/pdf/${periodoId}/acta-pago?force=1`} target="_blank" rel="noopener noreferrer"
                title="Actualizar documento"
                className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:bg-blue-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </a>
            </div>

            {/* ── Planilla de Seguridad Social — dropdown ── */}
            {/* Hidden in editable mode: contratista uses the inline fields in the submit card above */}
            {(esPlanillaGestionable || periodo.planilla_ss_url || esAsesor) && (!esEditable || esAsesor || esSecretaria) && (
              <div className="relative col-span-1 sm:col-span-2">
                {/* Trigger button — el borde refleja la alerta más grave aunque esté cerrado */}
                <button
                  onClick={() => setPlanillaMenuAbierto(v => !v)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors border ${
                    nivelAlertaPlanilla === 'roja' && (esAsesor || esSecretaria)
                      ? 'bg-red-50 border-red-300 hover:bg-red-100'
                      : nivelAlertaPlanilla === 'naranja' && (esAsesor || esSecretaria)
                        ? 'bg-orange-50 border-orange-300 hover:bg-orange-100'
                        : periodo.planilla_estado === 'aprobada'
                          ? 'bg-green-50 border-green-200 hover:bg-green-100'
                          : periodo.planilla_estado === 'rechazada'
                            ? 'bg-red-50 border-red-200 hover:bg-red-100'
                            : periodo.planilla_ss_url
                              ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <span className="relative inline-flex text-gray-500">
                    <Icono glifo={Iconos.dominio.seguridadSocial} tamano="md" />
                    {nivelAlertaPlanilla && (esAsesor || esSecretaria) && (
                      <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                        nivelAlertaPlanilla === 'roja' ? 'bg-red-500' : 'bg-orange-400'
                      }`} />
                    )}
                  </span>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">Planilla de Seguridad Social</p>
                    <p className="text-xs text-gray-500">
                      {subiendoPlanilla
                        ? 'Subiendo...'
                        : !periodo.planilla_ss_url
                          ? 'Sin cargar — haz clic para subir'
                          : periodo.planilla_estado === 'aprobada'
                            ? `Aprobada${periodo.numero_planilla ? ` · No. ${periodo.numero_planilla}` : ''}`
                            : periodo.planilla_estado === 'rechazada'
                              ? `Rechazada${periodo.numero_planilla ? ` · No. ${periodo.numero_planilla}` : ''} — requiere corrección`
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
                  planillaMenuAbierto ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">

                    {/* Franja de alerta (naranja / roja) con tooltip — solo revisores */}
                    {franjaAlertaPlanilla}

                    {/* Ver documento */}
                    {periodo.planilla_ss_url && (
                      <a
                        href={resolverUrl(periodo.planilla_ss_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <Icono glifo={Iconos.accion.ver} tamano="sm" />
                        <span className="text-sm text-gray-700 font-medium">Ver documento</span>
                      </a>
                    )}

                    {/* Mes de cotización — confirmación del revisor */}
                    {selectorMesCotizacion}

                    {/* Subir / Reemplazar (contratista, hasta aprobado) */}
                    {esPlanillaGestionable && (
                      <label className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                        <Icono glifo={periodo.planilla_ss_url ? Iconos.accion.recargar : Iconos.documentos.subir} tamano="sm" />
                        <span className="text-sm text-gray-700 font-medium">
                          {subiendoPlanilla
                            ? 'Subiendo...'
                            : periodo.planilla_ss_url
                              ? 'Reemplazar planilla'
                              : 'Subir planilla (PDF)'}
                        </span>
                        <input
                          type="file"
                          accept="application/pdf"
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
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icono glifo={Iconos.dominio.numero} tamano="sm" />
                          <input
                            value={numPlanilla}
                            onChange={(e) => { setNumPlanilla(e.target.value); setErrorFormatoPlanilla(null) }}
                            placeholder="Ej. 6016087440"
                            inputMode="text"
                            className={`flex-1 px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 ${errorFormatoPlanilla ? 'bg-red-50 border-red-400' : 'bg-gray-50 border-gray-200'}`}
                          />
                          <button
                            onClick={handleGuardarNumeroPlanilla}
                            disabled={guardandoPlanilla || !numPlanilla.trim()}
                            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 disabled:opacity-50"
                          >
                            {guardandoPlanilla ? '...' : 'Guardar'}
                          </button>
                        </div>
                        {errorFormatoPlanilla && (
                          <p className="text-xs text-red-500 mt-1.5 ml-7">{errorFormatoPlanilla}</p>
                        )}
                      </div>
                    )}

                    {/* Asesor: Aprobar */}
                    {(esAsesor || esSecretaria) && periodo.planilla_ss_url && (
                      <button
                        onClick={() => handleRevisarPlanilla('aprobada')}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors text-left"
                      >
                        <Icono glifo={Iconos.estado.aprobado} tamano="sm" />
                        <div>
                          <p className="text-sm font-medium text-green-700">Aprobar planilla</p>
                          <p className="text-xs text-gray-400">
                            {periodo.planilla_estado === 'pendiente'
                              ? 'Pendiente tu revisión — confirma que la planilla es correcta'
                              : 'Confirmar que la planilla está correcta'}
                          </p>
                        </div>
                      </button>
                    )}

                    {/* Asesor: Rechazar — inline form (replaces window.prompt) */}
                    {(esAsesor || esSecretaria) && periodo.planilla_ss_url && (
                      mostrarFormRechazo ? (
                        <div className="px-4 py-3 space-y-2 bg-red-50 rounded-b-xl">
                          <p className="text-sm font-semibold text-red-700">Motivo del rechazo</p>
                          <textarea
                            value={motivoRechazoInline}
                            onChange={(e) => setMotivoRechazoInline(e.target.value)}
                            placeholder="Explica al contratista qué debe corregir..."
                            rows={3}
                            autoFocus
                            className="w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-red-400 outline-none resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                setRechazandoPlanilla(true)
                                await handleRevisarPlanilla('rechazada', motivoRechazoInline.trim())
                                setMostrarFormRechazo(false)
                                setMotivoRechazoInline('')
                                setRechazandoPlanilla(false)
                              }}
                              disabled={rechazandoPlanilla || !motivoRechazoInline.trim()}
                              className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {rechazandoPlanilla ? 'Rechazando...' : 'Confirmar rechazo'}
                            </button>
                            <button
                              onClick={() => { setMostrarFormRechazo(false); setMotivoRechazoInline('') }}
                              className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setMostrarFormRechazo(true)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left"
                        >
                          <Icono glifo={Iconos.estado.rechazado} tamano="sm" />
                          <div>
                            <p className="text-sm font-medium text-red-600">Rechazar planilla</p>
                            {periodo.planilla_comentario
                              ? <p className="text-xs text-gray-400">Motivo anterior: {periodo.planilla_comentario}</p>
                              : <p className="text-xs text-gray-400">Solicitar corrección al contratista</p>}
                          </div>
                        </button>
                      )
                    )}

                    {/* Eliminar (contratista, hasta aprobado) */}
                    {esPlanillaGestionable && periodo.planilla_ss_url && (
                      <button
                        onClick={handleEliminarPlanilla}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left"
                      >
                        <Icono glifo={Iconos.accion.eliminar} tamano="sm" />
                        <span className="text-sm text-red-600 font-medium">Eliminar planilla</span>
                      </button>
                    )}

                    {/* Número de planilla readonly (cuando no es gestionable) */}
                    {!esPlanillaGestionable && periodo.numero_planilla && (
                      <div className="px-4 py-3 flex items-center gap-2">
                        <Icono glifo={Iconos.dominio.numero} tamano="sm" />
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


      {/* ── Modal: confirmación de aprobación con obligaciones sin revisar ── */}
      {mostrarConfirmacionAprobacion && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !procesando && setMostrarConfirmacionAprobacion(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 flex-shrink-0"><Icono glifo={Iconos.estado.advertencia} tamano="md" /></div>
              <h3 className="text-sm font-semibold text-gray-900">Obligaciones sin revisar</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Las siguientes obligaciones aún no tienen seguimiento registrado:
            </p>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4 space-y-1 max-h-40 overflow-y-auto">
              {obligacionesSinRevisar.map((obl, i) => (
                <p key={obl.id} className="text-xs text-amber-800 leading-relaxed">
                  {i + 1}. {obl.descripcion}
                </p>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-4">¿Deseas aprobar el informe de todas formas?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setMostrarConfirmacionAprobacion(false)}
                disabled={procesando}
                className="flex-1 px-4 py-2.5 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarAprobacion}
                disabled={procesando}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {procesando ? 'Aprobando...' : 'Aprobar de todas formas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: devolución con elección de destino ─────────── */}
      {mostrarDevolverModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !procesandoDevolucion && setMostrarDevolverModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Devolver informe</h3>
            <p className="text-xs text-gray-500 mb-4">¿A quién deseas devolver este informe?</p>

            {/* Opciones de destino */}
            <div className="flex flex-col gap-2 mb-4">
              <button
                onClick={() => setDestinoDevolucion('asesores')}
                disabled={procesandoDevolucion}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                  destinoDevolucion === 'asesores'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icono glifo={Iconos.accion.ver} tamano="md" className="flex-shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Devolver a asesor</p>
                  <p className="text-xs text-gray-400 mt-0.5">El asesor revisará y reenviará a secretaría</p>
                </div>
              </button>
              <button
                onClick={() => setDestinoDevolucion('contratista')}
                disabled={procesandoDevolucion}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                  destinoDevolucion === 'contratista'
                    ? 'bg-orange-50 border-orange-300 text-orange-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-lg flex-shrink-0">↩</span>
                <div>
                  <p className="text-sm font-medium">Devolver a contratista</p>
                  <p className="text-xs text-gray-400 mt-0.5">El contratista corregirá y volverá a enviar</p>
                </div>
              </button>
            </div>

            {destinoDevolucion && (
              <>
                <textarea
                  value={motivoDevolucion}
                  onChange={(e) => setMotivoDevolucion(e.target.value)}
                  placeholder="Motivo de la devolución (obligatorio)..."
                  rows={3}
                  autoFocus
                  disabled={procesandoDevolucion}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none resize-none mb-3 disabled:opacity-50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => handleDevolverSecretaria(destinoDevolucion, motivoDevolucion)}
                    disabled={procesandoDevolucion || !motivoDevolucion.trim()}
                    className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    {procesandoDevolucion ? 'Procesando...' : 'Confirmar devolución'}
                  </button>
                  <button
                    onClick={() => { setMostrarDevolverModal(false); setDestinoDevolucion(null); setMotivoDevolucion('') }}
                    disabled={procesandoDevolucion}
                    className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {!destinoDevolucion && (
              <button
                onClick={() => setMostrarDevolverModal(false)}
                className="w-full py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: nota de supervisión por obligación ─────────── */}
      {/* ── Duplicate evidence alert modal ───────────────────────────────── */}
      {duplicadoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDuplicadoModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Alerta de posible evidencia duplicada"
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Posible evidencia reutilizada</h3>
                <p className="text-xs text-gray-500">Esta imagen podría haber sido utilizada anteriormente</p>
              </div>
            </div>

            <div className="space-y-2">
              {duplicadoModal.matches.map((match, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl px-4 py-3 border text-sm ${
                    match.tipo === 'exacto'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      match.tipo === 'exacto'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {match.tipo === 'exacto' ? 'Duplicado exacto' : 'Muy similar'}
                    </span>
                  </div>
                  <p className="font-medium text-gray-800">
                    Periodo {match.numeroPeriodo} — {match.periodoMes} {match.periodoAnio}
                  </p>
                  {match.fechaCarga && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Cargada el {new Date(match.fechaCarga).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    Actividad: {match.actividadDescripcion}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Esta es una alerta informativa. No impide la aprobación del informe.
            </p>

            <button
              onClick={() => setDuplicadoModal(null)}
              className="mt-4 w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {notaModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !guardandoNota && setNotaModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Nota de supervisión"
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Nota de la supervisión</h3>
            <p className="text-xs text-gray-500 mb-3">
              Esta nota reemplaza el texto automático de esta obligación en el Acta de Supervisión.
              Déjala vacía para volver al texto por defecto.
            </p>
            <textarea
              value={notaModal.texto}
              onChange={(e) => setNotaModal({ ...notaModal, texto: e.target.value })}
              rows={5}
              autoFocus
              maxLength={2000}
              placeholder="Ej: Se verificó el cumplimiento de la obligación conforme a las actividades reportadas durante el periodo."
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setNotaModal(null)}
                disabled={guardandoNota}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarNota}
                disabled={guardandoNota}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {guardandoNota ? 'Guardando...' : 'Guardar nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ──────────────────────────────────────────── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada"
        >
          <div
            className="relative max-w-4xl w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Imagen ampliada */}
            <img
              src={lightbox.url}
              alt={lightbox.alt}
              className="max-w-full max-h-[72vh] object-contain rounded-xl shadow-2xl"
            />

            {/* Nombre del archivo */}
            <p className="mt-3 text-white/50 text-xs text-center truncate max-w-full px-2">
              {lightbox.alt}
            </p>

            {/* Barra de acciones — eliminar + cerrar */}
            <div className="mt-4 flex items-center gap-3">
              {lightbox.evId && (
                <button
                  onClick={() => {
                    handleEliminarEvidencia(lightbox.evId!)
                    setLightbox(null)
                  }}
                  className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700
                             active:bg-red-800 text-white text-sm font-medium rounded-xl
                             transition-colors min-h-[44px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7
                             m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Eliminar
                </button>
              )}
              <button
                onClick={() => setLightbox(null)}
                className="px-5 py-3 bg-white/10 hover:bg-white/20 active:bg-white/30
                           text-white text-sm font-medium rounded-xl
                           transition-colors min-h-[44px]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        Shared file inputs — rendered once, outside the activity list.
        Visually hidden with inline style (NOT className="hidden") because
        display:none prevents iOS Safari and many Android WebViews from
        opening the file picker even when .click() is called programmatically.
        position:fixed + opacity:0 + size:0 keeps them in the accessibility
        tree and layout-reachable by the browser's native file dialog trigger.
      */}
      {/* Adjuntar evidencia: imágenes y/o PDF en una sola selección.
          handleAdjuntarEvidencia reparte cada archivo según su tipo real. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,.heic,.heif,application/pdf,.pdf"
        multiple
        style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0 && uploadTargetId.current) handleAdjuntarEvidencia(uploadTargetId.current, files)
          e.target.value = ''
        }}
      />
      {/* Camera: single capture (capture= doesn't support multiple). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploadTargetId.current) handleSubirEvidencias(uploadTargetId.current, [file])
          e.target.value = ''
        }}
      />

      {/* ── Indicador de subida ─────────────────────────────────────────────
           Antes esta capa vivía escrita aquí dentro, con su propio SVG y su
           propio azul, y era la única bonita de las doce que tiene la
           aplicación. Ahora sale del componente compartido: mismo anillo, pero
           en tinta de marca y con el icono del catálogo.

           Se monta solo mientras hay subida: un elemento con backdrop-filter
           siempre presente sobre todo el viewport provoca problemas de
           composición en algunos navegadores aunque esté a opacidad cero.
        ──────────────────────────────────────────────────────────────────── */}
      {(() => {
        const enCurso = Object.keys(subiendoEvidencia).filter(k => subiendoEvidencia[k] != null)
        const totalEvidencias = Object.values(subiendoEvidencia).reduce((s: number, v) => s + (v ?? 0), 0)

        if (subiendoPlanilla) {
          return (
            <SubiendoArchivo
              abierto
              icono={Iconos.documentos.planilla}
              etiqueta="Subiendo planilla"
              detalle="No cierres esta página."
            />
          )
        }

        if (subiendoFactura) {
          return (
            <SubiendoArchivo
              abierto
              icono={Iconos.documentos.cuentaCobro}
              etiqueta="Subiendo factura electrónica"
              detalle="No cierres esta página."
            />
          )
        }

        // Anexos: un PDF adjunto a una actividad. Tenía su propio spinner azul
        // en línea, que era justo la clase de indicador suelto que se venía a
        // unificar.
        const anexoEnCurso = Object.values(subiendoAdjunto).find(Boolean)
        if (anexoEnCurso) {
          return (
            <SubiendoArchivo
              abierto
              icono={Iconos.documentos.adjunto}
              etiqueta="Subiendo anexo"
              detalle="No cierres esta página."
            />
          )
        }

        if (totalEvidencias > 0) {
          // La galería acepta imágenes Y PDF (ver el input con accept), así que
          // llamar «imagen» a todo dejaba a quien adjunta un documento viendo un
          // icono de cámara y un texto que no era el suyo.
          const soloDocumentos = tipoEvidencia === 'documento'
          const etiqueta = totalEvidencias > 1
            ? `Subiendo ${totalEvidencias} ${soloDocumentos ? 'documentos' : 'archivos'}`
            : soloDocumentos ? 'Subiendo documento' : 'Subiendo imagen'
          return (
            <SubiendoArchivo
              abierto
              icono={soloDocumentos ? Iconos.documentos.adjunto : Iconos.dominio.evidencia}
              etiqueta={etiqueta}
              detalle="No cierres esta página."
            />
          )
        }

        return null
      })()}

      {/* Visor de PDF integrado — el usuario nunca sale de la aplicación */}
      {visorPDF && (
        <VisorPDF
          url={visorPDF.url}
          nombre={visorPDF.nombre}
          onClose={() => setVisorPDF(null)}
        />
      )}

      {/* Confirmación del envío */}
      <EnvioInforme
        abierto={mostrarEnvio}
        completado={envioCompletado}
        error={envioError}
        onCerrar={() => { setMostrarEnvio(false); setEnvioError(null) }}
      />

      {/* Acta de terminación — modal obligatorio previo al último envío */}
      <ActaTerminacionModal
        abierto={mostrarActa}
        periodoId={periodoId}
        prefill={actaPrefill}
        faltaFirma={actaFaltaFirma}
        onCerrar={() => setMostrarActa(false)}
        onAceptada={() => { setMostrarActa(false); doEnviar() }}
      />
    </div>
  )
}
