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
} from '@/lib/constants'
import type { Contrato, Periodo, Obligacion, Actividad, EstadoPeriodo } from '@/lib/types'
import { createClient } from '@/lib/supabase'
import { getPeriodoConContrato } from '@/services/periodos'
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
  confirmarUploadPlanilla,
  eliminarPlanilla,
  guardarNumeroPlanilla,
  revisarPlanilla,
  actualizarObservacionSupervisor,
  actualizarBaseCotizacion,
  adminDevolverPeriodo,
} from '@/app/actions/periodos'
import { validarNumeroPlanilla } from '@/lib/validaciones'
import { prepararUploadEvidencia, registrarEvidencia, eliminarEvidencia } from '@/app/actions/evidencias'
import { comprimirEvidencia } from '@/lib/compress'
import { actualizarActividad, crearActividad, eliminarActividad } from '@/app/actions/actividades'
// import { mejorarDescripcion } from '@/app/actions/ia'  // Próximamente

interface InitialData {
  initialContrato: Contrato
  initialPeriodo: Periodo
  initialObligaciones: Obligacion[]
  initialActividades: Actividad[]
}

export default function PeriodoDetallePage({
  initialContrato,
  initialPeriodo,
  initialObligaciones,
  initialActividades,
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


  // Radicado state
  const [numRadicado, setNumRadicado] = useState('')
  const [radicando, setRadicando] = useState(false)
  const [editandoRadicado, setEditandoRadicado] = useState(false)
  const [numRadicadoEdit, setNumRadicadoEdit] = useState('')
  const [guardandoRadicado, setGuardandoRadicado] = useState(false)

  // Upload progress state per activity (null = idle, number = count of files uploading)
  const [subiendoEvidencia, setSubiendoEvidencia] = useState<Record<string, number | null>>({})
  // Byte-level progress 0-100 per activity (M-1)
  const [progresoEvidencia, setProgresoEvidencia] = useState<Record<string, number>>({})
  // Pending DB registration: file uploaded to Storage but registrarEvidencia failed.
  // Persisted to localStorage so the user can retry step 3 after a page refresh.
  const PENDING_KEY = `pendiente_reg_${periodoId}`
  const [pendienteRegistro, setPendienteRegistro] = useState<Record<string, { publicUrl: string; storagePath: string; nombre: string } | null>>(() => {
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

  // Background polling every 30s — contratista sees estado changes without manual refresh
  useEffect(() => {
    const timer = setInterval(() => cargarDatos(true), 30_000)
    return () => clearInterval(timer)
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
        ? `Tu informe ha sido radicado con el No. ${periodo.numero_radicado} 📁`
        : 'Tu informe ha sido radicado exitosamente 📁'
      toast.success(msg, { duration: 6000 })
    }
  }, [periodo?.estado, periodo?.numero_radicado, usuario?.rol])

  // ── Derived values ──────────────────────────────────────────

  const esHistorico = periodo?.es_historico === true
  const esAsesor = usuario?.rol === 'asesor' || usuario?.rol === 'admin'
  const esSecretaria = usuario?.rol === 'supervisor' || usuario?.rol === 'admin'
  const esContratista = usuario?.rol === 'contratista'

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
    const now = new Date()
    const mesIdx = MES_INDEX[(periodo.mes as string).toUpperCase()] ?? -1
    if ((periodo.anio as number) < now.getFullYear()) return true
    if ((periodo.anio as number) === now.getFullYear() && mesIdx < now.getMonth()) return true
    return false
  })()

  const esEditable = !esHistorico && !periodoVencido && (periodo ? ESTADOS_EDITABLES.includes(periodo.estado) : false)

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
    const faltaPlanilla = !periodo?.planilla_ss_url
    const faltaNumero = !numPlanilla.trim()

    if (faltaPlanilla || faltaNumero) {
      setErroresCampos({ planilla: faltaPlanilla, numero: faltaNumero })
      toast.error('Para enviar el informe de actividades, debes adjuntar la planilla de seguridad social valida')
      seccionEnvioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setErroresCampos({ planilla: false, numero: false })
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

  function handleAbrirEditRadicado() {
    setNumRadicadoEdit(periodo?.numero_radicado ?? '')
    setEditandoRadicado(true)
  }

  async function handleGuardarRadicadoEdit() {
    setGuardandoRadicado(true)
    const result = await actualizarNumeroRadicado(periodoId, numRadicadoEdit)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Número de radicado actualizado ✓')
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
      toast.success(texto?.trim() ? 'Observación guardada ✓' : 'Observación eliminada')
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
      cargarDatos()
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
      toast.success('Base de cotización actualizada ✓')
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
      toast.success('Actividad actualizada ✓')
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
  async function handleSubirEvidencias(actividadId: string, files: File[]) {
    const limited = files.slice(0, 5)
    if (files.length > 5) {
      toast.warning('Solo se permiten 5 imágenes a la vez. Se subirán las primeras 5.')
    }

    setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: limited.length }))

    try {
      // A: Compress all files in parallel (pure Canvas — no server calls)
      const compressed = await Promise.all(limited.map(f => comprimirEvidencia(f)))

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

          // Step 2: upload with retry + byte-level progress tracking
          await subirConReintentos(signedUrl, fileToUpload, mime, (loaded) => {
            loadedBytes[idx] = loaded
            const pct = Math.min(99, Math.round(loadedBytes.reduce((a, b) => a + b, 0) / totalBytes * 100))
            setProgresoEvidencia(prev => ({ ...prev, [actividadId]: pct }))
          })

          return { publicUrl, storagePath: path, nombre: fileToUpload.name }
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

        const { publicUrl, storagePath, nombre } = res.value
        const reg = await registrarEvidencia(actividadId, periodoId, publicUrl, storagePath, nombre)
        if (reg.error) {
          setPendienteRegistro(prev => ({ ...prev, [actividadId]: { publicUrl, storagePath, nombre } }))
          toast.error('La imagen se subió pero no se pudo registrar. Toca "Reintentar" para completar.', { duration: 8000 })
        } else {
          successCount++
        }
      }

      if (successCount > 0) {
        toast.success(successCount === 1 ? 'Imagen subida ✓' : `${successCount} imágenes subidas ✓`)
        if (mountedRef.current) {
          router.refresh()
          cargarActividades()
        }
      }
    } finally {
      // F: Always clear overlay + progress — no more "stuck loading" state
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
      setProgresoEvidencia(prev => { const n = { ...prev }; delete n[actividadId]; return n })
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
      const reg = await registrarEvidencia(actividadId, periodoId, pending.publicUrl, pending.storagePath ?? '', pending.nombre)
      if (reg.error) {
        toast.error(`Reintento fallido: ${reg.error}`)
      } else {
        setPendienteRegistro(prev => ({ ...prev, [actividadId]: null }))
        toast.success('Evidencia registrada ✓')
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

      toast.success('Planilla subida exitosamente')
      setPlanillaMenuAbierto(false)
      cargarDatos()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al subir la planilla')
    } finally {
      setSubiendoPlanilla(false)
    }
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
    const errorFormato = validarNumeroPlanilla(numPlanilla)
    if (errorFormato) { setErrorFormatoPlanilla(errorFormato); return }
    setErrorFormatoPlanilla(null)
    setGuardandoPlanilla(true)
    const result = await guardarNumeroPlanilla(periodoId, numPlanilla)
    if (result.error) toast.error(result.error)
    else toast.success('Número de planilla guardado')
    setGuardandoPlanilla(false)
  }

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
            <span className="text-base shrink-0">✍️</span>
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
          <span className="text-xl flex-shrink-0">🔒</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Periodo histórico — solo lectura</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Este periodo fue procesado antes de la digitalización del sistema y no puede ser modificado.
              {periodo?.historico_nota ? ` ${periodo.historico_nota}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Past-month lock banner (contratista only) ────────── */}
      {periodoVencido && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">📅</span>
          <div>
            <p className="text-sm font-semibold text-orange-800">Periodo cerrado para envío</p>
            <p className="text-xs text-orange-700 mt-0.5">
              El plazo para enviar el informe de <strong>{periodo.mes} {periodo.anio}</strong> ya venció.
              Solo puedes enviar el informe del mes actual. Si tienes alguna inquietud, contacta a tu supervisor.
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
                      active
                        ? 'text-gray-900'
                        : done
                          ? 'text-emerald-600 hidden sm:block'
                          : 'text-gray-400 hidden sm:block'
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
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">🏥</div>
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
                📁 Radicado No. {periodo.numero_radicado}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Admin: Devoluciones forzadas ── */}
      {usuario?.rol === 'admin' && periodo.estado !== 'borrador' && (
        <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">⚙️</span>
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
      {(periodo.estado === 'enviado' || periodo.estado === 'revision' || periodo.estado === 'rechazado') && esAsesor && usuario?.rol !== 'supervisor' && (
        <div className="bg-white rounded-2xl border border-blue-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-base">🔍</div>
            <div>
              <h3 className="font-medium text-gray-900">Revisión como asesor</h3>
              <p className="text-xs text-gray-400">
                {periodo.estado === 'revision'
                  ? 'Has marcado este informe como revisado. Puedes revocar si detectas un problema.'
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

          {/* Planilla pending review notice for asesor */}
          {periodo.planilla_ss_url && periodo.planilla_estado === 'pendiente' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4 flex items-center gap-2">
              <span className="text-base flex-shrink-0">🏥</span>
              <p className="text-xs text-amber-800">
                <strong>Planilla pendiente:</strong> el contratista ha subido la planilla de seguridad social — recuerda revisarla en la sección de documentos.
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
                  {procesando ? 'Procesando...' : periodo.estado === 'rechazado' ? '✓ Aprobar ahora' : '✓ Aprobar'}
                </button>
              )}
              {(periodo.estado === 'enviado' || periodo.estado === 'revision') && (
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

      {/* ── Secretaria panel (approve / reject) ── */}
      {(periodo.estado === 'revision' || periodo.estado === 'enviado') && (esSecretaria || usuario?.rol === 'admin') && usuario?.rol !== 'asesor' && (
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
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
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
                            maxLength={500}
                            className="w-full px-3 py-2.5 bg-white border border-blue-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                          />
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
                            {act.evidencias && act.evidencias.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {act.evidencias.map((ev) => (
                                  <div key={ev.id} className="relative group">
                                    {/* Thumbnail — abre lightbox (con evId para poder eliminar desde ahí) */}
                                    <button
                                      type="button"
                                      onClick={() => setLightbox({ url: ev.url, alt: ev.nombre_archivo, evId: esEditable ? ev.id : undefined })}
                                      className="block focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-xl"
                                      aria-label="Ver imagen ampliada"
                                    >
                                      <img
                                        src={ev.url}
                                        alt={ev.nombre_archivo}
                                        className="w-20 h-20 object-cover rounded-xl border border-gray-200 transition-opacity group-hover:opacity-80"
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

                            {/* In-flight indicator — shown while overlay is up */}
                            {subiendoEvidencia[act.id] != null && (
                              <div className="mb-2 flex items-center gap-2 text-blue-600">
                                <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                <span className="text-xs font-medium">
                                  {(subiendoEvidencia[act.id] ?? 0) > 1
                                    ? `Subiendo ${subiendoEvidencia[act.id]} imágenes...`
                                    : 'Subiendo imagen...'}
                                </span>
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
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Subir imágenes
                                  </span>
                                  <span className="text-[10px] font-normal text-blue-400 leading-tight">hasta 5 a la vez</span>
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
                        maxLength={500}
                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                      />

                      {/* ── Próximamente: Redacción Asistida por IA ── */}
                      <div className="flex justify-end mt-1.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-purple-400 bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-lg select-none cursor-default">
                          ✨ Redacción asistida por IA — <span className="font-semibold">Próximamente</span>
                        </span>
                      </div>

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
              : 'Antes de enviar, adjunta la planilla de seguridad social e ingresa su número.'
            }
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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
                <span className="text-lg shrink-0">🏥</span>

                {/* Clickable label area */}
                <label className="flex-1 min-w-0 cursor-pointer hover:opacity-75 transition-opacity">
                  <p className="text-sm font-medium text-gray-900">Planilla Seguridad Social</p>
                  <p className={`text-xs truncate ${erroresCampos.planilla ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                    {subiendoPlanilla
                      ? 'Subiendo...'
                      : periodo.planilla_ss_url
                        ? '✓ Cargada — clic para reemplazar'
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
                    href={periodo.planilla_ss_url}
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
                inputMode="numeric"
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
            <p className="text-sm text-gray-400">
              {rechazado
                ? 'El asesor recibirá el informe corregido para revisión.'
                : 'Los asesores y la secretaria recibirán este informe para revisión.'
              }
            </p>
            <button
              onClick={handleEnviar}
              disabled={enviando || actividades.length === 0}
              className={`text-white px-6 py-3 rounded-xl font-medium active:scale-[0.98] transition-all disabled:opacity-50 flex-shrink-0 ml-4 ${
                rechazado
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {enviando ? 'Enviando...' : rechazado ? '↩ Reenviar a revisión' : 'Enviar a revisión'}
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
        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📁</span>
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
              const icono = h.estado_nuevo === 'aprobado' ? '✅' :
                            h.estado_nuevo === 'revision' ? '🔍' :
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

          {/* Header + download buttons */}
          <div className="flex items-center justify-between mb-1 gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Documentos del periodo</h3>

            <div className="flex items-center gap-2">
              {/* Descargar Para Secop — solo contratista */}
              {esContratista && (
                puedeDescargarPaquete ? (
                  <a
                    href={`/api/pdf/${periodoId}/secop`}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Para Secop
                  </a>
                ) : (
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 text-xs font-semibold rounded-xl cursor-not-allowed select-none"
                    title="Disponible cuando la secretaria apruebe el periodo"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Paquete
                  </a>
                ) : (
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 text-xs font-semibold rounded-xl cursor-not-allowed select-none"
                    title="Disponible cuando la secretaria apruebe el periodo"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Paquete
                  </div>
                )
              )}
            </div>
          </div>

          {!puedeDescargarPaquete && (
            <p className="text-xs text-amber-600 mb-4">
              {esContratista
                ? 'Los documentos SECOP estarán disponibles cuando la secretaria apruebe tu informe.'
                : 'El paquete completo (documentos firmados) estará disponible cuando la secretaria apruebe.'}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Always available after sending */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <a href={`/api/pdf/${periodoId}/informe`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-lg shrink-0">📝</span>
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

            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <a href={`/api/pdf/${periodoId}/cuenta-cobro`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-lg shrink-0">💰</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Cuenta de Cobro</p>
                  <p className="text-xs text-gray-400">Generado automáticamente</p>
                </div>
              </a>
              <a href={`/api/pdf/${periodoId}/cuenta-cobro?force=1`} target="_blank" rel="noopener noreferrer"
                title="Actualizar documento"
                className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:bg-blue-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </a>
            </div>

            {/* Acta de Supervisión + observación del supervisor */}
            <div className="flex flex-col gap-2">
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-colors ${
                puedeDescargarPaquete ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100'
              }`}>
                <a href={`/api/pdf/${periodoId}/acta-supervision`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-lg shrink-0">📋</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Acta de Supervisión</p>
                    <p className="text-xs text-gray-400">
                      {puedeDescargarPaquete ? '✓ Firmada' : 'Pendiente aprobación'}
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
                <span className="text-lg shrink-0">🧾</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Acta de Pago</p>
                  <p className="text-xs text-gray-400">
                    {puedeDescargarPaquete ? '✓ Firmada' : 'Pendiente aprobación'}
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
                          <span className="text-base">🔢</span>
                          <input
                            value={numPlanilla}
                            onChange={(e) => { setNumPlanilla(e.target.value); setErrorFormatoPlanilla(null) }}
                            placeholder="Ej. 6016087440"
                            inputMode="numeric"
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
                    {esAsesor && !esSecretaria && periodo.planilla_ss_url && (
                      <button
                        onClick={() => handleRevisarPlanilla('aprobada')}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors text-left"
                      >
                        <span className="text-base">✅</span>
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
                    {esAsesor && !esSecretaria && periodo.planilla_ss_url && (
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
                                await handleRevisarPlanilla('rechazada', motivoRechazoInline.trim() || undefined)
                                setMostrarFormRechazo(false)
                                setMotivoRechazoInline('')
                                setRechazandoPlanilla(false)
                              }}
                              disabled={rechazandoPlanilla}
                              className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
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
                          <span className="text-base">❌</span>
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
      {/* Gallery: multiple selection (up to 5). */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0 && uploadTargetId.current) handleSubirEvidencias(uploadTargetId.current, files)
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

      {/* ── Upload overlay ──────────────────────────────────────────────────────
           Conditional render (NOT always-mounted) — a permanently rendered
           backdrop-filter element covering the full viewport causes GPU
           compositing issues in some browsers even at opacity:0, making
           page content appear blank. Only mount when actually uploading.
           Entry animation via globals.css keyframes (overlay-fade-in / card-scale-in).
        ──────────────────────────────────────────────────────────────────── */}
      {(() => {
        const totalEvidencias: number = Object.values(subiendoEvidencia).reduce((s: number, v) => s + (v ?? 0), 0)
        const isUploading = totalEvidencias > 0 || subiendoPlanilla
        if (!isUploading) return null

        const esPlanilla = subiendoPlanilla

        // M-1: aggregate byte progress across all uploading activities (0-100)
        const activeIds = Object.keys(subiendoEvidencia).filter(k => subiendoEvidencia[k] != null)
        const progresoTotal = activeIds.length > 0
          ? Math.round(activeIds.reduce((sum, k) => sum + (progresoEvidencia[k] ?? 0), 0) / activeIds.length)
          : 0

        const label = esPlanilla
          ? 'Subiendo planilla...'
          : totalEvidencias > 1
            ? `Subiendo ${totalEvidencias} imágenes...`
            : 'Subiendo imagen...'

        // SVG circle metrics
        const R = 40
        const CIRCUNFERENCIA = 2 * Math.PI * R // ≈ 251.33

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm upload-overlay-enter">
            <div className="bg-white rounded-3xl px-10 py-8 flex flex-col items-center gap-5 shadow-2xl mx-6 w-full max-w-xs upload-card-enter">

              <div className="relative w-24 h-24">
                {/* Static track ring */}
                <svg className="absolute inset-0 w-24 h-24" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
                </svg>

                {esPlanilla ? (
                  /* Planilla: indeterminate spinning arc (no byte-level progress available) */
                  <div className="absolute inset-0 -rotate-90">
                    <div className="w-full h-full animate-spin" style={{ animationDuration: '1.1s', animationTimingFunction: 'linear' }}>
                      <svg className="w-24 h-24" viewBox="0 0 96 96">
                        <circle cx="48" cy="48" r={R} fill="none" stroke="#2563eb" strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={`${CIRCUNFERENCIA * 0.28} ${CIRCUNFERENCIA * 0.72}`}
                        />
                      </svg>
                    </div>
                  </div>
                ) : (
                  /* Evidencias: determinate progress arc — grows from 0 → 100% (M-1) */
                  <div className="absolute inset-0 -rotate-90">
                    <svg className="w-24 h-24" viewBox="0 0 96 96">
                      <circle
                        cx="48" cy="48" r={R}
                        fill="none" stroke="#2563eb" strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={CIRCUNFERENCIA}
                        strokeDashoffset={CIRCUNFERENCIA * (1 - progresoTotal / 100)}
                        style={{ transition: 'stroke-dashoffset 0.2s ease' }}
                      />
                    </svg>
                  </div>
                )}

                {/* Center content */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {esPlanilla ? (
                    <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  ) : (
                    /* M-1: show real percentage instead of a static icon */
                    <span className="text-xl font-bold text-blue-600 tabular-nums">{progresoTotal}%</span>
                  )}
                </div>
              </div>

              {/* Text */}
              <div className="text-center">
                <p className="text-base font-semibold text-gray-800">{label}</p>
                <p className="text-sm text-gray-400 mt-1 animate-pulse">Por favor espera</p>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
