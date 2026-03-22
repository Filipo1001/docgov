'use server'

/**
 * Server Actions: Period workflow
 *
 * All state transitions for the approval workflow run here.
 * Benefits vs. direct client calls:
 *   - Role validation happens on the server (cannot be bypassed from browser)
 *   - State machine is enforced before hitting the DB (clear error messages)
 *   - Supabase RLS provides a second layer of enforcement
 *   - Ready for audit logging, email notifications, PDF generation hooks
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  ESTADO_SIGUIENTE,
  ESTADO_REVISOR,
  ESTADOS_EDITABLES,
  ESTADOS_EN_REVISION,
  LABEL_APROBADOR,
} from '@/lib/constants'
import type { EstadoPeriodo, Rol, ActionResult } from '@/lib/types'
import { revalidatePath } from 'next/cache'

// ─── Internal helper ─────────────────────────────────────────

async function getAuthContext() {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('No autorizado: sesión inválida')
  }

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, rol, nombre_completo')
    .eq('id', session.user.id)
    .single()

  if (error || !usuario) {
    throw new Error('No autorizado: perfil de usuario no encontrado')
  }

  return { supabase, usuario: usuario as { id: string; rol: Rol; nombre_completo: string } }
}

async function getPeriodo(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, periodoId: string) {
  const { data, error } = await supabase
    .from('periodos')
    .select('id, estado, contrato_id')
    .eq('id', periodoId)
    .single()

  if (error || !data) return null
  return data as { id: string; estado: EstadoPeriodo; contrato_id: string }
}

async function getSupervisorId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contratoId: string) {
  const { data } = await supabase
    .from('contratos')
    .select('supervisor_id, contratista_id')
    .eq('id', contratoId)
    .single()
  return data
}

// ─── Actions ─────────────────────────────────────────────────

/**
 * Contratista submits a period for review.
 * Validates: role, ownership, editable state, at least one activity.
 */
export async function enviarPeriodo(periodoId: string): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'contratista' && usuario.rol !== 'admin') {
      return { error: 'Solo el contratista puede enviar periodos a revisión' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }

    if (!ESTADOS_EDITABLES.includes(periodo.estado)) {
      return { error: `No se puede enviar un periodo en estado "${periodo.estado}"` }
    }

    // Verify ownership (contratista must own this contract)
    if (usuario.rol === 'contratista') {
      const contrato = await getSupervisorId(supabase, periodo.contrato_id)
      if (contrato?.contratista_id !== usuario.id) {
        return { error: 'No tienes permiso para enviar este periodo' }
      }
    }

    // Must have at least one activity registered
    const { count } = await supabase
      .from('actividades')
      .select('*', { count: 'exact', head: true })
      .eq('periodo_id', periodoId)

    if (!count || count === 0) {
      return { error: 'Debes registrar al menos una actividad antes de enviar' }
    }

    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'enviado', fecha_envio: new Date().toISOString() })
      .eq('id', periodoId)

    if (error) return { error: `Error al enviar: ${error.message}` }

    revalidatePath(`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodoId}`)
    revalidatePath(`/dashboard/contratos/${periodo.contrato_id}`)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Reviewer approves a period, advancing it to the next state.
 * Validates: role matches current estado, supervisor contract ownership.
 */
export async function aprobarPeriodo(periodoId: string): Promise<ActionResult<{ siguienteEstado: string }>> {
  try {
    const { supabase, usuario } = await getAuthContext()

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }

    if (!ESTADOS_EN_REVISION.includes(periodo.estado)) {
      return { error: 'Este periodo no está en un estado que pueda ser aprobado' }
    }

    // Validate role is authorized to approve this specific state
    if (usuario.rol !== 'admin') {
      const estadoEsperado = ESTADO_REVISOR[usuario.rol]
      if (estadoEsperado !== periodo.estado) {
        return {
          error: `Tu rol (${usuario.rol}) no puede aprobar un periodo en estado "${periodo.estado}"`,
        }
      }

      // Supervisor must be assigned to this contract
      if (usuario.rol === 'supervisor') {
        const contrato = await getSupervisorId(supabase, periodo.contrato_id)
        if (contrato?.supervisor_id !== usuario.id) {
          return { error: 'No eres el supervisor asignado a este contrato' }
        }
      }
    }

    const siguienteEstado = ESTADO_SIGUIENTE[periodo.estado]
    if (!siguienteEstado) {
      return { error: 'Este periodo no puede avanzar en el flujo de aprobación' }
    }

    const { error } = await supabase
      .from('periodos')
      .update({ estado: siguienteEstado })
      .eq('id', periodoId)

    if (error) return { error: `Error al aprobar: ${error.message}` }

    revalidatePath(`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodoId}`)
    revalidatePath('/dashboard/aprobaciones')
    revalidatePath('/dashboard')

    return { data: { siguienteEstado } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Reviewer rejects a period, returning it to the contratista with a reason.
 * Validates: role, estado, supervisor ownership, non-empty reason.
 */
export async function rechazarPeriodo(
  periodoId: string,
  motivo: string
): Promise<ActionResult> {
  try {
    if (!motivo?.trim()) {
      return { error: 'El motivo de rechazo es obligatorio' }
    }

    const { supabase, usuario } = await getAuthContext()

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }

    if (!ESTADOS_EN_REVISION.includes(periodo.estado)) {
      return { error: 'Este periodo no puede ser rechazado en su estado actual' }
    }

    if (usuario.rol !== 'admin') {
      const estadoEsperado = ESTADO_REVISOR[usuario.rol]
      if (estadoEsperado !== periodo.estado) {
        return {
          error: `Tu rol (${usuario.rol}) no puede rechazar un periodo en estado "${periodo.estado}"`,
        }
      }

      if (usuario.rol === 'supervisor') {
        const contrato = await getSupervisorId(supabase, periodo.contrato_id)
        if (contrato?.supervisor_id !== usuario.id) {
          return { error: 'No eres el supervisor asignado a este contrato' }
        }
      }
    }

    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'rechazado', motivo_rechazo: motivo.trim() })
      .eq('id', periodoId)

    if (error) return { error: `Error al rechazar: ${error.message}` }

    revalidatePath(`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodoId}`)
    revalidatePath('/dashboard/aprobaciones')
    revalidatePath('/dashboard')

    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Admin or hacienda marks an approved period as paid.
 */
export async function marcarPagado(periodoId: string): Promise<ActionResult> {
  try {
    const { supabase, usuario } = await getAuthContext()

    if (usuario.rol !== 'admin' && usuario.rol !== 'hacienda') {
      return { error: 'Solo admin o hacienda pueden marcar periodos como pagados' }
    }

    const periodo = await getPeriodo(supabase, periodoId)
    if (!periodo) return { error: 'Periodo no encontrado' }

    if (periodo.estado !== 'aprobado') {
      return { error: 'Solo se pueden marcar como pagados los periodos aprobados' }
    }

    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'pagado' })
      .eq('id', periodoId)

    if (error) return { error: `Error al marcar como pagado: ${error.message}` }

    revalidatePath(`/dashboard/contratos/${periodo.contrato_id}/periodo/${periodoId}`)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// Re-export label for use in toast messages
export { LABEL_APROBADOR }
