'use server'

/**
 * Server Actions: anexos PDF del Informe de Actividades.
 *
 * Sigue el mismo patrón de subida que las evidencias (URL prefirmada + PUT
 * directo del navegador a Storage), porque subir un archivo de varios MB a
 * través de una Server Action agota el tiempo de la función en Vercel.
 *
 * Diferencia importante frente a evidencias: aquí hay una verificación
 * POSTERIOR a la subida (`registrarAdjunto`), donde se descarga el archivo ya
 * almacenado y se comprueba su contenido real. La validación previa se basa en
 * lo que declara el navegador, que el cliente controla; la posterior no.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { firmarUrl, descargarObjeto } from '@/lib/storage-firmado'
import { invalidarCachePDF } from '@/lib/pdf/cache'
import { ESTADOS_EDITABLES } from '@/lib/constants'
import {
  validarPDF, ADJUNTO_MAX_BYTES, ADJUNTO_MAX_TOTAL_BYTES,
} from '@/lib/pdf-validacion'
import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

const BUCKET = 'adjuntos'

export interface AdjuntoDTO {
  id: string
  nombre_original: string
  bytes: number
  paginas: number | null
  orden: number
  estado: string
  verificacion_nota: string | null
  created_at: string
  /** Actividad (y por tanto obligación) a la que soporta este documento. */
  actividad_id: string | null
  /** URL firmada, consumida por el visor integrado. */
  urlFirmada?: string
}

/**
 * Renumera los anexos del periodo siguiendo el ORDEN DE LECTURA del informe:
 * obligación, luego actividad, luego antigüedad de carga.
 *
 * Sin esto, el número de anexo dependía del orden en que el contratista subió
 * los archivos, así que la primera actividad del informe podía remitir al
 * "Anexo 3" — justo la ambigüedad que la referencia cruzada busca eliminar.
 *
 * `orden` queda siendo LA fuente de verdad del número de anexo: lo leen tanto
 * el informe generado como la pantalla del periodo, sin recalcularlo cada uno
 * por su cuenta.
 */
async function renumerarAnexos(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  periodoId: string,
) {
  const { data: filas } = await admin
    .from('documentos_adjuntos')
    .select('id, orden, created_at, actividad:actividades(orden, obligacion:obligaciones(orden))')
    .eq('entidad_tipo', 'periodo')
    .eq('entidad_id', periodoId)
    .is('eliminado_at', null)

  if (!filas?.length) return

  // Supabase devuelve las relaciones anidadas como objeto o como array de uno
  // según cómo infiera la cardinalidad; se normaliza antes de ordenar.
  const primero = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v

  const clave = (f: any) => {
    const act = primero<any>(f.actividad)
    const obl = act ? primero<any>(act.obligacion) : null
    // Un anexo sin actividad (previo a la migración 034) va al final, no en medio.
    return [
      obl?.orden ?? Number.MAX_SAFE_INTEGER,
      act?.orden ?? Number.MAX_SAFE_INTEGER,
      f.created_at ?? '',
    ] as const
  }

  const ordenadas = [...filas].sort((a, b) => {
    const ka = clave(a), kb = clave(b)
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1
      if (ka[i] > kb[i]) return 1
    }
    return 0
  })

  await Promise.all(
    ordenadas.flatMap((f: any, i) =>
      f.orden === i + 1
        ? []                                  // ya está en su sitio
        : [admin.from('documentos_adjuntos').update({ orden: i + 1 }).eq('id', f.id)],
    ),
  )
}

/**
 * Comprueba que el usuario puede modificar los anexos de este periodo.
 * Solo el contratista dueño (o admin) y solo mientras el periodo esté en un
 * estado editable — que es justo lo que garantiza que un anexo nunca cambie
 * después de que el informe queda sellado con su código QR.
 */
async function verificarPermisoEdicion(periodoId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' as const }

  const admin = createAdminSupabaseClient()
  const { data: periodo } = await admin
    .from('periodos')
    .select('id, estado, es_historico, contrato:contratos(contratista_id, municipio_id)')
    .eq('id', periodoId)
    .single()

  if (!periodo) return { error: 'Periodo no encontrado' as const }
  if ((periodo as any).es_historico) return { error: 'No se puede modificar un periodo histórico' as const }

  if (!ESTADOS_EDITABLES.includes((periodo as any).estado)) {
    return { error: `No se pueden modificar los anexos: el periodo está en estado "${(periodo as any).estado}"` as const }
  }

  const { data: usuario } = await admin.from('usuarios').select('rol').eq('id', user.id).single()
  const contrato = (periodo as any).contrato as { contratista_id: string; municipio_id: string } | null

  const esDueno = contrato?.contratista_id === user.id
  const esAdmin = usuario?.rol === 'admin'
  if (!esDueno && !esAdmin) return { error: 'No tienes permiso para modificar los anexos de este periodo' as const }

  return { userId: user.id, municipioId: contrato?.municipio_id ?? null }
}

// ── Paso 1: URL prefirmada ───────────────────────────────────────────────────

export async function prepararUploadAdjunto(
  periodoId: string,
  fileName: string,
  fileSize: number,
  actividadId: string,
): Promise<ActionResult<{ signedUrl: string; path: string }>> {
  try {
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return { error: 'Solo se permiten archivos PDF.' }
    }
    if (fileSize > ADJUNTO_MAX_BYTES) {
      return { error: `El archivo supera el máximo de ${Math.round(ADJUNTO_MAX_BYTES / 1024 / 1024)} MB.` }
    }

    const permiso = await verificarPermisoEdicion(periodoId)
    if ('error' in permiso) return { error: permiso.error }

    const admin = createAdminSupabaseClient()

    // La actividad debe pertenecer a este periodo: impide que un actividadId
    // manipulado cuelgue un documento de la obligación de otro contrato.
    const { data: actividad } = await admin
      .from('actividades')
      .select('id')
      .eq('id', actividadId)
      .eq('periodo_id', periodoId)
      .single()
    if (!actividad) return { error: 'La actividad no pertenece a este periodo' }

    // Tope acumulado por periodo: protege la memoria de la función que fusiona
    // los anexos al generar el informe.
    const { data: existentes } = await admin
      .from('documentos_adjuntos')
      .select('bytes')
      .eq('entidad_tipo', 'periodo')
      .eq('entidad_id', periodoId)
      .is('eliminado_at', null)

    const totalActual = (existentes ?? []).reduce((s, a) => s + Number(a.bytes ?? 0), 0)
    if (totalActual + fileSize > ADJUNTO_MAX_TOTAL_BYTES) {
      const libreMB = Math.max(0, Math.round((ADJUNTO_MAX_TOTAL_BYTES - totalActual) / 1024 / 1024))
      return { error: `Espacio insuficiente para anexos en este periodo. Disponible: ${libreMB} MB.` }
    }

    const path = `${periodoId}/${Date.now()}.pdf`
    const { data: signed, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: false })

    if (error || !signed) return { error: 'No se pudo preparar la subida. Intenta de nuevo.' }

    return { data: { signedUrl: signed.signedUrl, path } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ── Paso 2: registro + verificación real del contenido ───────────────────────

export async function registrarAdjunto(
  periodoId: string,
  storagePath: string,
  nombreOriginal: string,
  actividadId: string,
): Promise<ActionResult<AdjuntoDTO>> {
  const admin = createAdminSupabaseClient()

  try {
    const permiso = await verificarPermisoEdicion(periodoId)
    if ('error' in permiso) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
      return { error: permiso.error }
    }

    // La ruta se deriva del periodoId, así que un storagePath falsificado que
    // apunte a otro periodo se rechaza aquí.
    if (!storagePath.startsWith(`${periodoId}/`)) {
      return { error: 'Ruta de archivo inválida.' }
    }

    // ── Verificación del contenido REAL (no del MIME declarado) ──────────────
    const { data: blob, error: dlError } = await admin.storage.from(BUCKET).download(storagePath)
    if (dlError || !blob) {
      return { error: 'No se encontró el archivo subido. Intenta de nuevo.' }
    }
    const buf = Buffer.from(await blob.arrayBuffer())

    const validacion = await validarPDF(buf)
    if (!validacion.ok) {
      // Archivo inválido → se elimina del almacenamiento, no se deja basura.
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
      return { error: validacion.error ?? 'PDF inválido.' }
    }

    const sha256 = createHash('sha256').update(buf).digest('hex')

    // Orden = siguiente número de anexo, según orden de carga.
    const { data: previos } = await admin
      .from('documentos_adjuntos')
      .select('orden')
      .eq('entidad_tipo', 'periodo')
      .eq('entidad_id', periodoId)
      .is('eliminado_at', null)
      .order('orden', { ascending: false })
      .limit(1)

    const orden = (previos?.[0]?.orden ?? 0) + 1

    const { data: fila, error: insErr } = await admin
      .from('documentos_adjuntos')
      .insert({
        entidad_tipo: 'periodo',
        entidad_id: periodoId,
        actividad_id: actividadId,
        municipio_id: permiso.municipioId,
        storage_path: storagePath,
        nombre_original: nombreOriginal.slice(0, 200),
        bytes: buf.length,
        sha256,
        paginas: validacion.paginas ?? null,
        orden,
        // Sin antivirus todavía: el PDF quedó verificado estructuralmente
        // (firma binaria, no cifrado, legible). Cuando se añada el análisis
        // antivirus, este estado pasa a 'pendiente' hasta que el worker lo marque.
        estado: 'limpio',
        verificado_at: new Date().toISOString(),
        subido_por: permiso.userId,
      })
      .select('id, nombre_original, bytes, paginas, orden, estado, verificacion_nota, created_at, actividad_id')
      .single()

    if (insErr || !fila) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
      return { error: `No se pudo registrar el anexo: ${insErr?.message ?? 'error desconocido'}` }
    }

    // El número definitivo depende de la posición de la actividad en el informe,
    // no del momento de la carga: se recalcula y se relee para devolver al
    // cliente el mismo "Anexo N" que va a imprimirse en el documento.
    await renumerarAnexos(admin, periodoId)
    const { data: renumerada } = await admin
      .from('documentos_adjuntos')
      .select('orden')
      .eq('id', (fila as { id: string }).id)
      .single()

    // El informe cambia al añadir un anexo → invalidar su PDF cacheado.
    await invalidarCachePDF(admin, periodoId).catch(() => {})
    revalidatePath(`/dashboard/contratos`, 'layout')

    const urlFirmada = await firmarUrl(BUCKET, storagePath) ?? undefined
    return { data: { ...(fila as any), orden: renumerada?.orden ?? orden, urlFirmada } }
  } catch (e: unknown) {
    await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return { error: e instanceof Error ? e.message : 'Error inesperado al registrar el anexo' }
  }
}

// ── Listado ──────────────────────────────────────────────────────────────────

export async function listarAdjuntos(periodoId: string): Promise<AdjuntoDTO[]> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Lectura con la sesión del usuario para que RLS decida la visibilidad.
    const { data } = await supabase
      .from('documentos_adjuntos')
      .select('id, nombre_original, bytes, paginas, orden, estado, verificacion_nota, created_at, actividad_id, storage_path')
      .eq('entidad_tipo', 'periodo')
      .eq('entidad_id', periodoId)
      .is('eliminado_at', null)
      .order('orden', { ascending: true })

    const filas = (data ?? []) as Array<AdjuntoDTO & { storage_path: string }>
    if (!filas.length) return []

    // Firmar todas las rutas en un solo lote.
    const firmadas = await Promise.all(
      filas.map(async f => ({ ...f, urlFirmada: (await firmarUrl(BUCKET, f.storage_path)) ?? undefined })),
    )
    return firmadas.map(({ storage_path, ...resto }) => resto)
  } catch {
    return []
  }
}

// ── Eliminación (lógica) ─────────────────────────────────────────────────────

export async function eliminarAdjunto(periodoId: string, adjuntoId: string): Promise<ActionResult> {
  try {
    const permiso = await verificarPermisoEdicion(periodoId)
    if ('error' in permiso) return { error: permiso.error }

    const admin = createAdminSupabaseClient()

    // Borrado lógico: conserva la traza de que el soporte existió, requisito
    // razonable frente a un ente de control. El objeto en Storage se purga
    // aparte según política de retención, no aquí.
    const { error } = await admin
      .from('documentos_adjuntos')
      .update({ eliminado_at: new Date().toISOString() })
      .eq('id', adjuntoId)
      .eq('entidad_id', periodoId)
      .is('eliminado_at', null)

    if (error) return { error: `No se pudo eliminar el anexo: ${error.message}` }

    // Renumerar los anexos restantes para que la secuencia siga siendo 1..N
    // sin huecos — "Anexo 3" con solo dos anexos sería confuso en el informe.
    await renumerarAnexos(admin, periodoId)

    await invalidarCachePDF(admin, periodoId).catch(() => {})
    revalidatePath(`/dashboard/contratos`, 'layout')
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
