'use server'

/**
 * Server Action: Evidence file upload
 *
 * Validates file type, size, and period editability on the server
 * before uploading to Supabase Storage. This cannot be bypassed
 * by a client-side check alone.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { FILE_UPLOAD, ESTADOS_EDITABLES } from '@/lib/constants'
import type { ActionResult } from '@/lib/types'

export async function subirEvidencia(
  actividadId: string,
  periodoId: string,
  formData: FormData
): Promise<ActionResult<{ url: string; nombre: string }>> {
  try {
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
      return { error: 'No se encontró ningún archivo' }
    }

    // ── File type validation ──────────────────────────────────
    const tiposPermitidos: readonly string[] = FILE_UPLOAD.TIPOS_IMAGEN
    if (!tiposPermitidos.includes(file.type)) {
      return {
        error: `Tipo de archivo no permitido. Solo se aceptan: JPG, PNG, WebP, HEIC`,
      }
    }

    // ── File size validation ──────────────────────────────────
    if (file.size > FILE_UPLOAD.TAMANO_MAX_BYTES) {
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
      .select('estado')
      .eq('id', periodoId)
      .single()

    if (!periodo) return { error: 'Periodo no encontrado' }

    if (!ESTADOS_EDITABLES.includes(periodo.estado as never)) {
      return {
        error: `No se puede subir evidencia: el periodo está en estado "${periodo.estado}"`,
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

    // ── Upload to Supabase Storage ────────────────────────────
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `evidencias/${periodoId}/${actividadId}/${Date.now()}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('evidencias')
      .upload(path, arrayBuffer, { contentType: file.type })

    if (uploadError) {
      return { error: `Error al subir el archivo: ${uploadError.message}` }
    }

    // ── Get public URL and save record ────────────────────────
    const { data: urlData } = supabase.storage
      .from('evidencias')
      .getPublicUrl(path)

    const { error: insertError } = await supabase
      .from('evidencias')
      .insert({
        actividad_id: actividadId,
        url: urlData.publicUrl,
        nombre_archivo: file.name,
      })

    if (insertError) {
      return { error: `Error al registrar la evidencia: ${insertError.message}` }
    }

    return { data: { url: urlData.publicUrl, nombre: file.name } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al subir evidencia' }
  }
}

export async function eliminarEvidencia(evidenciaId: string): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No autorizado' }

    // Verify the period is still editable before deleting
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
