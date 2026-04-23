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
  actualizarNumeroRadicado,
  subirPlanilla,
  eliminarPlanilla,
  guardarNumeroPlanilla,
  revisarPlanilla,
  actualizarObservacionSupervisor,
} from '@/app/actions/periodos'
import { validarNumeroPlanilla } from '@/lib/validaciones'
import { prepararUploadEvidencia, registrarEvidencia, eliminarEvidencia } from '@/app/actions/evidencias'
// import { mejorarDescripcion } from '@/app/actions/ia'  // Próximamente

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
  const [editandoRadicado, setEditandoRadicado] = useState(false)
  const [numRadicadoEdit, setNumRadicadoEdit] = useState('')
  const [guardandoRadicado, setGuardandoRadicado] = useState(false)

  // Upload progress state per activity (null = idle, 0-100 = uploading)
  const [subiendoEvidencia, setSubiendoEvidencia] = useState<Record<string, number | null>>({})
  // Pending DB registration: file uploaded to Storage but registrarEvidencia failed.
  // Stored so the user can retry step 3 without re-uploading the file.
  const [pendienteRegistro, setPendienteRegistro] = useState<Record<string, { publicUrl: string; nombre: string } | null>>({})

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

  // Lightbox — ampliar imagen de evidencia
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null)

  // Inline planilla validation (submit section)
  const [erroresCampos, setErroresCampos] = useState({ planilla: false, numero: false })
  const [errorFormatoPlanilla, setErrorFormatoPlanilla] = useState<string | null>(null)
  const seccionEnvioRef = useRef<HTMLDivElement>(null)

  // Scroll anchors for rejection guidance
  const seccionActividadesRef = useRef<HTMLDivElement>(null)

  const cargarDatos = useCallback(async (silencioso = false) => {
    const datos = await getPeriodoConContrato(periodoId, contratoId)
    setContrato(datos.contrato)
    setPeriodo(datos.periodo)
    setObligaciones(datos.obligaciones)
    setActividades(datos.actividades)
    if (datos.periodo?.numero_planilla) setNumPlanilla(datos.periodo.numero_planilla)
    if (!silencioso) setCargando(false)
  }, [periodoId, contratoId])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  // Background polling every 30s — contratista sees estado changes without manual refresh
  useEffect(() => {
    const timer = setInterval(() => cargarDatos(true), 30_000)
    return () => clearInterval(timer)
  }, [cargarDatos])

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
      cargarDatos()
    }
    setGuardando(false)
  }


  async function handleEliminarActividad(actId: string) {
    const result = await eliminarActividad(actId)
    if (result.error) toast.error(result.error)
    else { toast.success('Actividad eliminada'); cargarDatos() }
  }

  // Compress evidence image before upload: max 1200×900, JPEG 75%
  // PDFs are passed through unchanged. All images (including HEIC/HEIF from iPhone
  // and files with missing MIME types from Android) are converted to JPEG so that
  // browsers and react-pdf can render them reliably.
  async function comprimirEvidencia(file: File): Promise<File> {
    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tiff']
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const isHeic = ext === 'heic' || ext === 'heif'
      || file.type === 'image/heic' || file.type === 'image/heif'
    const looksLikeImage = file.type.startsWith('image/') || IMAGE_EXTS.includes(ext)
    if (!looksLikeImage) return file   // PDF or unknown — pass through unchanged

    // HEIC/HEIF: convert to JPEG blob first using heic2any, then compress via canvas
    let sourceFile: File = file
    if (isHeic) {
      try {
        const heic2any = (await import('heic2any')).default
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
        const blob = Array.isArray(converted) ? converted[0] : converted
        const name = file.name.replace(/\.[^.]+$/, '.jpg')
        sourceFile = new File([blob], name, { type: 'image/jpeg' })
      } catch {
        // heic2any failed — fall through and let canvas try (Safari handles HEIC natively)
        sourceFile = file
      }
    }

    return new Promise((resolve) => {
      const img = new Image()
      const objUrl = URL.createObjectURL(sourceFile)
      img.onload = () => {
        URL.revokeObjectURL(objUrl)
        const MAX_W = 1200, MAX_H = 900
        let w = img.naturalWidth, h = img.naturalHeight
        const ratio = Math.min(MAX_W / w, MAX_H / h, 1) // never upscale
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const name = sourceFile.name.replace(/\.[^.]+$/, '.jpg')
              resolve(new File([blob], name, { type: 'image/jpeg' }))
            } else {
              resolve(sourceFile)
            }
          },
          'image/jpeg',
          0.75
        )
      }
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(sourceFile) }
      img.src = objUrl
    })
  }

  async function handleSubirEvidencia(actividadId: string, file: File) {
    // ── Step 0: compress image client-side ────────────────────
    const fileToUpload = await comprimirEvidencia(file)

    // ── Step 1: server-side validation + get presigned URL ────
    setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: 0 }))

    const prep = await prepararUploadEvidencia(
      actividadId,
      periodoId,
      fileToUpload.name,
      fileToUpload.size,
      fileToUpload.type,
    )

    if (prep.error || !prep.data) {
      toast.error(prep.error ?? 'Error al preparar la subida')
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
      return
    }

    const { signedUrl, publicUrl } = prep.data

    // ── Step 2: upload DIRECTLY to Supabase (browser → Supabase, no Vercel) ──
    // Using XHR so we get real upload.onprogress events (0→95%).
    // Normalize MIME: Android devices sometimes set type="" or "application/octet-stream"
    // for images. Always upload as image/jpeg when the type is not a recognized image type.
    const mime = fileToUpload.type.startsWith('image/') ? fileToUpload.type : 'image/jpeg'
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 95)
            setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: pct }))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Error al subir: ${xhr.status} ${xhr.statusText}`))
        }
        xhr.onerror = () => reject(new Error('Error de red al subir la imagen'))
        xhr.open('PUT', signedUrl)
        xhr.setRequestHeader('Content-Type', mime)
        xhr.send(fileToUpload)
      })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al subir la imagen')
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
      return
    }

    // ── Step 3: register DB record ─────────────────────────────
    // The file is already in Supabase Storage. If this step fails (network drop,
    // transient error), we store the pending registration so the user can retry
    // without re-uploading the entire file.
    const reg = await registrarEvidencia(actividadId, periodoId, publicUrl, fileToUpload.name)

    if (reg.error) {
      setPendienteRegistro(prev => ({ ...prev, [actividadId]: { publicUrl, nombre: file.name } }))
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
      toast.error('La imagen se subió pero no se pudo registrar. Toca "Reintentar" para completar.', { duration: 8000 })
      return
    }

    setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: 100 }))
    toast.success('Evidencia subida ✓')
    setTimeout(() => {
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
      cargarDatos()
    }, 600)
  }

  async function handleEliminarEvidencia(evId: string) {
    const result = await eliminarEvidencia(evId)
    if (result.error) toast.error(result.error)
    else { toast.success('Evidencia eliminada'); cargarDatos() }
  }

  async function handleReintentarRegistro(actividadId: string) {
    const pending = pendienteRegistro[actividadId]
    if (!pending) return
    setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: 98 }))
    const reg = await registrarEvidencia(actividadId, periodoId, pending.publicUrl, pending.nombre)
    if (reg.error) {
      toast.error(`Reintento fallido: ${reg.error}`)
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
    } else {
      setPendienteRegistro(prev => ({ ...prev, [actividadId]: null }))
      setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: 100 }))
      toast.success('Evidencia registrada ✓')
      setTimeout(() => {
        setSubiendoEvidencia(prev => ({ ...prev, [actividadId]: null }))
        cargarDatos()
      }, 600)
    }
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

  if (cargando) return <p className="text-gray-500">Cargando periodo...</p>
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

      {/* ── Rejection guidance card (contratista only) ─────────── */}
      {rechazado && esContratista && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">↩️</div>
            <div>
              <p className="text-sm font-bold text-red-800">Tu informe fue devuelto — necesita corrección</p>
              {periodo.motivo_rechazo ? (
                <div className="mt-1.5 bg-white border border-red-200 rounded-xl px-3 py-2">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">El asesor indicó:</p>
                  <p className="text-sm text-red-700 italic">"{periodo.motivo_rechazo}"</p>
                </div>
              ) : (
                <p className="text-xs text-red-600 mt-1">Revisa tus actividades y vuelve a enviar el informe.</p>
              )}
            </div>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-red-100 px-4 py-3 flex items-start gap-3">
              <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-xs font-semibold text-gray-800">Corrige tus actividades</p>
                <p className="text-xs text-gray-500 mt-0.5">Edita, elimina o agrega actividades teniendo en cuenta el motivo.</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-red-100 px-4 py-3 flex items-start gap-3">
              <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-xs font-semibold text-gray-800">Reenvía el informe</p>
                <p className="text-xs text-gray-500 mt-0.5">Cuando hayas corregido, usa el botón al final de la página.</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => seccionActividadesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Ir a mis actividades
          </button>
        </div>
      )}

      {/* ── Planilla rejection banner (contratista only) ─────────── */}
      {periodo.planilla_estado === 'rechazada' && esContratista && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">🏥</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800">Tu planilla de seguridad social fue rechazada</p>
              {periodo.planilla_comentario ? (
                <div className="mt-1.5 bg-white border border-red-200 rounded-xl px-3 py-2">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">El asesor indicó:</p>
                  <p className="text-sm text-red-700 italic">"{periodo.planilla_comentario}"</p>
                </div>
              ) : (
                <p className="text-xs text-red-600 mt-1">Debes subir una nueva planilla correcta para continuar.</p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Ve a la sección <strong>Documentos del periodo</strong> → <em>Planilla de Seguridad Social</em> → <em>Reemplazar planilla</em>.
              </p>
            </div>
          </div>
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
                                {/* Thumbnail — clicable para abrir lightbox */}
                                <button
                                  type="button"
                                  onClick={() => setLightbox({ url: ev.url, alt: ev.nombre_archivo })}
                                  className="block focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-lg"
                                  title="Ver imagen ampliada"
                                >
                                  <img
                                    src={ev.url}
                                    alt={ev.nombre_archivo}
                                    className="w-20 h-20 object-cover rounded-lg border transition-opacity group-hover:opacity-85"
                                  />
                                  {/* Ícono lupa — indicador visual de zoom */}
                                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <svg className="w-6 h-6 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm0 0l.01.01" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 8v6M8 11h6" />
                                    </svg>
                                  </span>
                                </button>
                                {/* Botón eliminar — stopPropagation para no abrir el lightbox */}
                                {esEditable && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleEliminarEvidencia(ev.id) }}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity flex items-center justify-center z-10"
                                  >
                                    ✕
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

                        {/* Upload progress bar */}
                        {subiendoEvidencia[act.id] !== null && subiendoEvidencia[act.id] !== undefined && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-blue-600 font-medium">Subiendo imagen...</span>
                              <span className="text-xs text-blue-400">{subiendoEvidencia[act.id]}%</span>
                            </div>
                            <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-blue-500 h-1.5 rounded-full transition-all duration-150 ease-out"
                                style={{ width: `${subiendoEvidencia[act.id]}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {esEditable && subiendoEvidencia[act.id] == null && (
                          <div className="flex flex-wrap items-center gap-3">
                            {/* Gallery — opens the device photo library */}
                            <button
                              type="button"
                              onClick={() => {
                                uploadTargetId.current = act.id
                                galleryInputRef.current?.click()
                              }}
                              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 cursor-pointer bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Subir imagen
                            </button>
                            {/* Camera — directly opens the rear camera */}
                            <button
                              type="button"
                              onClick={() => {
                                uploadTargetId.current = act.id
                                cameraInputRef.current?.click()
                              }}
                              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 cursor-pointer bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              Tomar foto
                            </button>
                          </div>
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
              <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                erroresCampos.planilla
                  ? 'bg-red-50 border-red-400'
                  : periodo.planilla_ss_url
                    ? 'bg-green-50 border-green-200 hover:bg-green-100'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}>
                <span className="text-lg">🏥</span>
                <div className="flex-1 min-w-0">
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
                </div>
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

          {/* Header + Descargar Paquete button */}
          <div className="flex items-center justify-between mb-1 gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Documentos del periodo</h3>

            {/* Only asesores and secretaria see this button */}
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
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 text-xs font-semibold rounded-xl cursor-not-allowed select-none" title="Disponible cuando la secretaria apruebe el periodo">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Descargar Paquete
                </div>
              )
            )}
          </div>

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

            {/* Acta de Supervisión + observación del supervisor */}
            <div className="flex flex-col gap-2">
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada"
        >
          <div
            className="relative max-w-4xl w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botón cerrar */}
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors p-1"
              aria-label="Cerrar"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Imagen ampliada */}
            <img
              src={lightbox.url}
              alt={lightbox.alt}
              className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl"
            />

            {/* Nombre del archivo */}
            <p className="mt-2 text-white/50 text-xs text-center truncate max-w-full px-2">
              {lightbox.alt}
            </p>
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
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploadTargetId.current) handleSubirEvidencia(uploadTargetId.current, file)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploadTargetId.current) handleSubirEvidencia(uploadTargetId.current, file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
