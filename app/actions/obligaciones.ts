'use server'

/**
 * Server Actions: Obligation management (admin only)
 *
 * Las mutaciones corren server-side, de modo que la autorización se valida con
 * las cookies httpOnly — sin depender de que la sesión del navegador esté
 * "caliente". Esto corrige el bug donde agregar/eliminar obligaciones fallaba
 * silenciosamente (browser client + RLS con sesión fría), mismo patrón que ya
 * se aplicó a actividades (crearActividad/eliminarActividad).
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

/** Verifica que el solicitante sea admin. Devuelve null si no lo es. */
async function requireAdminId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()
  return data?.rol === 'admin' ? user.id : null
}

// ─── Crear obligación ───────────────────────────────────────────────────────

export async function crearObligacion(params: {
  contratoId: string
  descripcion: string
  esPermanente: boolean
}): Promise<ActionResult<{ id: string }>> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    const descripcion = params.descripcion.trim()
    if (!descripcion) return { error: 'La descripción no puede estar vacía' }
    if (descripcion.length > 1500) return { error: 'La descripción no puede superar los 1500 caracteres' }

    const adminClient = createAdminSupabaseClient()

    // orden = máximo actual + 1 (calculado en servidor para evitar colisiones
    // si el cliente tenía una lista desactualizada).
    const { data: existentes } = await adminClient
      .from('obligaciones')
      .select('orden')
      .eq('contrato_id', params.contratoId)
      .order('orden', { ascending: false })
      .limit(1)

    const siguienteOrden = (existentes?.[0]?.orden ?? 0) + 1

    const { data, error } = await adminClient
      .from('obligaciones')
      .insert({
        contrato_id: params.contratoId,
        descripcion,
        orden: siguienteOrden,
        es_permanente: params.esPermanente,
      })
      .select('id')
      .single()

    if (error) return { error: `Error al guardar: ${error.message}` }

    revalidatePath(`/dashboard/contratos/${params.contratoId}`)
    return { data: { id: data.id as string } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Eliminar obligación ────────────────────────────────────────────────────

export async function eliminarObligacion(
  obligacionId: string,
  contratoId: string,
): Promise<ActionResult> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient
      .from('obligaciones')
      .delete()
      .eq('id', obligacionId)

    if (error) return { error: `Error al eliminar: ${error.message}` }

    revalidatePath(`/dashboard/contratos/${contratoId}`)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
