'use server'

/**
 * Server Actions: Activity management
 *
 * All mutations run server-side so auth is validated via httpOnly cookies —
 * no dependency on the browser Supabase session being warmed up.
 *
 * Performance wins vs. the previous implementation:
 *  • actualizarActividad: 6 sequential round-trips → 3 (parallel role+period)
 *  • crearActividad: browser-client direct insert → server action (auth safety)
 *  • eliminarActividad: browser-client direct delete → server action (auth safety)
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ESTADOS_EDITABLES } from '@/lib/constants'
import type { ActionResult } from '@/lib/types'

// ─── actualizarActividad ────────────────────────────────────────────────────
// Old: getUser → usuarios → periodos → contratos → actividades.verify → update (6 sequential)
// New: getUser → parallel(usuarios + periodos-with-join) → update-with-filter  (3 sequential)

export async function actualizarActividad(
  actividadId: string,
  periodoId: string,
  descripcion: string,
  cantidad: number,
): Promise<ActionResult> {
  try {
    const trimmed = descripcion.trim()
    if (!trimmed) return { error: 'La descripción no puede estar vacía' }
    if (trimmed.length > 500) return { error: 'La descripción no puede superar los 500 caracteres' }
    if (cantidad < 1 || !Number.isInteger(cantidad)) {
      return { error: 'La cantidad debe ser un número entero mayor a 0' }
    }

    const supabase = await createServerSupabaseClient()

    // ── Step 1: auth ──────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // ── Step 2: parallel — role + period state (contrato joined for ownership) ──
    const [{ data: usuario }, { data: periodo }] = await Promise.all([
      supabase
        .from('usuarios')
        .select('rol')
        .eq('id', user.id)
        .single(),
      supabase
        .from('periodos')
        .select('id, estado, es_historico, contrato_id, contrato:contratos(contratista_id)')
        .eq('id', periodoId)
        .single(),
    ])

    if (!usuario) return { error: 'Perfil de usuario no encontrado' }
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede editar un periodo histórico' }
    if (!ESTADOS_EDITABLES.includes(periodo.estado as never)) {
      return { error: `No se puede editar: el informe está en estado "${periodo.estado}"` }
    }
    if (usuario.rol === 'contratista') {
      const contrato = periodo.contrato as unknown as { contratista_id: string } | null
      if (!contrato || contrato.contratista_id !== user.id) {
        return { error: 'No tienes permiso para editar actividades de este contrato' }
      }
    }

    // ── Step 3: update — eq(periodo_id) also verifies activity belongs here ──
    const { data: updated, error: updateError } = await supabase
      .from('actividades')
      .update({ descripcion: trimmed, cantidad })
      .eq('id', actividadId)
      .eq('periodo_id', periodoId)
      .select('id')

    if (updateError) return { error: `Error al guardar: ${updateError.message}` }
    if (!updated?.length) {
      return { error: 'No se pudo guardar. La actividad no fue encontrada o no tienes permiso.' }
    }

    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al actualizar la actividad' }
  }
}

// ─── crearActividad ─────────────────────────────────────────────────────────
// Moved from services/periodos.ts (browser client) → server action.
// Guarantees auth via httpOnly cookies regardless of browser session warmth.

export async function crearActividad(params: {
  periodoId: string
  obligacionId: string
  descripcion: string
  cantidad: number
  orden: number
}): Promise<ActionResult> {
  try {
    const trimmed = params.descripcion.trim()
    if (!trimmed) return { error: 'La descripción no puede estar vacía' }
    if (trimmed.length > 500) return { error: 'La descripción no puede superar los 500 caracteres' }
    if (params.cantidad < 1 || !Number.isInteger(params.cantidad)) {
      return { error: 'La cantidad debe ser un número entero mayor a 0' }
    }

    const supabase = await createServerSupabaseClient()

    // Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Parallel: role + period state (with contrato join)
    const [{ data: usuario }, { data: periodo }] = await Promise.all([
      supabase.from('usuarios').select('rol').eq('id', user.id).single(),
      supabase
        .from('periodos')
        .select('id, estado, es_historico, contrato_id, contrato:contratos(contratista_id)')
        .eq('id', params.periodoId)
        .single(),
    ])

    if (!usuario) return { error: 'Perfil de usuario no encontrado' }
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede editar un periodo histórico' }
    if (!ESTADOS_EDITABLES.includes(periodo.estado as never)) {
      return { error: `No se puede editar: el informe está en estado "${periodo.estado}"` }
    }
    if (usuario.rol === 'contratista') {
      const contrato = periodo.contrato as unknown as { contratista_id: string } | null
      if (!contrato || contrato.contratista_id !== user.id) {
        return { error: 'No tienes permiso para agregar actividades a este contrato' }
      }
    }

    const { error } = await supabase.from('actividades').insert({
      periodo_id: params.periodoId,
      obligacion_id: params.obligacionId,
      descripcion: trimmed,
      cantidad: params.cantidad,
      orden: params.orden,
    })

    if (error) return { error: error.message }
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al crear la actividad' }
  }
}

// ─── eliminarActividad ──────────────────────────────────────────────────────
// Moved from services/periodos.ts (browser client) → server action.

export async function eliminarActividad(actividadId: string): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    // Parallel: role + activity (with period + contrato for ownership)
    const [{ data: usuario }, { data: actividad }] = await Promise.all([
      supabase.from('usuarios').select('rol').eq('id', user.id).single(),
      supabase
        .from('actividades')
        .select('id, periodo:periodos(id, estado, es_historico, contrato_id, contrato:contratos(contratista_id))')
        .eq('id', actividadId)
        .single(),
    ])

    if (!usuario) return { error: 'Perfil de usuario no encontrado' }
    if (!actividad) return { error: 'Actividad no encontrada' }

    type PeriodoConContrato = {
      id: string
      estado: string
      es_historico: boolean
      contrato_id: string
      contrato: { contratista_id: string } | null
    }
    const periodo = actividad.periodo as unknown as PeriodoConContrato | null
    if (!periodo) return { error: 'Periodo no encontrado' }
    if (periodo.es_historico) return { error: 'No se puede editar un periodo histórico' }
    if (!ESTADOS_EDITABLES.includes(periodo.estado as never)) {
      return { error: `No se puede eliminar: el informe está en estado "${periodo.estado}"` }
    }
    if (usuario.rol === 'contratista' && (!periodo.contrato || periodo.contrato.contratista_id !== user.id)) {
      return { error: 'No tienes permiso para eliminar esta actividad' }
    }

    const { error } = await supabase.from('actividades').delete().eq('id', actividadId)
    if (error) return { error: error.message }
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado al eliminar la actividad' }
  }
}
