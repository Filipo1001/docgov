'use server'

/**
 * Server Actions: Evidence file upload (presigned URL pattern)
 *
 * Why presigned URLs instead of streaming through the Server Action:
 * - Vercel serverless functions have a 10s timeout on the hobby plan.
 * - Uploading a 3-8 MB phone photo via `file.arrayBuffer()` + supabase.storage.upload()
 *   inside a Server Action consistently exceeds that limit, leaving the client
 *   stuck at ~80% with a fake progress bar that never resolves.
 *
 * New flow:
 *   1. prepararUploadEvidencia() — validates auth/period/file, returns a signed upload URL
 *   2. Client uploads the file DIRECTLY to Supabase Storage via XHR (no Vercel involved)
 *   3. registrarEvidencia()    — inserts the DB record once the upload succeeds
 *
 * Security is preserved: all checks (auth, period state, activity ownership,
 * file type, file size) still happen server-side in step 1.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { FILE_UPLOAD, ESTADOS_EDITABLES } from '@/lib/constants'
import type { ActionResult } from '@/lib/types'

// ── Extension → MIME fallback ────────────────────────────────────────────────
// Some mobile cameras (Android WebViews, Samsung/Xiaomi ROMs) send an empty or
// non-standard file.type.  Fall back to extension-based detection in that case.
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
}

// ── Step 1 ───────────────────────────────────────────────────────────────────

/**
 * Validate the upload request and return a short-lived signed upload URL.
 * The client will PUT the file directly to that URL (browser → Supabase),
 * completely bypassing Vercel and its function timeout.
 */
export async function prepararUploadEvidencia(
  actividadId: string,
  periodoId: string,
  fileName: string,
  fileSize: number,
  fileMime: string,
): Promise<ActionResult<{ signedUrl: string; path: string; publicUrl: string }>> {
  try {
    const fileExt = fileName.split('.').pop()?.toLowerCase() ?? ''
    const effectiveMime = fileMime?.toLowerCase() || EXT_TO_MIME[fileExt] || ''

    // ── File type validation ──────────────────────────────────
    const tiposPermitidos: readonly string[] = FILE_UPLOAD.TIPOS_IMAGEN
    if (!tiposPermitidos.includes(effectiveMime)) {
      return {
        error: `Tipo de archivo no permitido. Solo se aceptan: JPG, PNG, WebP, HEIC`,
      }
    }

    // ── File size validation ──────────────────────────────────
    if (fileSize > FILE_UPLOAD.TAMANO_MAX_BYTES) {
      return {
        error: `El archivo supera el tamaño máximo de ${FILE_UPLOAD.TAMANO_MAX_LABEL}`,
      }
    }

    const supabase = await createServerSupabaseClient()

    // ── Auth check ────────────────────────────────────────────
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No autorizado' }

    // ── Period editability check ──────────────────────────────
    const { data: periodo } = await supabase
      .from('periodos')
      .select('estado, es_historico, mes, anio')
      .eq('id', periodoId)
      .single()

    if (!periodo) return { error: 'Periodo no encontrado' }

    if (periodo.es_historico) {
      return { error: 'No se puede subir evidencia a un periodo histórico' }
    }

    if (!ESTADOS_EDITABLES.includes(periodo.estado as never)) {
      return {
        error: `No se puede subir evidencia: el periodo está en estado "${periodo.estado}"`,
      }
    }

    // Block evidence upload on past months for non-admin contratistas
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      const { data: usuarioData } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('id', authUser.id)
        .single()

      if (usuarioData?.rol === 'contratista') {
        const MES_IDX: Record<string, number> = {
          ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3,
          MAYO: 4, JUNIO: 5, JULIO: 6, AGOSTO: 7,
          SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
        }
        const now = new Date()
        const mesIdx = MES_IDX[(periodo.mes as string).toUpperCase()] ?? -1
        const vencido = periodo.estado !== 'rechazado' && (
          (periodo.anio as number) < now.getFullYear() ||
          ((periodo.anio as number) === now.getFullYear() && mesIdx < now.getMonth())
        )
        if (vencido) {
          return { error: 'No se puede subir evidencia a un periodo de meses anteriores.' }
        }
      }
    }

    // ── Verify activity belongs to this period ────────────────
    const { data: actividad } = await supabase
      .from('actividades')
      .select('id')
      .eq('id', actividadId)
      .eq('periodo_id', periodoId)
      .single()

    if (!actividad) {
      return { error: 'La actividad no pertenece a este periodo' }
    }

    // ── Issue a presigned upload URL (valid for 60 s) ─────────
    const path = `evidencias/${periodoId}/${actividadId}/${Date.now()}.${fileExt || 'jpg'}`

    const { data: signedData, error: signedError } = await supabase.storage
      .from('evidencias')
      .createSignedUploadUrl(path)

    if (signedError || !signedData) {
      return { error: `Error al preparar la subida: ${signedError?.message}` }
    }

    const { data: urlData } = supabase.storage.from('evidencias').getPublicUrl(path)

    return {
      data: {
        signedUrl: signedData.signedUrl,
        path,
        publicUrl: urlData.publicUrl,
      },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al preparar la subida' }
  }
}

// ── Step 2 ───────────────────────────────────────────────────────────────────

/**
 * Register the evidence record in the DB.
 * Called by the client AFTER it has successfully uploaded the file directly
 * to Supabase Storage via the presigned URL obtained in step 1.
 */
export async function registrarEvidencia(
  actividadId: string,
  periodoId: string,
  publicUrl: string,
  nombreArchivo: string,
): Promise<ActionResult<{ url: string; nombre: string }>> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No autorizado' }

    // Re-verify activity ownership so a forged publicUrl can't inject records
    // into another user's period.
    const { data: actividad } = await supabase
      .from('actividades')
      .select('id')
      .eq('id', actividadId)
      .eq('periodo_id', periodoId)
      .single()

    if (!actividad) return { error: 'La actividad no pertenece a este periodo' }

    const { error: insertError } = await supabase
      .from('evidencias')
      .insert({
        actividad_id: actividadId,
        url: publicUrl,
        nombre_archivo: nombreArchivo,
      })

    if (insertError) {
      return { error: `Error al registrar la evidencia: ${insertError.message}` }
    }

    return { data: { url: publicUrl, nombre: nombreArchivo } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al registrar evidencia' }
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function eliminarEvidencia(evidenciaId: string): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No autorizado' }

    const { data: evidencia } = await supabase
      .from('evidencias')
      .select('id, actividad:actividades(periodo_id, periodo:periodos(estado))')
      .eq('id', evidenciaId)
      .single()

    if (!evidencia) return { error: 'Evidencia no encontrada' }

    const { error } = await supabase
      .from('evidencias')
      .delete()
      .eq('id', evidenciaId)

    if (error) return { error: `Error al eliminar: ${error.message}` }

    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
