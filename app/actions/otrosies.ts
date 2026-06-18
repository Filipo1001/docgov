'use server'

/**
 * Server Actions: gestión de otrosíes (admin only)
 *
 * Un otrosí modifica un contrato existente (valor, plazo, obligaciones) sin
 * crear uno nuevo. Un contrato puede tener varios. Las mutaciones corren
 * server-side (cookies httpOnly), igual que obligaciones/contratos.
 *
 * Al crear/editar/eliminar un otrosí se invalida el caché de PDF de TODOS los
 * periodos del contrato, porque los documentos (cuenta de cobro, actas)
 * muestran los valores del otrosí y deben regenerarse.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { invalidarCachePDF } from '@/lib/pdf/cache'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

export type TipoOtrosi = 'adicion' | 'prorroga' | 'modificatorio' | 'aclaratorio'

export interface Otrosi {
  id: string
  contrato_id: string
  numero: number
  tipo: TipoOtrosi
  fecha_inicio: string
  valor_adicion: number
  plazo_dias_adicion: number
  cdp: string | null
  crp: string | null
  nota: string | null
  created_at: string
}

export interface CrearOtrosiInput {
  contratoId: string
  tipo: TipoOtrosi
  fecha_inicio: string
  valor_adicion: number
  plazo_dias_adicion: number
  cdp: string | null
  crp: string | null
  nota: string | null
}

async function requireAdminId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  return data?.rol === 'admin' ? user.id : null
}

/** Invalida el caché de PDF de todos los periodos del contrato. */
async function invalidarCacheContrato(adminClient: ReturnType<typeof createAdminSupabaseClient>, contratoId: string) {
  const { data: periodos } = await adminClient
    .from('periodos')
    .select('id')
    .eq('contrato_id', contratoId)
  await Promise.all(
    (periodos ?? []).map((p: { id: string }) => invalidarCachePDF(adminClient, p.id).catch(() => {})),
  )
}

// ─── Listar ─────────────────────────────────────────────────────────────────

export async function getOtrosies(contratoId: string): Promise<Otrosi[]> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('otrosies')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('numero')
  return (data ?? []) as Otrosi[]
}

// ─── Crear ──────────────────────────────────────────────────────────────────

export async function crearOtrosi(input: CrearOtrosiInput): Promise<ActionResult<{ id: string }>> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    const tiposValidos: TipoOtrosi[] = ['adicion', 'prorroga', 'modificatorio', 'aclaratorio']
    if (!tiposValidos.includes(input.tipo)) return { error: 'Tipo de otrosí inválido' }
    if (!input.fecha_inicio) return { error: 'La fecha de inicio del otrosí es obligatoria' }
    if (!Number.isFinite(input.valor_adicion) || input.valor_adicion < 0) {
      return { error: 'El valor de la adición debe ser 0 o mayor' }
    }
    if (!Number.isInteger(input.plazo_dias_adicion) || input.plazo_dias_adicion < 0) {
      return { error: 'El plazo de la adición debe ser 0 o mayor' }
    }

    const adminClient = createAdminSupabaseClient()

    // numero = max + 1 (calculado en servidor para evitar colisiones)
    const { data: existentes } = await adminClient
      .from('otrosies')
      .select('numero')
      .eq('contrato_id', input.contratoId)
      .order('numero', { ascending: false })
      .limit(1)
    const siguienteNumero = (existentes?.[0]?.numero ?? 0) + 1

    const { data, error } = await adminClient
      .from('otrosies')
      .insert({
        contrato_id: input.contratoId,
        numero: siguienteNumero,
        tipo: input.tipo,
        fecha_inicio: input.fecha_inicio,
        valor_adicion: Math.round(input.valor_adicion),
        plazo_dias_adicion: input.plazo_dias_adicion,
        cdp: input.cdp?.trim() || null,
        crp: input.crp?.trim() || null,
        nota: input.nota?.trim() || null,
      })
      .select('id')
      .single()

    if (error) return { error: `Error al guardar el otrosí: ${error.message}` }

    await invalidarCacheContrato(adminClient, input.contratoId)
    revalidatePath(`/dashboard/contratos/${input.contratoId}`)
    return { data: { id: data.id as string } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Eliminar ───────────────────────────────────────────────────────────────

export async function eliminarOtrosi(otrosiId: string, contratoId: string): Promise<ActionResult> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient.from('otrosies').delete().eq('id', otrosiId)
    if (error) return { error: `Error al eliminar: ${error.message}` }

    await invalidarCacheContrato(adminClient, contratoId)
    revalidatePath(`/dashboard/contratos/${contratoId}`)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
