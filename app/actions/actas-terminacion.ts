'use server'

/**
 * Acta de Terminación Bilateral del contrato (formato F-SGG-037).
 *
 * Aquí vive solo la parte del CONTRATISTA: comprobar si debe aceptarla antes
 * de enviar su último informe, y registrar esa aceptación.
 *
 * El documento no se emite en este paso. Un acta bilateral a la que le faltan
 * dos firmas no está suscrita: se emite cuando el supervisor aprueba ese
 * informe, con las tres rúbricas. Esa parte vive en `lib/actas-terminacion.ts`
 * y la dispara la aprobación de periodos.
 *
 * Espejo de `certificaciones.ts`, que se acepta antes del PRIMER informe. La
 * diferencia de fondo: aquella es una declaración jurada unilateral y pregunta
 * algo; esta es bilateral y no pregunta nada — todos los datos ya están en el
 * sistema, y lo único que aporta el contratista es su consentimiento.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { headers } from 'next/headers'
import type { ActionResult } from '@/lib/types'
import { actaTerminacionPendiente, cargarContextoActa } from '@/lib/actas-terminacion'

const TEXTO_VERSION = 'v1'

/**
 * ¿El contratista debe aceptar el acta antes de enviar este informe?
 * Devuelve también lo necesario para pintar el modal, sin pedirle nada nuevo.
 */
export async function verificarActaTerminacionRequerida(periodoId: string): Promise<{
  requerida: boolean
  faltaFirma: boolean
  prefill: {
    contrato: string
    objeto: string
    fechaTerminacion: string
    supervisor: string
    municipio: string
  } | null
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { requerida: false, faltaFirma: false, prefill: null, error: 'No autorizado' }

    const ctx = await cargarContextoActa(periodoId)
    if (!ctx) return { requerida: false, faltaFirma: false, prefill: null, error: 'Periodo no encontrado' }

    // Solo el titular pasa por este flujo; nadie firma un contrato ajeno.
    if (ctx.contratistaId !== user.id) {
      return { requerida: false, faltaFirma: false, prefill: null }
    }

    const requerida = await actaTerminacionPendiente(ctx.contratoId, periodoId)

    return {
      requerida,
      faltaFirma: !ctx.firmaUrl,
      prefill: {
        contrato: `${ctx.contratoNumero}-${ctx.contratoAnio}`,
        objeto: ctx.objeto,
        fechaTerminacion: ctx.fechaFin,
        supervisor: ctx.supervisorNombre,
        municipio: ctx.municipioNombre,
      },
    }
  } catch (e: unknown) {
    return { requerida: false, faltaFirma: false, prefill: null, error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * El contratista acepta la terminación bilateral.
 *
 * Registra el consentimiento con su evidencia (IP, agente, hora) y congela la
 * fecha de terminación vigente, para que una prórroga posterior no altere lo
 * que se aceptó. El PDF se emite después, al aprobar el supervisor.
 *
 * Idempotente: si ya existe acta para el contrato, no hace nada.
 */
export async function aceptarActaTerminacion(periodoId: string): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const ctx = await cargarContextoActa(periodoId)
    if (!ctx) return { error: 'Periodo no encontrado' }
    if (ctx.contratistaId !== user.id) return { error: 'Solo el titular del contrato puede aceptar su acta de terminación' }
    if (!ctx.firmaUrl) return { error: 'Debes registrar tu firma en tu perfil antes de aceptar el acta de terminación.' }

    // Se revalida aquí: el cliente ya lo consultó, pero esta acción es
    // invocable directamente y no puede fiarse de eso.
    const pendiente = await actaTerminacionPendiente(ctx.contratoId, periodoId)
    if (!pendiente) return {}

    const admin = createAdminSupabaseClient()
    const fechaAceptacion = new Date().toISOString()

    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = h.get('user-agent') ?? null

    const { error: insErr } = await admin.from('actas_terminacion').upsert({
      contrato_id: ctx.contratoId,
      contratista_id: ctx.contratistaId,
      periodo_id: periodoId,
      // Congelada: una prórroga posterior no debe alterar lo aceptado.
      fecha_terminacion: ctx.fechaFin,
      texto_version: TEXTO_VERSION,
      datos_snapshot: {
        nombre: ctx.nombre,
        cedula: ctx.cedula,
        contrato: `${ctx.contratoNumero}-${ctx.contratoAnio}`,
        objeto: ctx.objeto,
        valor_total: ctx.valorTotal,
        supervisor: ctx.supervisorNombre,
        municipio: ctx.municipioNombre,
        fecha_terminacion: ctx.fechaFin,
      },
      aceptado_por: user.id,
      fecha_aceptacion: fechaAceptacion,
      ip_aceptacion: ip,
      user_agent: userAgent,
    }, { onConflict: 'contrato_id' })

    if (insErr) return { error: `No se pudo registrar el acta de terminación: ${insErr.message}` }

    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
