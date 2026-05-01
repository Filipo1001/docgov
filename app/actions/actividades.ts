'use server'

/**
 * Server Actions: Activity management
 *
 * Editing is allowed only when the period is in an editable state
 * (borrador / rechazado) and belongs to the authenticated user's contract
 * (or the caller is admin).
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ESTADOS_EDITABLES } from '@/lib/constants'
import type { ActionResult } from '@/lib/types'

export async function actualizarActividad(
  actividadId: string,
  periodoId: string,
  descripcion: string,
  cantidad: number,
): Promise<ActionResult> {
  try {
    const trimmed = descripcion.trim()
    if (!trimmed) return { error: 'La descripción no puede estar vacía' }
    if (cantidad < 1 || !Number.isInteger(cantidad)) return { error: 'La cantidad debe ser un número entero mayor a 0' }

    const supabase = await createServerSupabaseClient()

    // ── Auth ─────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!usuario) return { error: 'Perfil de usuario no encontrado' }

    // ── Period state check ────────────────────────────────────────
    const { data: periodo } = await supabase
      .from('periodos')
      .select('id, estado, es_historico, contrato_id')
      .eq('id', periodoId)
      .single()

    if (!periodo) return { error: 'Periodo no encontrado' }

    if (periodo.es_historico) {
      return { error: 'No se puede editar un periodo histórico' }
    }

    if (!ESTADOS_EDITABLES.includes(periodo.estado as never)) {
      return { error: `No se puede editar: el informe está en estado "${periodo.estado}"` }
    }

    // ── Ownership: contratistas can only edit their own contract ──
    if (usuario.rol === 'contratista') {
      const { data: contrato } = await supabase
        .from('contratos')
        .select('contratista_id')
        .eq('id', periodo.contrato_id)
        .single()

      if (!contrato || contrato.contratista_id !== user.id) {
        return { error: 'No tienes permiso para editar actividades de este contrato' }
      }
    }

    // ── Verify activity belongs to this period ────────────────────
    const { data: actividad } = await supabase
      .from('actividades')
      .select('id')
      .eq('id', actividadId)
      .eq('periodo_id', periodoId)
      .single()

    if (!actividad) return { error: 'La actividad no pertenece a este periodo' }

    // ── Update ────────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('actividades')
      .update({ descripcion: trimmed, cantidad })
      .eq('id', actividadId)

    if (updateError) return { error: `Error al guardar: ${updateError.message}` }

    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al actualizar la actividad' }
  }
}
