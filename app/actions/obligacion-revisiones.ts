'use server'

/**
 * Server Actions: revisión por obligación (asesor / supervisor).
 *
 * Para cada obligación de un período, el revisor fija UN estado de tres:
 * aprobada, observada o devuelta. Ver `fijarRevisionObligacion` más abajo,
 * que es el único punto de escritura.
 *
 * Esa revisión alimenta dos cosas: el apartado "Aceptación de las actividades
 * realizadas" del Acta de Supervisión, y los correos que recibe la contratista
 * (las devueltas en el de devolución, las observadas en el de aprobación).
 * Solo se guarda fila cuando alguien se pronuncia; sin fila, la obligación
 * está sin revisar. Mismo patrón que obligaciones.ts: auth con el server
 * client (cookies httpOnly) y escritura con el admin client.
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

// ─── El veredicto de una obligación ─────────────────────────────────────────

/**
 * Los tres estados que un revisor puede dar a una obligación.
 *
 * Antes eran dos acciones sueltas —un `toggle` de aprobación y un «guardar
 * nota»— y el significado salía de combinarlas: para decir «no cumple, y esto
 * es lo que falta» había que quitar el ✓ y además escribir la nota, sin que
 * nada en la pantalla dijera que esa pareja significaba un hallazgo. Se notaba
 * en los datos: las 17 obligaciones marcadas «sin aprobar» en producción no
 * tenían ni una nota, y las 14 con nota estaban todas aprobadas.
 *
 * Ahora el revisor elige un estado y el estado lleva su texto dentro:
 *
 *   · `aprobada`  → cumple, sin nada que añadir.        (aprobada=true,  nota=null)
 *   · `observada` → cumple, con una observación que va   (aprobada=true,  nota=texto)
 *                   al Acta de Supervisión.
 *   · `devuelta`  → no cumple. El texto viaja a la       (aprobada=false, nota=texto)
 *                   contratista en el correo de devolución y NO al acta.
 *
 * Sobre las columnas de siempre: esto no necesitó migración.
 */
export type EstadoRevision = 'aprobada' | 'observada' | 'devuelta'

export async function fijarRevisionObligacion(
  periodoId: string,
  obligacionId: string,
  estado: EstadoRevision,
  nota?: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireRevisor(periodoId)
    if ('error' in ctx) return { error: ctx.error }

    const limpio = (nota ?? '').trim()
    if (limpio.length > 2000) return { error: 'El texto no puede superar los 2000 caracteres' }

    // Devolver sin decir por qué no le sirve a nadie: es exactamente lo que
    // producían las 17 filas «sin aprobar» sin nota que hay en producción.
    if (estado === 'devuelta' && !limpio) {
      return { error: 'Explica qué debe corregir la contratista en esta obligación' }
    }
    if (estado === 'observada' && !limpio) {
      return { error: 'Escribe la observación' }
    }

    const admin = createAdminSupabaseClient()
    const { error } = await admin
      .from('obligacion_revisiones')
      .upsert(
        {
          periodo_id: periodoId,
          obligacion_id: obligacionId,
          aprobada: estado !== 'devuelta',
          // `aprobada` borra el texto a propósito: es el estado «cumple y no
          // hay nada que añadir». Quien lo pulsa teniendo texto escrito recibe
          // antes una confirmación en la pantalla.
          nota: estado === 'aprobada' ? null : limpio,
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
