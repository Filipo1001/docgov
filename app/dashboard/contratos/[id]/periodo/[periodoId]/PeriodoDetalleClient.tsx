'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invalidarPeriodos } from '@/lib/invalidar-periodos'
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
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
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
import { fijarRevisionObligacion, type EstadoRevision } from '@/app/actions/obligacion-revisiones'
import { devolverPeriodoAContratista } from '@/app/actions/periodos'
import MejorarRedaccion from '@/components/MejorarRedaccion'
import Badge from '@/components/ui/Badge'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import NotaSupervision from '@/components/ui/NotaSupervision'
import TrazaPeriodo from '@/components/ui/TrazaPeriodo'

/**
 * Revisión local por obligación (✓ + nota). Sin entrada → aprobada por defecto.
 *
 * `revisado_at` es lo que permite saber si esa revisión pertenece al envío que
 * se está mirando o si quedó del anterior: las filas de `obligacion_revisiones`
 * no se borran nunca.
 */
type RevisionLocal = { aprobada: boolean; nota: string | null; revisado_at?: string | null }

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
  // Tras cualquier acción sobre el periodo hay que avisar a las demás
  // pantallas que lo muestran (Informes, paneles): antes cada una guardaba
  // su copia y esta era la única que se enteraba.
  const queryClient = useQueryClient()

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
  // Bloquea el botón de principio a fin —verificación, envío y recarga del
  // expediente incluidas—. Ya NO distingue fases: quien cuenta en qué va el
  // envío es la animación de `EnvioInforme`, que se abre en el mismo clic;
  // el botón solo necesita saber si puede o no aceptar un segundo toque.
  const [enviando, setEnviando] = useState(false)

  // Confirmación del envío. Se separa de `enviando` a propósito: la capa sigue
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
  const [destinoDevolver, setDestinoDevolver] = useState<'asesores' | 'supervisor' | 'contratista' | 'borrador' | null>(null)
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
  // Distingue si la confirmación la abrió el asesor o la secretaría: cada uno
  // ejecuta una acción distinta al confirmar.
  const [confirmandoAprobacionAsesor, setConfirmandoAprobacionAsesor] = useState(false)

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
  // El cuadro de texto sirve a los dos estados que llevan texto. `estado` dice
  // cuál se está escribiendo, y con él cambia todo: título, ayuda, color y a
  // dónde acabará el texto (el acta o el correo de devolución).
  const [notaModal, setNotaModal] = useState<
    { obligacionId: string; numero: number; texto: string; estado: Extract<EstadoRevision, 'observada' | 'devuelta'> } | null
  >(null)
  // Segundo toque para confirmar que se retira una observación al aprobar:
  // «Aprobar» es el estado «cumple y no hay nada que añadir», así que borra el
  // texto — y perder lo escrito en silencio sería desagradable.
  const [confirmarQuitarNota, setConfirmarQuitarNota] = useState<string | null>(null)
  const [guardandoNota, setGuardandoNota] = useState(false)
  const [obligacionProcesando, setObligacionProcesando] = useState<string | null>(null)

  /**
   * Fija el estado de una obligación. Un solo camino para los tres botones.
   *
   * `aprobada` se aplica directo; `observada` y `devuelta` llegan aquí desde el
   * cuadro de texto, porque sin texto no significan nada.
   */
  async function aplicarRevision(obligacionId: string, estado: EstadoRevision, texto?: string) {
    const previaVigente = revisionVigente(obligacionId)
    const previa = previaVigente ? revisiones[obligacionId] : undefined

    // Optimista. `revisado_at` sella el ciclo actual: sin él, la fila recién
    // escrita se seguiría comparando con la marca vieja del servidor y la
    // obligación volvería a leerse como «sin revisar».
    setRevisiones((prev) => ({
      ...prev,
      [obligacionId]: {
        aprobada: estado !== 'devuelta',
        nota: estado === 'aprobada' ? null : (texto ?? '').trim() || null,
        revisado_at: new Date().toISOString(),
      },
    }))
    setObligacionProcesando(obligacionId)

    const res = await fijarRevisionObligacion(periodoId, obligacionId, estado, texto)

    if (res.error) {
      setRevisiones((prev) => {
        const copia = { ...prev }
        if (previa === undefined) delete copia[obligacionId]
        else copia[obligacionId] = previa
        return copia
      })
      toast.error(res.error)
    }
    setObligacionProcesando(null)
    return !res.error
  }

  async function handleAprobarObligacion(obligacionId: string, numero: number) {
    const ok = await aplicarRevision(obligacionId, 'aprobada')
    if (ok) toast.success(`Obligación ${numero} aprobada`)
  }

  async function handleGuardarNota() {
    if (!notaModal) return
    const { obligacionId, texto, estado, numero } = notaModal
    setGuardandoNota(true)
    const ok = await aplicarRevision(obligacionId, estado, texto)
    setGuardandoNota(false)
    if (!ok) return
    setNotaModal(null)
    toast.success(
      estado === 'devuelta'
        ? `Obligación ${numero} marcada para devolución`
        : `Observación guardada en la obligación ${numero}`,
    )
  }

  // Ancla de la sección de obligaciones. Ya no hay ningún botón que lleve
  // hasta aquí —el de «Ir a mis actividades» se retiró—, pero el ancla se
  // conserva porque identifica la sección para cualquier enlace futuro.
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


  /**
   * ¿Esta revisión es de ESTE envío, o sobró del anterior?
   *
   * Las filas de `obligacion_revisiones` no se borran jamás. Cuando la
   * contratista corregía y reenviaba, la segunda revisión abría con las
   * aprobaciones y notas de la primera intactas: la barra decía «3 de 3
   * revisadas» sin que nadie hubiera mirado el informe corregido, y el ✓
   * verde daba por bueno un contenido que ya no era el revisado.
   *
   * No hace falta borrar nada ni migrar la tabla: basta comparar la marca de
   * la revisión con la fecha del envío vigente. Lo anterior al envío actual se
   * muestra como referencia —la nota se conserva, que es lo que dice qué se
   * pidió— pero el veredicto vuelve a estar abierto.
   */
  const revisionVigente = useCallback((oblId: string): boolean => {
    const r = revisiones[oblId]
    if (r === undefined) return false
    if (!periodo?.fecha_envio) return true       // nunca enviado: no hay ciclo con el que comparar
    if (!r.revisado_at) return true              // fila antigua sin marca: se respeta
    return new Date(r.revisado_at) >= new Date(periodo.fecha_envio)
  }, [revisiones, periodo?.fecha_envio])

  // Progreso de revisión por obligación — usado en el panel de secretaria
  const obligacionesConRevision = obligaciones.filter(obl => revisionVigente(obl.id))
  const obligacionesSinRevisar = obligaciones.filter(obl => !revisionVigente(obl.id))

  /**
   * Obligaciones marcadas para devolución en este ciclo.
   *
   * Marcarlas no devuelve nada por sí solo: la devolución ocurre UNA vez,
   * desde el panel, y ese único correo las lleva todas. Por eso el panel
   * necesita contarlas —para que el revisor vea que hay algo pendiente de
   * enviar— y por eso aprobar el informe con marcas puestas tiene que avisar:
   * al aprobar, esas devoluciones no le llegan a nadie.
   */
  const obligacionesDevueltas = obligaciones.filter(
    obl => revisionVigente(obl.id) && revisiones[obl.id]?.aprobada === false,
  )

  /**
   * El último movimiento del informe: qué pasó, cuándo y quién.
   *
   * Se lee del historial que ya viene cargado. Es UNA línea, no una sección:
   * quien revisa abre la pantalla para decidir, y lo que necesita de entrada es
   * desde cuándo está esperando y de quién viene. La trazabilidad completa
   * sigue al final de la página para quien la necesite entera.
   */
  const eventos = periodo?.historial ?? []

  /**
   * Por qué volvió, para quien revisa.
   *
   * Antes decía «Sin motivo especificado» y se quedaba ahí. Ahora el motivo
   * general puede ir legítimamente vacío —cuando el revisor marcó obligaciones
   * con su texto—, así que ese mensaje pasaría de ser incompleto a ser
   * directamente falso. Se cuenta lo que hay, sin repetir los textos: las
   * obligaciones marcadas están justo debajo, en ámbar y con su «Ver qué
   * corregir». Duplicarlas aquí sería saturar por decir dos veces lo mismo.
   */
  const motivoDevolucion_ = periodo?.motivo_rechazo?.trim()
  const porQueVolvio = motivoDevolucion_
    ? motivoDevolucion_
    : obligacionesDevueltas.length > 0
      ? `${obligacionesDevueltas.length} ${obligacionesDevueltas.length === 1 ? 'obligación marcada' : 'obligaciones marcadas'} con observaciones`
      : 'Sin motivo registrado'
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
   * Quién puede enviar el informe, que NO es lo mismo que «el periodo admite
   * cambios». Mismo alcance que `enviarPeriodo` en el servidor: la contratista
   * y el administrador. Un asesor o un supervisor no envían informes de otra
   * persona, así que tampoco deben ver la tarjeta que los envía.
   */
  const puedeEnviar = esContratista || usuario?.rol === 'admin'

  /**
   * Quién REDACTA el informe: añade, edita o borra actividades y sube
   * evidencias. Es el mismo alcance que enviar, y por el mismo motivo — el
   * informe es la declaración de la contratista, no de quien la revisa.
   *
   * Sin esta distinción, un supervisor abriendo un borrador o un informe
   * devuelto se encontraba «+ Agregar actividad», «Adjuntar evidencia»,
   * «Tomar foto» y los iconos de editar y borrar sobre cada actividad ajena.
   * Nada de eso es su labor, y el servidor tampoco lo impide: la comprobación
   * de propiedad en app/actions/actividades.ts solo corre cuando el rol es
   * `contratista`, así que la única barrera estaba —y ahora está— aquí.
   */
  const puedeRedactar = esEditable && puedeEnviar
  /**
   * Quién puede adjuntarla: la contratista mientras el informe sea editable, y
   * el administrador siempre —también sobre informes ya enviados, igual que
   * ocurre con la planilla—. Es el mismo alcance que aplica prepararUploadFactura
   * en el servidor.
   */
  const puedeAdjuntarFactura =
    usuario?.rol === 'admin' || (esEditable && esContratista)

  // ── Mes de cotización: meses disponibles (rango del contrato ±1) ───────────
  // El selector ofrece el rango del contrato más un mes de holgura a cada
  // lado: un pago por mes vencido puede cotizar el mes justo antes del inicio
  // (cierre de un ciclo de SS que ya venía corriendo) o el que sigue al fin
  // (SS pagada después de terminar el contrato). Un contrato corto —dos meses,
  // como el caso que expuso esto— se queda sin esas opciones sin el margen.
  const mesesContrato = (() => {
    if (!contrato?.fecha_inicio || !contrato?.fecha_fin) return [...MESES]
    const ini = new Date(contrato.fecha_inicio + 'T00:00:00')
    const fin = new Date(contrato.fecha_fin + 'T00:00:00')
    const out: string[] = []
    const cursor = new Date(ini.getFullYear(), ini.getMonth() - 1, 1)
    const tope = new Date(fin.getFullYear(), fin.getMonth() + 1, 1)
    while (cursor <= tope && out.length < 24) {
      out.push(MESES[cursor.getMonth()])
      cursor.setMonth(cursor.getMonth() + 1)
    }
    // `out` guarda NOMBRES de mes, y con el mes de holgura a cada lado el
    // recorrido puede pasar de doce: un contrato de enero a diciembre —26 de
    // los 153 activos— recorría catorce meses y listaba «Diciembre» y «Enero»
    // DOS VECES. Además de la advertencia de React por claves repetidas, el
    // revisor veía dos opciones idénticas y sin forma de distinguirlas: el
    // campo guarda solo el nombre, así que las dos significan lo mismo.
    const unicos = [...new Set(out)]
    return unicos.length ? unicos : [...MESES]
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

  // ── Planilla sin revisar al momento de aprobar ────────────────────────────
  //
  // El art. 23 de la Ley 1150 de 2007 obliga a verificar los aportes a
  // seguridad social en CADA pago del contrato, no solo al liquidarlo. Pero
  // aprobar el informe y revisar la planilla son acciones independientes, así
  // que un informe podía aprobarse —y radicarse— sin que nadie mirara el
  // soporte: al implementar esto, 4 de los 5 informes en revisión estaban en
  // esa situación.
  //
  // El aviso NO bloquea: hay casos legítimos (planilla que llega aparte, mes
  // vencido en trámite) y frenar el flujo por completo dejaría el trabajo
  // detenido. Solo obliga a que la omisión sea consciente, no accidental.
  //
  // `rechazada` entra en la cuenta. Quedaba fuera, así que una planilla que un
  // revisor había devuelto EXPRESAMENTE por incorrecta se trataba igual que
  // una verificada y correcta: el aviso no salía. En producción hay un informe
  // aprobado con la planilla en ese estado, y 127 de 202 aprobados o radicados
  // con la planilla que nadie llegó a revisar.
  const planillaSinRevisar = !!periodo && (
    !periodo.planilla_ss_url ||
    periodo.planilla_estado === 'pendiente' ||
    periodo.planilla_estado === 'rechazada'
  )
  const motivoPlanillaSinRevisar = !periodo?.planilla_ss_url
    ? 'El contratista no ha adjuntado la planilla de seguridad social.'
    : periodo?.planilla_estado === 'rechazada'
      ? 'La planilla fue devuelta por incorrecta y el contratista todavía no ha subido una nueva.'
      : 'La planilla está adjunta pero nadie la ha revisado todavía.'

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

  // La sección nace en su estado final —visible, en su sitio— y solo se le
  // resta eso un instante para poder devolvérselo con una transición. Sin el
  // doble `requestAnimationFrame` React pintaría ya con la clase de «visible»
  // en el primer cuadro y la entrada no llegaría a jugarse: es el mismo motivo
  // que en `useEscena` (components/folleto/Escenas.tsx).
  //
  // Es lo que hace que el cierre de EnvioInforme y la llegada de esta sección
  // se crucen en vez de saltar: mientras el modal juega su propia salida
  // (`upload-overlay-exit`, ver components/EnvioInforme.tsx), el expediente ya
  // empieza a asentarse detrás.
  const [documentosVisibles, setDocumentosVisibles] = useState(false)
  useEffect(() => {
    if (!puedeVerDocumentos) { setDocumentosVisibles(false); return }
    let r2 = 0
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setDocumentosVisibles(true)) })
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
  }, [puedeVerDocumentos])

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
    // Se llama desde dos sitios —justo tras verificar el acta, o después de
    // aceptar el acta de terminación— así que abre y reinicia su propio
    // estado: no puede asumir que alguien más lo dejó listo.
    setEnviando(true)
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
      router.refresh()
      void cargarDatos()
      invalidarPeriodos(queryClient)
    } catch {
      // Caída de red al invocar la acción. Sin este catch el botón se quedaría
      // deshabilitado para siempre y solo un F5 lo recuperaría.
      setEnvioError('No se pudo completar el envío. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  async function handleEnviar() {
    if (enviando) return

    const faltaPlanilla = !periodo?.planilla_ss_url
    const faltaNumero = !numPlanilla.trim()

    if (faltaPlanilla || faltaNumero) {
      setErroresCampos({ planilla: faltaPlanilla, numero: faltaNumero })
      toast.error('Para enviar el informe de actividades, debes adjuntar la planilla de seguridad social valida')
      seccionEnvioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setErroresCampos({ planilla: false, numero: false })

    // El botón se bloquea YA —sin esperar la verificación del acta—, pero
    // `EnvioInforme` todavía no se abre. Se probó a abrirla en este mismo
    // punto (antes de saber si hace falta el acta) y salió mal: cuando el
    // periodo resulta ser el ÚLTIMO del contrato, esta capa tenía que
    // cederle el paso al Acta de Terminación un instante después de
    // aparecer, y su salida animada (ver EnvioInforme.tsx) se quedaba
    // flotando 220 ms EN LA MISMA PANTALLA que el acta —z-80 sobre z-70—,
    // bloqueando cualquier clic y leyéndose como la aplicación colgada. La
    // animación solo puede abrirse una vez se sabe que de verdad va a
    // enviar, no antes.
    setEnviando(true)

    // Acta de terminación: obligatoria antes del ÚLTIMO informe del contrato.
    let acta: Awaited<ReturnType<typeof verificarActaTerminacionRequerida>>
    try {
      acta = await verificarActaTerminacionRequerida(periodoId)
    } catch {
      setEnviando(false)
      toast.error('No se pudo verificar el informe. Revisa tu conexión e inténtalo de nuevo.')
      return
    }

    if (acta.requerida && acta.prefill) {
      // Caso poco frecuente —solo el último periodo del contrato—: el acta
      // de terminación reemplaza al envío. `EnvioInforme` nunca llegó a
      // abrirse, así que no hay nada que cerrar ni con quién chocar.
      setEnviando(false)
      setActaPrefill(acta.prefill)
      setActaFaltaFirma(acta.faltaFirma)
      setMostrarActa(true)
      return
    }

    await doEnviar()
  }

  async function handleAprobarAsesor() {
    // Mismo criterio que la secretaría: el asesor tampoco debería dejar pasar
    // un informe con la planilla sin verificar sin darse cuenta.
    if (planillaSinRevisar && !confirmandoAprobacionAsesor) {
      setConfirmandoAprobacionAsesor(true)
      setMostrarConfirmacionAprobacion(true)
      return
    }
    setConfirmandoAprobacionAsesor(false)
    setProcesando(true)
    const result = await aprobarComoAsesor(periodoId)
    if (result.error) toast.error(result.error)
    else { toast.success('Informe aprobado como asesor'); router.refresh(); cargarDatos(); invalidarPeriodos(queryClient) }
    setProcesando(false)
  }

  async function handleRevocarPreaprobacion() {
    setProcesando(true)
    const result = await revocarPreaprobacion(periodoId)
    if (result.error) toast.error(result.error)
    else { toast.success('Aprobación revocada'); router.refresh(); cargarDatos(); invalidarPeriodos(queryClient) }
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
      router.refresh(); cargarDatos(); invalidarPeriodos(queryClient)
    }
    setProcesando(false)
  }

  async function handleAprobarSecretaria() {
    // Confirmación previa si queda algo sin revisar: obligaciones sin
    // seguimiento, la planilla sin verificar, o —lo más grave— obligaciones
    // marcadas para devolución que al aprobar no le llegarían a nadie.
    if ((!todasRevisadas && obligaciones.length > 0) || planillaSinRevisar || obligacionesDevueltas.length > 0) {
      setMostrarConfirmacionAprobacion(true)
      return
    }
    setProcesando(true)
    const result = await aprobarPeriodos([periodoId])
    if (result.error) toast.error(result.error)
    else { toast.success('Informe aprobado'); router.refresh(); cargarDatos(); invalidarPeriodos(queryClient) }
    setProcesando(false)
  }

  async function handleConfirmarAprobacion() {
    setMostrarConfirmacionAprobacion(false)
    // El asesor y la secretaría comparten esta confirmación pero aprueban con
    // acciones distintas: el asesor pre-aprueba (→ revision), la secretaría
    // aprueba en firme.
    if (confirmandoAprobacionAsesor) {
      await handleAprobarAsesor()
      return
    }
    setProcesando(true)
    const result = await aprobarPeriodos([periodoId])
    if (result.error) toast.error(result.error)
    else { toast.success('Informe aprobado'); router.refresh(); cargarDatos(); invalidarPeriodos(queryClient) }
    setProcesando(false)
  }

  async function handleDevolverSecretaria(destino: 'asesores' | 'contratista', motivo: string) {
    // El motivo general deja de ser obligatorio cuando ya hay obligaciones
    // marcadas con su texto: eso viaja en el mismo correo y dice qué corregir.
    // Sin marcas sigue siéndolo, porque entonces sería lo único que llega.
    if (!motivo.trim() && obligacionesDevueltas.length === 0) {
      toast.error('Escribe el motivo, o marca en las obligaciones qué debe corregirse')
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
      invalidarPeriodos(queryClient)
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
      router.refresh(); cargarDatos(); invalidarPeriodos(queryClient)
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
      router.refresh(); cargarDatos(); invalidarPeriodos(queryClient)
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
    if (destinoDevolver === 'borrador' && !motivoDevolver.trim()) {
      toast.error('El motivo es obligatorio al devolver a borrador')
      return
    }
    setProcesandoDevolver(true)
    const result = await adminDevolverPeriodo(periodoId, destinoDevolver, motivoDevolver.trim() || undefined)
    if (result.error) {
      toast.error(result.error)
    } else {
      const label =
        destinoDevolver === 'asesores'   ? 'asesores' :
        destinoDevolver === 'supervisor' ? 'supervisor' :
        destinoDevolver === 'borrador'   ? 'borrador' :
        'contratista'
      toast.success(`Periodo devuelto a ${label}`)
      setDestinoDevolver(null)
      setMotivoDevolver('')
      router.refresh(); cargarDatos(); invalidarPeriodos(queryClient)
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
    else {
      toast.success('Número de planilla guardado')

      // Aviso de mes vencido / posible cotización faltante — al CONTRATISTA,
      // en el momento de guardar. Antes esta detección solo se mostraba al
      // revisor, después: quien sube la planilla nunca se enteraba de que
      // estaba reutilizando un número.
      //
      // Mismo criterio y mismos umbrales que la franja de alerta del revisor
      // (más abajo, nivelAlertaPlanilla): 2 repeticiones es un pago por mes
      // vencido (válido); 3 o más sugiere que un mes quedó sin cotizar.
      // periodosHermanos es la foto de la última carga de la página, así que
      // TODAVÍA no incluye el número que se acaba de guardar — se excluye la
      // fila de este mismo periodo por id (para no contarla con el valor
      // viejo) y se suma 1 por el guardado que sí acaba de ocurrir.
      const numGuardado = numPlanilla.trim()
      const repeticiones = numGuardado
        ? periodosHermanos.filter(p => p.id !== periodoId && (p.numero_planilla ?? '').trim() === numGuardado).length + 1
        : 0

      // Base legal: Ley 789 de 2002, art. 50 — al liquidar el contrato, la
      // entidad debe verificar que los aportes se cotizaron durante TODA la
      // vigencia; un mes vencido pagado tarde es válido, uno que nunca se
      // cotizó no. Ley 1150 de 2007, art. 23 extiende esa verificación a
      // cada pago del contrato, no solo al final — el ciclo mensual que ya
      // sigue esta app.
      if (repeticiones >= 3) {
        toast.warning('Esta planilla ya se usó en varios periodos', {
          description: 'Puede que falte un mes por cotizar. Debes quedar al día antes de terminar tu contrato — así lo exige la Ley 789 de 2002.',
          duration: 10000,
        })
      } else if (repeticiones === 2) {
        toast.warning('Recuerda estar al día con tu seguridad social', {
          description: 'Es válido pagar por mes vencido, pero debes quedar al día antes de terminar tu contrato — así lo exige la Ley 789 de 2002.',
          duration: 8000,
        })
      }
    }
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
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Icono glifo={Iconos.navegacion.firmas} tamano="sm" className="shrink-0 text-gray-400 mt-0.5" />
            <p className="text-xs text-amber-700">
              <strong>Recomendado:</strong> Registra tu firma para completar correctamente tus informes.
            </p>
          </div>
          <Link
            href="/dashboard/perfil"
            className="text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 shrink-0 self-start sm:self-auto"
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
        <div className={`border rounded-2xl px-5 py-4 mb-6 flex flex-wrap items-start gap-3 ${periodo.habilitado_tardio ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
          <Icono glifo={periodo.habilitado_tardio ? Iconos.estado.desbloqueado : Iconos.estado.bloqueado} tamano="lg" className="flex-shrink-0 text-gray-400" />
          <div className="flex-1 min-w-[12rem]">
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

      {/* Period header */}
      <div className="bg-white rounded-2xl border p-5 sm:p-6 mb-6">
        {/* En un teléfono el estado y el valor no caben en una columna a la
            derecha del título sin estrangular ambas: el nombre completo de la
            contratista se parte en una palabra por línea. Debajo y en fila
            —estado a la izquierda, valor a la derecha— es la misma información
            sin pelear por el ancho. */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">{periodo.mes} {periodo.anio}</h2>
            <p className="text-sm text-gray-500 mt-1">
              Periodo {periodo.numero_periodo} — Del {periodo.fecha_inicio} al {periodo.fecha_fin}
            </p>
            <p className="text-sm text-gray-400 mt-1 break-words">
              Contrato N.° {contrato.numero} — {contrato.contratista?.nombre_completo}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start sm:text-right shrink-0">
            <span className={`inline-block text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap ${estadoClass}`}>
              {estadoTexto}
            </span>
            <p className="text-lg font-bold text-gray-900 sm:mt-2 whitespace-nowrap">
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

      {/* ── Approval timeline ─────────────────────────────────
          A la contratista con el informe devuelto esta tarjeta no se le
          muestra: cuando hay rechazo la línea de estado se sustituye por un
          aviso rojo que decía «Informe devuelto para corrección», y justo
          debajo la tarjeta de corrección abre con «Tu informe volvió para
          corrección». Dos titulares seguidos para el mismo hecho. Quien
          revisa sí la conserva — esa segunda tarjeta es solo para ella. */}
      {!(rechazado && esContratista) && (
      <div className="bg-white rounded-2xl border p-5 mb-6">
        {rechazado ? (
          /* A la contratista el motivo se lo cuenta —entero y con qué hacer—
             la tarjeta de arriba. Repetirlo aquí era decir lo mismo dos veces
             seguidas en la misma pantalla. Quien revisa sí lo necesita en este
             sitio, porque para esos roles esa tarjeta no existe. */
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0">
              <Icono glifo={Iconos.accion.devolver} tamano="sm" className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-700">Informe devuelto para corrección</p>
              {esContratista ? (
                <p className="text-xs text-gray-400 mt-0.5">Vuelve a enviarlo cuando termines de corregir.</p>
              ) : (
                <>
                  <p className="text-xs text-red-500 mt-0.5 break-words">{porQueVolvio}</p>
                  {eventos.length > 0 && (
                    <div className="mt-2">
                      <TrazaPeriodo eventos={eventos} />
                    </div>
                  )}
                </>
              )}
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

        {/* ── Dónde está y desde cuándo, para quien revisa ──────────────
            Una línea gris bajo la línea de estado, no una sección más. Quien
            revisa abre esta pantalla para decidir, y lo primero que necesita
            es saber cuánto lleva esperando y de quién viene — que es
            exactamente lo que la trazabilidad del final ya cuenta, pero
            veinte pantallas más abajo y en doce filas.

            A la contratista no se le muestra: para ella el estado ya lo dicen
            la línea de arriba y su propia tarjeta, y esto sería ruido. */}
        {!esContratista && !rechazado && eventos.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-2 gap-y-1">
            <TrazaPeriodo eventos={eventos} />
            <span className="text-[11px] text-gray-300">Trazabilidad</span>
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
      )}

      {/* ── Lo que pidió la revisión (contratista) ────────────────
          Esto era un bloque rojo entero con un emoji «↩️», dos tarjetas
          numeradas «1 Corrige / 2 Reenvía» y un botón «Ir a mis actividades»
          que solo hacía scroll. Tres problemas:

          · El emoji contradice la regla 1 de lib/iconos.ts, y además cada
            sistema operativo lo dibujaba distinto.
          · Los pasos numerados se repetían TRES veces en la misma pantalla
            (aquí, sobre el acordeón y en la tarjeta de envío) para decir algo
            que la página ya cuenta por sí sola.
          · El botón de scroll resolvía un problema que no existe: con el
            informe devuelto el acordeón ya se abre desplegado, así que las
            actividades están a la vista nada más bajar.

          Lo que de verdad importa —lo que escribió quien revisó— quedaba
          encajonado entre toda esa decoración. Ahora es el contenido, y el
          rojo se reduce a un filo lateral: el mismo lenguaje de acento que
          usan las obligaciones. */}
      {esContratista && (rechazado || periodo.planilla_estado === 'rechazada') && (
        <div className="bg-white border border-gray-200 border-l-4 border-l-red-500 rounded-2xl p-5 mb-6 divide-y divide-gray-100">

          {rechazado && (
            <div className={periodo.planilla_estado === 'rechazada' ? 'pb-4' : ''}>
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0">
                  <Icono glifo={Iconos.accion.devolver} tamano="md" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Tu informe volvió para corrección</p>
                  {periodo.motivo_rechazo ? (
                    <>
                      <p className="text-xs text-gray-500 mt-2">Esto fue lo que indicó la revisión:</p>
                      <blockquote className="mt-1.5 border-l-2 border-red-200 pl-3 text-sm text-gray-700 leading-relaxed break-words">
                        {periodo.motivo_rechazo}
                      </blockquote>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                      No se dejó un motivo escrito. Revisa tus actividades y vuelve a enviarlo.
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    Tus obligaciones están abiertas más abajo. Cuando termines de corregir,
                    reenvía el informe desde el final de la página.
                  </p>
                </div>
              </div>
            </div>
          )}

          {periodo.planilla_estado === 'rechazada' && (
            <div className={rechazado ? 'pt-4' : ''}>
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0">
                  <Icono glifo={Iconos.dominio.seguridadSocial} tamano="md" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Tu planilla de seguridad social volvió para corrección</p>
                  {periodo.planilla_comentario ? (
                    <>
                      <p className="text-xs text-gray-500 mt-2">Esto fue lo que indicó la revisión:</p>
                      <blockquote className="mt-1.5 border-l-2 border-red-200 pl-3 text-sm text-gray-700 leading-relaxed break-words">
                        {periodo.planilla_comentario}
                      </blockquote>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                      No se dejó un motivo escrito. Adjunta la planilla correcta para continuar.
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    Puedes reemplazarla desde el campo <strong className="font-medium text-gray-500">Planilla Seguridad Social</strong>,
                    en la tarjeta de envío al final de la página.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

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
              // Fuera del circuito de revisión, y por eso en gris y al final:
              // los otros tres mueven el periodo entre revisores; este lo
              // devuelve a como si nunca se hubiera enviado.
              { key: 'borrador',    label: 'Devolver a Borrador',    color: destinoDevolver === 'borrador'    ? 'bg-gray-900 text-white'    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100' },
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
              {/* El único destino que saca el periodo del circuito merece
                  decir qué implica: si ya hay documentos emitidos, sus
                  códigos QR están repartidos y lo que los sustenta vuelve a
                  ser editable. */}
              {destinoDevolver === 'borrador' && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
                  El informe volverá a quedar <strong>sin enviar</strong>, editable por la contratista.
                  Si este periodo ya tiene documentos emitidos, sus códigos de verificación siguen
                  siendo válidos y no se reescriben — pero la información que los sustenta vuelve a
                  ser editable. Úsalo para deshacer un envío por error, no para corregir un informe
                  ya revisado (para eso está «Devolver a Contratista»).
                </p>
              )}
              <textarea
                value={motivoDevolver}
                onChange={e => setMotivoDevolver(e.target.value)}
                placeholder={
                  destinoDevolver === 'contratista'
                    ? 'Motivo del rechazo (obligatorio)…'
                    : destinoDevolver === 'borrador'
                      ? 'Por qué se deshace el envío (obligatorio)…'
                      : 'Motivo o comentario (opcional)…'
                }
                rows={2}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAdminDevolver}
                  disabled={procesandoDevolver || ((destinoDevolver === 'contratista' || destinoDevolver === 'borrador') && !motivoDevolver.trim())}
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

      {/* ── Panel del ASESOR (aprobar / rechazar) ────────────────────
          Dos condiciones cambiaron, y las dos por el mismo motivo: este panel
          deja de aparecer donde crea ambigüedad.

          · Ya no lo ve el supervisor. Lo veía por `esSecretaria`, y entonces
            tenía DOS paneles con un aprobar y un rechazar cada uno —cuatro
            botones para dos decisiones—, con la trampa de que «Aprobar» aquí
            solo pre-aprueba (pasa a `revision`) mientras que «Aprobar informe»
            del panel de supervisión aprueba en firme. Nada en la pantalla lo
            decía: quien pulsaba el de arriba creía haber aprobado y el informe
            se quedaba esperando.

          · Ya no aparece con el informe en `rechazado`. Ahí la pelota es de la
            contratista, que lo está editando en ese momento; el botón
            «Aprobar ahora» lo movía a `revision` y le borraba el motivo de
            rechazo a media corrección. El servidor también cierra esa puerta
            (ver aprobarComoAsesor). */}
      {(periodo.estado === 'enviado' || periodo.estado === 'revision') && esAsesor && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 shrink-0"><Icono glifo={Iconos.accion.ver} tamano="sm" /></div>
            <div className="min-w-0">
              <h3 className="font-medium text-gray-900">Revisión del asesor</h3>
              <p className="text-xs text-gray-400">
                {periodo.estado === 'revision'
                  ? 'Este informe está marcado como revisado. Puedes revocar si detectas un problema.'
                  : 'Revisa las actividades y evidencias. Al aprobar, el informe pasa a la secretaría.'}
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
                  className="flex-1 bg-amber-50 text-amber-700 border border-amber-200 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {procesando ? 'Procesando...' : (
                    <>
                      <Icono glifo={Iconos.accion.devolver} tamano="sm" className="shrink-0" />
                      Revocar aprobación
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleAprobarAsesor}
                  disabled={procesando}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {/* Dice a dónde va el informe. «Aprobar» a secas se
                      confundía con el «Aprobar informe» de la secretaría, que
                      es el que cierra la revisión de verdad. */}
                  {procesando ? 'Procesando...' : 'Aprobar y pasar a secretaría'}
                </button>
              )}
              {(periodo.estado === 'enviado' || periodo.estado === 'revision') && (
                <button
                  onClick={() => setMostrarRechazo(true)}
                  className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  Devolver a la contratista
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder={obligacionesDevueltas.length > 0
                  ? 'Mensaje general (opcional) — ya marcaste obligaciones con su texto…'
                  : 'Escribe el motivo del rechazo para el contratista…'}
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
              />
              <MejorarRedaccion texto={motivoRechazo} onAceptar={setMotivoRechazo} disabled={procesando} />
              <div className="flex gap-3">
                <button
                  onClick={handleRechazarAsesor}
                  disabled={procesando || (!motivoRechazo.trim() && obligacionesDevueltas.length === 0)}
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
              className="flex-1 min-w-0 sm:min-w-[200px] px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-300"
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

        {/* Aquí vivía un «1 Corrige tus actividades» con su círculo rojo, y en
            la tarjeta de envío un «2 Reenvía tu informe». Numerar dos pasos
            obvios, con los mismos círculos que usa la línea de estado de
            arriba, competía con ella y no añadía nada: la tarjeta de arriba ya
            dice qué corregir y el botón de abajo ya dice qué hacer después. */}

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
          //
          // «Revisada» significa revisada EN ESTE ENVÍO: una aprobación del
          // ciclo anterior no da por bueno un informe que ya cambió.
          const revisada = revisionVigente(obl.id)
          const notaDelCicloAnterior = tieneNota && !revisada
          // Los mismos tres nombres que usan los botones y el servidor, para
          // que el estado que se pinta y el que se guarda no puedan divergir.
          const estadoRev: EstadoRevision | 'sin_revisar' =
            !revisada ? 'sin_revisar'
            : !rev.aprobada ? 'devuelta'
            : tieneNota ? 'observada'
            : 'aprobada'
          const puedeRevisar = (esAsesor || esSecretaria) && !esHistorico &&
            !!periodo && ['enviado', 'revision', 'rechazado'].includes(periodo.estado)

          /**
           * El acento de la tarjeta: CUATRO casos, no tres.
           *
           * Antes una obligación aprobada se pintaba de verde aunque la
           * supervisión hubiera dejado una nota. Y el verde, en esta interfaz,
           * significa «aquí no tienes nada que hacer» — justo lo contrario de
           * lo que es una nota, que casi siempre pide corregir algo. La
           * contratista pasaba de largo precisamente por donde debía detenerse.
           *
           * Ahora una nota siempre cambia el acento, y adopta el MISMO color
           * que su propia etiqueta en `NotaSupervision`: ámbar cuando pide
           * corregir (obligación sin aprobar), azul cielo cuando solo observa.
           * El verde queda reservado para lo que de verdad está cerrado.
           */
          // Una revisión que sobrevive del ciclo anterior sigue diciendo qué se
          // pidió, pero la obligación está sin revisar: el acento gris dice
          // «nadie se ha pronunciado todavía sobre esta versión».
          const CLASES_ACENTO = {
            devuelta:    'bg-amber-50/40 border-amber-200 border-l-amber-400',
            observada:   'bg-sky-50/40 border-sky-200 border-l-sky-400',
            aprobada:    'bg-green-50/40 border-gray-200 border-l-green-500',
            sin_revisar: 'bg-white border-gray-200 border-l-gray-200',
          } as const

          return (
            <div
              key={obl.id}
              className={`rounded-2xl border border-l-4 p-5 sm:p-6 transition-colors ${CLASES_ACENTO[estadoRev]}`}
            >
              {/* Cabecera — zona clickable (expandir) + acciones de revisión.
                  Colapsada por defecto: las actividades y evidencias (imágenes)
                  no se montan hasta abrir, evitando descargar fotos innecesarias.

                  Un solo `flex-wrap` resuelve las dos ubicaciones sin duplicar
                  los botones en el DOM: la zona clickable ocupa la fila entera
                  hasta `md` (`basis-full`), así que los botones caen debajo; de
                  `md` en adelante comparte fila y quedan a la derecha. */}
              <div className={`flex flex-wrap items-start gap-3 ${abierta ? 'mb-4' : ''}`}>
                {/* Zona clickable: expande/colapsa */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleObligacion(obl.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleObligacion(obl.id) }
                  }}
                  aria-expanded={abierta}
                  className="flex items-start gap-3 flex-1 min-w-0 basis-full md:basis-0 text-left cursor-pointer"
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
                      {/* El estado en palabras, no solo en color: el color por
                          sí solo no es un indicador accesible (WCAG 1.4.1). */}
                      {estadoRev === 'aprobada' && (
                        <Badge variant="green" size="xs">Aprobada por la supervisión</Badge>
                      )}
                      {estadoRev === 'observada' && (
                        <Badge variant="sky" size="xs">Aprobada con observación</Badge>
                      )}
                      {estadoRev === 'devuelta' && (
                        <Badge variant="amber" size="xs">Marcada para devolución</Badge>
                      )}
                      {estadoRev === 'sin_revisar' && puedeRevisar && (
                        <Badge variant="gray" size="xs">
                          {notaDelCicloAnterior ? 'Sin revisar tras la corrección' : 'Sin revisar'}
                        </Badge>
                      )}
                      {/* La etiqueta pasa a ser el disparador de la nota: con
                          ratón se abre al pasar por encima, y al tocar queda
                          fijada. Antes solo anunciaba que existía una nota y
                          obligaba a ir a buscarla al acta de supervisión. */}
                      {tieneNota && (
                        <NotaSupervision
                          nota={rev.nota ?? ''}
                          // Una revisión que quedó del ciclo anterior es, por
                          // definición, lo que se pidió corregir.
                          esCorreccion={estadoRev === 'devuelta' || notaDelCicloAnterior}
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

              {/* ── El veredicto de la obligación ──────────────────────────
                  TRES estados excluyentes, no un ✓ más un campo de texto
                  suelto. Antes, para decir «no cumple, y esto es lo que
                  falta», había que quitar la aprobación Y además escribir la
                  nota, y nada decía que esa pareja significara un hallazgo. Se
                  veía en los datos: las 17 obligaciones marcadas «sin aprobar»
                  en producción no tenían ni una nota.

                  Con etiqueta visible y en su propia fila. La regla 4 de
                  lib/iconos.ts —el icono nunca carga el significado solo— pesa
                  el doble aquí, donde dos de los tres botones son veredictos
                  opuestos. Y en la cabecera no caben: a 320 px dejarían la
                  descripción de la obligación en unos 60 px.

                  En escritorio sí hay sitio, así que suben a la derecha de la
                  cabecera y se leen como parte de la fila de la obligación. El
                  separador y el margen superior son solo del caso apilado. */}
              {puedeRevisar && (
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:shrink-0 md:justify-end mt-3 pt-3 border-t border-gray-100 md:mt-0 md:pt-0 md:border-t-0">
                  {([
                    {
                      clave: 'aprobada' as const,
                      etiqueta: 'Aprobar',
                      glifo: Iconos.estado.ok,
                      activo: 'bg-green-600 border-green-600 text-white hover:bg-green-700',
                      inerte: 'bg-white border-gray-200 text-gray-500 hover:text-green-700 hover:border-green-400',
                      titulo: 'Cumple, sin nada que añadir',
                    },
                    {
                      clave: 'observada' as const,
                      etiqueta: 'Observación',
                      glifo: Iconos.aviso.mensaje,
                      activo: 'bg-sky-600 border-sky-600 text-white hover:bg-sky-700',
                      inerte: 'bg-white border-gray-200 text-gray-500 hover:text-sky-700 hover:border-sky-400',
                      titulo: 'Cumple, pero queda una observación en el Acta de Supervisión',
                    },
                    {
                      clave: 'devuelta' as const,
                      etiqueta: 'Devolver',
                      glifo: Iconos.accion.devolver,
                      activo: 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600',
                      inerte: 'bg-white border-gray-200 text-gray-500 hover:text-amber-700 hover:border-amber-400',
                      titulo: 'No cumple — la contratista recibirá esto al devolver el informe',
                    },
                  ]).map(({ clave, etiqueta, glifo, activo, inerte, titulo }) => {
                    const seleccionado = estadoRev === clave
                    const pidiendoConfirmacion = clave === 'aprobada' && confirmarQuitarNota === obl.id
                    return (
                      <button
                        key={clave}
                        type="button"
                        disabled={obligacionProcesando === obl.id}
                        aria-pressed={seleccionado}
                        title={titulo}
                        onClick={() => {
                          if (clave === 'aprobada') {
                            // Aprobar retira la observación: es el estado «no hay
                            // nada que añadir». Un segundo toque lo confirma, para
                            // no borrar en silencio algo que alguien escribió.
                            if (tieneNota && !pidiendoConfirmacion) { setConfirmarQuitarNota(obl.id); return }
                            setConfirmarQuitarNota(null)
                            void handleAprobarObligacion(obl.id, oblIndex + 1)
                            return
                          }
                          setConfirmarQuitarNota(null)
                          setNotaModal({ obligacionId: obl.id, numero: oblIndex + 1, texto: rev.nota ?? '', estado: clave })
                        }}
                        className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-40 ${
                          pidiendoConfirmacion
                            ? 'bg-gray-900 border-gray-900 text-white'
                            : seleccionado ? activo : inerte
                        }`}
                      >
                        <Icono glifo={pidiendoConfirmacion ? Iconos.estado.advertencia : glifo} tamano="sm" className="shrink-0" />
                        {pidiendoConfirmacion ? 'Quitar la observación' : etiqueta}
                      </button>
                    )
                  })}
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
                            {puedeRedactar && (
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
                                  {/* Del catálogo, no dibujado aquí: es la
                                      regla 1 de lib/iconos.ts. */}
                                  <Icono glifo={Iconos.accion.editar} tamano="sm" />
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
                                    <Icono glifo={Iconos.accion.eliminar} tamano="sm" />
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
                                      onClick={() => setLightbox({ url: resolverUrl(ev.url), alt: ev.nombre_archivo, evId: puedeRedactar ? ev.id : undefined })}
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
                                    {puedeRedactar && (
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
                                    editable={puedeRedactar}
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

                            {/* La fila de abajo llevaba `xs:flex-row`, y `xs:` NO
                                EXISTE: Tailwind v4 trae sm/md/lg/xl/2xl y este
                                proyecto no define ninguno propio, así que era
                                letra muerta — los dos botones se apilaban en
                                TODOS los anchos, también en escritorio. */}
                            {puedeRedactar && subiendoEvidencia[act.id] == null && (
                              <div className="flex flex-col sm:flex-row gap-2 mt-1">
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
                                    <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="shrink-0" />
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
                                  <Icono glifo={Iconos.dominio.evidencia} tamano="sm" className="shrink-0" />
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
              {puedeRedactar && (
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

                      {/* `flex-wrap` NO es decorativo: sin él esta fila era la
                          causa del scroll horizontal de toda la pantalla. A
                          320 px la fila mide 203 px y su contenido 295 px, así
                          que «Guardar» terminaba 35 px fuera del viewport —
                          medido, no supuesto. El modo edición de más arriba ya
                          envolvía; este formulario se había quedado atrás. */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Cantidad:</label>
                          <input
                            type="number" min={1} value={nuevaCantidad}
                            onChange={(e) => setNuevaCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 text-center"
                          />
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
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

      {/* Submit section (contratista).
          Fondo blanco también cuando el informe viene devuelto: el rojo pleno
          en una tarjeta que solo pide adjuntar la planilla y pulsar un botón
          leía como si algo estuviera fallando AHÍ. El filo lateral basta para
          decir de qué situación venimos.

          `puedeEnviar`, no `esEditable`: esa variable dice que el PERIODO
          admite cambios, no que ESTE usuario pueda hacerlos. Sin el filtro de
          rol, un supervisor abriendo un borrador o un informe devuelto se
          encontraba con «¿Ya corregiste todo?», el campo de la planilla y un
          botón de enviar que el servidor le habría rechazado de todas formas
          (enviarPeriodo solo admite contratista y admin). Preguntas dirigidas
          a otra persona en la pantalla de quien revisa. */}
      {esEditable && puedeEnviar && (
        <div ref={seccionEnvioRef} className={`rounded-2xl border p-5 sm:p-6 mb-6 bg-white ${rechazado ? 'border-gray-200 border-l-4 border-l-red-500' : ''}`}>

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
                    <p className={`text-xs ${
                      periodo.factura_electronica_url ? 'text-gray-400' : 'text-amber-700 font-medium'
                    }`}>
                      {subiendoFactura
                        ? 'Subiendo...'
                        : periodo.factura_electronica_url
                          ? 'Adjuntada — reemplazar'
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
                  {/* Sin `truncate`: a 320 px este rótulo se cortaba en
                      «Cargada — clic para reem…», justo donde estaba la
                      instrucción. Y «clic» no es la palabra en un teléfono,
                      que es desde donde se usa esto. */}
                  <p className={`text-xs ${erroresCampos.planilla ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                    {subiendoPlanilla
                      ? 'Subiendo...'
                      : periodo.planilla_ss_url
                        ? 'Cargada — reemplazar'
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

          {/* Apilado en móvil, en línea en desktop — mismo criterio que el
              encabezado de "Documentos del periodo" un poco más abajo. Sin
              esto, en un teléfono de 320-414px el párrafo se aplastaba contra
              el botón: quedaba en una columna de una palabra por línea junto
              a un botón que nunca cedía ancho, porque la fila nunca envolvía. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-400" aria-live="polite">
              {/* Ya no narra fases del envío: en cuanto hay algo que contar, la
                  animación de EnvioInforme cubre la pantalla entera y este
                  párrafo queda tapado detrás — que siguiera cambiando de texto
                  ahí sería una segunda voz que nadie llega a leer. */}
              {rechazado
                ? 'El asesor recibirá el informe corregido para revisión.'
                : 'Los asesores y la secretaria recibirán este informe para revisión.'
              }
            </p>
            {/* El botón lleva la marca —el isotipo, la tinta institucional— y
                no el azul genérico de cualquier acción. Tampoco anuncia nada
                por su cuenta: ni «Verificando…» ni «Enviando…». En cuanto se
                pulsa, la animación de EnvioInforme ya está en pantalla
                contando esa historia; el botón solo se deshabilita para no
                admitir un segundo envío mientras tanto. */}
            <button
              onClick={handleEnviar}
              disabled={enviando || actividades.length === 0}
              aria-busy={enviando}
              className={`text-white px-6 py-3 rounded-xl font-medium active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed shrink-0 w-full sm:w-auto flex items-center justify-center gap-2 ${
                rechazado
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'hover:bg-[#242F45]'
              }`}
              style={rechazado ? undefined : { backgroundColor: MARCA }}
            >
              <LogoCD size={16} color="#fff" className="shrink-0" />
              {rechazado ? 'Reenviar a revisión' : 'Enviar a revisión'}
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
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <input
                type="text"
                value={numRadicadoEdit}
                onChange={e => setNumRadicadoEdit(e.target.value)}
                placeholder="Número de radicado"
                className="flex-1 min-w-0 basis-full sm:basis-auto px-3 py-2 border border-emerald-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
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
                      {/* El rótulo del diccionario, no el valor crudo de la
                          columna: la trazabilidad decía «revision» y «enviado»
                          mientras el resto de la pantalla —y la línea de
                          estado de arriba— dicen «En revisión» y «Enviado».
                          ESTADO_LABEL ya estaba importado en este archivo. */}
                      <span className="font-medium">
                        {h.estado_nuevo
                          ? (ESTADO_LABEL[h.estado_nuevo as EstadoPeriodo] ?? h.estado_nuevo.replace('_', ' '))
                          : 'Actualizado'}
                      </span>
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

          {/* Revocar la pre-aprobación del asesor.
              Vivía en el panel del asesor, que el supervisor ya no ve. Es una
              acción secundaria —deshace el paso de otro— así que va como
              enlace discreto y solo cuando hay algo que deshacer.

              `!esAsesor` evita reponer la duplicación por otra puerta: el
              admin sigue viendo el panel del asesor, con su propio «Revocar
              aprobación», y tener los dos a la vez sería el mismo problema que
              se vino a quitar. Esta línea es, en la práctica, para el
              supervisor. */}
          {periodo.estado === 'revision' && !esAsesor && (
            <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-gray-100">
              <p className="text-xs text-gray-400 min-w-0">
                Un asesor ya revisó este informe.
              </p>
              <button
                onClick={handleRevocarPreaprobacion}
                disabled={procesando}
                className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 disabled:opacity-50 shrink-0"
              >
                Revocar esa revisión
              </button>
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
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 border ${
                obligacionesDevueltas.length > 0
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 font-semibold'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              <Icono glifo={Iconos.accion.devolver} tamano="sm" className="shrink-0" />
              {/* El recuento es lo que hace honesta la palabra «Devolver» en
                  cada obligación: ahí solo se marca, y la devolución —con su
                  único correo— ocurre aquí. */}
              {obligacionesDevueltas.length > 0 ? `Devolver informe (${obligacionesDevueltas.length})` : 'Devolver'}
            </button>
          </div>
        </div>
      )}

      {/* ── Documents section ── */}
      {puedeVerDocumentos && (
        <div className={`bg-white rounded-2xl border p-4 sm:p-6 mt-4 transition-all duration-500 ease-out ${
          documentosVisibles ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}>

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
                      {/* Va impresa en el Acta de Supervisión, bajo
                          «Conclusiones y recomendaciones del supervisor». */}
                      <MejorarRedaccion
                        texto={textoObservacion}
                        onAceptar={setTextoObservacion}
                        disabled={guardandoObservacion}
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
                        {/* `min-w-0` en el input y `flex-wrap` en la fila: un
                            <input> es un elemento de reemplazo, así que su
                            `min-width:auto` vale su ancho intrínseco (~172 px)
                            y `flex-1` no lograba encogerlo. A 320 px eso
                            empujaba «Guardar» 36 px fuera de su fila, donde el
                            `overflow-hidden` del desplegable lo recortaba a la
                            mitad. Es el botón cortado que se veía en móvil. */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Icono glifo={Iconos.dominio.numero} tamano="sm" className="shrink-0" />
                          <input
                            value={numPlanilla}
                            onChange={(e) => { setNumPlanilla(e.target.value); setErrorFormatoPlanilla(null) }}
                            placeholder="Ej. 6016087440"
                            inputMode="text"
                            className={`flex-1 min-w-0 px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 ${errorFormatoPlanilla ? 'bg-red-50 border-red-400' : 'bg-gray-50 border-gray-200'}`}
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
                            <p className="text-sm font-medium text-red-600">Devolver planilla</p>
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
          onClick={() => { if (!procesando) { setMostrarConfirmacionAprobacion(false); setConfirmandoAprobacionAsesor(false) } }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 flex-shrink-0"><Icono glifo={Iconos.estado.advertencia} tamano="md" /></div>
              <h3 className="text-sm font-semibold text-gray-900">
                {obligacionesDevueltas.length > 0
                  ? 'Hay obligaciones marcadas para devolución'
                  : planillaSinRevisar && obligacionesSinRevisar.length > 0
                    ? 'Quedan puntos sin revisar'
                    : planillaSinRevisar
                      ? 'Planilla sin revisar'
                      : 'Obligaciones sin revisar'}
              </h3>
            </div>

            {/* Lo primero, porque es lo que se pierde de forma irreversible:
                aprobar cierra el periodo y esas devoluciones no salen por
                ningún correo. El revisor las marcó esperando que llegaran. */}
            {obligacionesDevueltas.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
                <p className="text-xs font-semibold text-amber-900 mb-1">
                  {obligacionesDevueltas.length === 1
                    ? 'Marcaste 1 obligación para devolución'
                    : `Marcaste ${obligacionesDevueltas.length} obligaciones para devolución`}
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {obligacionesDevueltas.map(obl => (
                    <p key={obl.id} className="text-xs text-amber-800 leading-relaxed">
                      {obligaciones.indexOf(obl) + 1}. {obl.descripcion}
                    </p>
                  ))}
                </div>
                <p className="text-[11px] text-amber-700/90 leading-relaxed mt-2">
                  Si apruebas, el informe se cierra y esas observaciones <strong>no le llegarán
                  a la contratista</strong>. Para que las reciba, usa «Devolver» en vez de aprobar.
                </p>
              </div>
            )}

            {/* Planilla de seguridad social — se muestra primero por su peso
                legal: el art. 23 de la Ley 1150 de 2007 exige verificar los
                aportes en cada pago del contrato. */}
            {planillaSinRevisar && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-3">
                <p className="text-xs font-semibold text-amber-900 mb-0.5">Seguridad social</p>
                <p className="text-xs text-amber-800 leading-relaxed">{motivoPlanillaSinRevisar}</p>
                <p className="text-[11px] text-amber-700/80 leading-relaxed mt-1.5">
                  La Ley 1150 de 2007 exige verificar los aportes en cada pago del contrato.
                </p>
              </div>
            )}

            {obligacionesSinRevisar.length > 0 && (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  Estas obligaciones aún no tienen seguimiento registrado:
                </p>
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4 space-y-1 max-h-40 overflow-y-auto">
                  {obligacionesSinRevisar.map((obl, i) => (
                    <p key={obl.id} className="text-xs text-amber-800 leading-relaxed">
                      {i + 1}. {obl.descripcion}
                    </p>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs text-gray-500 mb-4">¿Deseas aprobar el informe de todas formas?</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setMostrarConfirmacionAprobacion(false); setConfirmandoAprobacionAsesor(false) }}
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
                <Icono glifo={Iconos.accion.devolver} tamano="md" className="flex-shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Devolver a contratista</p>
                  <p className="text-xs text-gray-400 mt-0.5">El contratista corregirá y volverá a enviar</p>
                </div>
              </button>
            </div>

            {destinoDevolucion && (
              <>
                {/* Que no escriba dos veces lo mismo: si ya marcó obligaciones,
                    ese texto viaja igualmente y este campo puede ser breve. */}
                {obligacionesDevueltas.length > 0 && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                    Se enviarán las <strong>{obligacionesDevueltas.length === 1
                      ? '1 obligación marcada'
                      : `${obligacionesDevueltas.length} obligaciones marcadas`}</strong> con su texto,
                    así que este campo es opcional.
                  </p>
                )}
                <textarea
                  value={motivoDevolucion}
                  onChange={(e) => setMotivoDevolucion(e.target.value)}
                  placeholder={obligacionesDevueltas.length > 0
                    ? 'Mensaje general (opcional)…'
                    : 'Motivo de la devolución (obligatorio)…'}
                  rows={3}
                  autoFocus
                  disabled={procesandoDevolucion}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none resize-none disabled:opacity-50"
                />
                <div className="mb-3">
                  <MejorarRedaccion
                    texto={motivoDevolucion}
                    onAceptar={setMotivoDevolucion}
                    disabled={procesandoDevolucion}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => handleDevolverSecretaria(destinoDevolucion, motivoDevolucion)}
                    disabled={procesandoDevolucion || (!motivoDevolucion.trim() && obligacionesDevueltas.length === 0)}
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
          aria-label={notaModal.estado === 'devuelta' ? 'Devolver la obligación' : 'Observación sobre la obligación'}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Un solo cuadro para los dos estados que llevan texto, pero
                diciendo en cada caso a dónde va a parar lo que se escribe. Esa
                es la diferencia que antes el revisor tenía que adivinar. */}
            <div className="flex items-start gap-3 mb-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                notaModal.estado === 'devuelta' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'
              }`}>
                <Icono glifo={notaModal.estado === 'devuelta' ? Iconos.accion.devolver : Iconos.aviso.mensaje} tamano="md" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">
                  {notaModal.estado === 'devuelta'
                    ? `Devolver la obligación ${notaModal.numero}`
                    : `Observación sobre la obligación ${notaModal.numero}`}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {notaModal.estado === 'devuelta'
                    ? 'La obligación queda marcada como no cumplida. Este texto le llegará a la contratista por correo cuando devuelvas el informe, junto a esta obligación. No se imprime en el acta.'
                    : 'La obligación queda aprobada. Este texto se imprime en el Acta de Supervisión bajo «Observación», y le llega a la contratista en el correo de aprobación.'}
                </p>
              </div>
            </div>
            <textarea
              value={notaModal.texto}
              onChange={(e) => setNotaModal({ ...notaModal, texto: e.target.value })}
              rows={5}
              autoFocus
              maxLength={2000}
              placeholder={notaModal.estado === 'devuelta'
                ? 'Ej: No se adjuntó el registro fotográfico de las visitas reportadas a la vereda Combia.'
                : 'Ej: Se cumple, pero se hace un llamado de atención por el reporte tardío de las actividades.'}
              className={`w-full px-3 py-2.5 bg-white border rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none resize-none focus:ring-2 ${
                notaModal.estado === 'devuelta'
                  ? 'border-amber-200 focus:ring-amber-400 focus:border-amber-400'
                  : 'border-sky-200 focus:ring-sky-400 focus:border-sky-400'
              }`}
            />
            {/* La contratista tenía corrección asistida al describir sus
                actividades y quien revisa no, escribiendo textos que acaban
                en un acta firmada o en un correo. Mismo componente. */}
            <MejorarRedaccion
              texto={notaModal.texto}
              onAceptar={(t) => setNotaModal(prev => (prev ? { ...prev, texto: t } : prev))}
              disabled={guardandoNota}
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
                // Sin texto no significan nada: una devolución sin motivo es
                // justo lo que producían las 17 filas «sin aprobar» vacías.
                disabled={guardandoNota || !notaModal.texto.trim()}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-40 ${
                  notaModal.estado === 'devuelta'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {guardandoNota
                  ? 'Guardando...'
                  : notaModal.estado === 'devuelta' ? 'Marcar para devolución' : 'Guardar observación'}
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
