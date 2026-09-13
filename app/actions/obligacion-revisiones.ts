'use server'

/**
 * Server Actions: revisión por obligación (asesor / supervisor).
 *
 * Asesor y supervisor pueden, para cada obligación de un período:
 *  - aprobar/desmarcar (✓)
 *  - agregar una nota
 *
 * Esa revisión alimenta el apartado "Aceptación de las actividades realizadas"
 * del Acta de Supervisión. Solo se guarda fila cuando se desvía del default
 * (aprobada=true, sin nota). Mismo patrón que obligaciones.ts: auth con el
 * server client (cookies httpOnly) y escritura con el admin client.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { invalidarCachePDF } from '@/lib/pdf/cache'
import { revalidatePath } from 'next/cache'
import type { ActionResult, Rol } from '@/lib/types'

type RevisorCtx = {
  userId: string
  rol: Rol
  contratoId: string
}

/**
 * Valida que el solicitante (asesor/supervisor/admin) pueda revisar este período
 * y devuelve el contexto. Devuelve un error legible si no está autorizado.
 */
async function requireRevisor(periodoId: string): Promise<RevisorCtx | { error: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, dependencia_id')
    .eq('id', user.id)
    .single()

  if (!usuario) return { error: 'Perfil de usuario no encontrado' }
  const rol = usuario.rol as Rol
  if (rol !== 'asesor' && rol !== 'supervisor' && rol !== 'admin') {
    return { error: 'Solo asesor o supervisor pueden revisar obligaciones' }
  }

  // Período + contrato (para validar acceso y bloquear históricos).
  const { data: periodo } = await supabase
    .from('periodos')
    .select('id, es_historico, contrato:contratos(id, supervisor_id, dependencia_id)')
    .eq('id', periodoId)
    .single()

  if (!periodo) return { error: 'Periodo no encontrado' }

  // El join to-one `contrato:contratos(...)` se infiere como array en los tipos
  // de supabase-js, pero en runtime es un objeto. Se castea vía unknown.
  const periodoRow = periodo as unknown as {
    es_historico?: boolean
    contrato?: { id: string; supervisor_id: string | null; dependencia_id: string | null } | null
  }
  if (periodoRow.es_historico) {
    return { error: 'No se puede revisar un periodo histórico' }
  }

  const contrato = periodoRow.contrato
  if (!contrato) return { error: 'Contrato no encontrado' }

  // Alcance por rol: supervisor solo su contrato; asesor solo su dependencia.
  if (rol === 'supervisor' && contrato.supervisor_id !== user.id) {
    return { error: 'No eres el supervisor de este contrato' }
  }
  if (rol === 'asesor' && usuario.dependencia_id && contrato.dependencia_id !== usuario.dependencia_id) {
    return { error: 'Este contrato pertenece a otra dependencia' }
  }

  return { userId: user.id, rol, contratoId: contrato.id }
}

async function postRevision(periodoId: string, contratoId: string) {
  await invalidarCachePDF(createAdminSupabaseClient(), periodoId).catch(() => {})
  revalidatePath(`/dashboard/contratos/${contratoId}/periodo/${periodoId}`)
}

// ─── Aprobar / desmarcar una obligación ─────────────────────────────────────

export async function toggleAprobacionObligacion(
  periodoId: string,
  obligacionId: string,
  aprobada: boolean,
): Promise<ActionResult> {
  try {
    const ctx = await requireRevisor(periodoId)
    if ('error' in ctx) return { error: ctx.error }

    const admin = createAdminSupabaseClient()
    const { error } = await admin
      .from('obligacion_revisiones')
      .upsert(
        {
          periodo_id: periodoId,
          obligacion_id: obligacionId,
          aprobada,
          revisado_por: ctx.userId,
          revisado_at: new Date().toISOString(),
        },
        { onConflict: 'periodo_id,obligacion_id' },
      )

    if (error) return { error: `Error al guardar: ${error.message}` }

    await postRevision(periodoId, ctx.contratoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Guardar / borrar la nota de una obligación ─────────────────────────────

export async function guardarNotaObligacion(
  periodoId: string,
  obligacionId: string,
  nota: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireRevisor(periodoId)
    if ('error' in ctx) return { error: ctx.error }

    const limpio = nota.trim()
    if (limpio.length > 2000) return { error: 'La nota no puede superar los 2000 caracteres' }

    const admin = createAdminSupabaseClient()

    /**
     * ESCRIBIR UNA NOTA NO PUEDE APROBAR LA OBLIGACIÓN.
     *
     * Esto era un `upsert` que solo mandaba `nota`. Cuando no existía fila
     * —el caso normal: nadie había tocado esa obligación— el INSERT dejaba
     * que `aprobada` tomara su DEFAULT en Postgres, que es `true`. Resultado:
     * quien escribía «falta la evidencia de las visitas» estaba aprobando la
     * obligación sin saberlo, y la pantalla la pintaba en verde.
     *
     * No es una hipótesis. En producción las 14 filas con nota estaban las 14
     * marcadas como aprobadas, y las 17 marcadas «sin aprobar» no tenían
     * ninguna nota: los dos conjuntos eran disjuntos, que es tanto como decir
     * que el sistema impedía que el veredicto y su motivo viajaran juntos.
     *
     * Ahora la nota NUNCA toca el veredicto:
     *  · Si ya hay fila, se conserva el `aprobada` que tuviera.
     *  · Si no la hay, la nota entra como hallazgo (`aprobada: false`). Es la
     *    única dirección segura: fabricar una aprobación de una obligación
     *    contractual es un daño silencioso, mientras que un «sin aprobar» de
     *    más es visible y se deshace con un clic. Y encaja con el criterio
     *    acordado: el ✓ es quien decide si la nota es un hallazgo (sin
     *    aprobar) o una observación para el acta (aprobada).
     */
    const { data: previa } = await admin
      .from('obligacion_revisiones')
      .select('aprobada')
      .eq('periodo_id', periodoId)
      .eq('obligacion_id', obligacionId)
      .maybeSingle()

    const { error } = await admin
      .from('obligacion_revisiones')
      .upsert(
        {
          periodo_id: periodoId,
          obligacion_id: obligacionId,
          aprobada: previa ? (previa as { aprobada: boolean }).aprobada : false,
          nota: limpio || null,
          revisado_por: ctx.userId,
          revisado_at: new Date().toISOString(),
        },
        { onConflict: 'periodo_id,obligacion_id' },
      )

    if (error) return { error: `Error al guardar la nota: ${error.message}` }

    await postRevision(periodoId, ctx.contratoId)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
