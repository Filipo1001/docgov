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
import { invalidarCachePDF } from '@/lib/pdf/cache'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

async function invalidarCacheContrato(
  adminClient: ReturnType<typeof createAdminSupabaseClient>,
  contratoId: string,
) {
  const { data: periodos } = await adminClient
    .from('periodos')
    .select('id')
    .eq('contrato_id', contratoId)
  await Promise.all(
    (periodos ?? []).map((p: { id: string }) => invalidarCachePDF(adminClient, p.id).catch(() => {})),
  )
}

/** Verifica que el solicitante sea admin o contratación. Devuelve null si no lo es. */
async function requireAdminId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()
  // Contratación gestiona obligaciones contractuales igual que admin
  return data?.rol === 'admin' || data?.rol === 'contratacion' ? user.id : null
}

// ─── Crear obligación ───────────────────────────────────────────────────────

export async function crearObligacion(params: {
  contratoId: string
  descripcion: string
  esPermanente: boolean
  otrosiId?: string | null
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
        otrosi_id: params.otrosiId ?? null,
      })
      .select('id')
      .single()

    if (error) return { error: `Error al guardar: ${error.message}` }

    await invalidarCacheContrato(adminClient, params.contratoId)
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

    await invalidarCacheContrato(adminClient, contratoId)
    revalidatePath(`/dashboard/contratos/${contratoId}`)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Copiar obligaciones de otro contrato ────────────────────────────────────

export interface ContratoModelo {
  id: string
  numero: string
  anio: number
  objeto: string
  obligaciones: number
}

/**
 * Contratos que pueden servir de modelo, priorizando la misma dependencia.
 *
 * En producción hay 61 contratos sin obligaciones: escribirlas una por una es
 * el cuello de botella real, no la falta de permisos. Se copian de un contrato
 * EXISTENTE en vez de mantener un catálogo de plantillas aparte, porque el
 * origen es entonces un contrato que de verdad se usó y se aprobó — una
 * plantilla paralela hay que mantenerla y envejece sin que nadie lo note.
 */
export async function contratosModelo(
  contratoId: string,
): Promise<ContratoModelo[]> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return []

    const admin = createAdminSupabaseClient()
    const { data: destino } = await admin
      .from('contratos').select('dependencia_id').eq('id', contratoId).single()
    if (!destino) return []

    const { data } = await admin
      .from('contratos')
      .select('id, numero, anio, objeto, dependencia_id, obligaciones(count)')
      .neq('id', contratoId)
      .order('anio', { ascending: false })
      .order('numero', { ascending: false })

    return ((data ?? []) as any[])
      .map(c => ({
        id: c.id,
        numero: c.numero,
        anio: c.anio,
        objeto: c.objeto,
        obligaciones: c.obligaciones?.[0]?.count ?? 0,
        mismaDependencia: c.dependencia_id === destino.dependencia_id,
      }))
      .filter(c => c.obligaciones > 0)
      // La misma secretaría primero: es donde los objetos contractuales se
      // parecen y donde está el modelo que se va a querer casi siempre.
      .sort((a, b) => Number(b.mismaDependencia) - Number(a.mismaDependencia))
      .slice(0, 30)
      .map(({ mismaDependencia, ...c }) => c)
  } catch {
    return []
  }
}

export async function copiarObligaciones(
  contratoDestinoId: string,
  contratoOrigenId: string,
): Promise<ActionResult<{ copiadas: number }>> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()

    // Solo sobre un contrato vacío: mezclar dos juegos de obligaciones dejaría
    // duplicados difíciles de detectar en un acta ya generada.
    const { count: yaTiene } = await admin
      .from('obligaciones').select('id', { count: 'exact', head: true })
      .eq('contrato_id', contratoDestinoId)
    if ((yaTiene ?? 0) > 0) {
      return { error: 'Este contrato ya tiene obligaciones. Elimínalas antes de copiar otras.' }
    }

    const { data: origen } = await admin
      .from('obligaciones')
      .select('descripcion, es_permanente, orden')
      .eq('contrato_id', contratoOrigenId)
      .order('orden')

    if (!origen?.length) return { error: 'El contrato elegido no tiene obligaciones.' }

    // otrosi_id NO se copia: pertenece a un otrosí del contrato de origen y
    // aquí no significaría nada.
    const { error } = await admin.from('obligaciones').insert(
      origen.map((o, i) => ({
        contrato_id: contratoDestinoId,
        descripcion: o.descripcion,
        es_permanente: o.es_permanente,
        orden: i + 1,
      })),
    )

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/contratos/${contratoDestinoId}`)
    return { data: { copiadas: origen.length } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
