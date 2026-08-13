import 'server-only'
import { createAdminSupabaseClient } from './supabase-admin'

// Desactivada a petición del usuario: la certificación deja de ser
// obligatoria en el primer informe. La tarjeta y la generación del PDF
// siguen disponibles para quien quiera subirla por su cuenta — este
// interruptor solo apaga la exigencia. Volver a `true` reactiva la regla
// tal como estaba.
const RETENCION_OBLIGATORIA = false

/**
 * ¿Debe exigirse la Certificación de Retención en la Fuente antes de este envío?
 *
 * Regla: la certificación se pide UNA sola vez, en el PRIMER informe del
 * contrato. Se exige solo cuando:
 *   1. Aún no existe la certificación para (contrato, año gravable), y
 *   2. Es genuinamente el primer informe: ningún otro periodo del contrato ha
 *      salido de borrador (no hay envíos previos).
 *
 * La condición #2 es la que corrige el caso de los contratos que ya venían en
 * curso cuando se lanzó la funcionalidad: si el contratista ya había enviado
 * informes anteriores, no se le exige retroactivamente en un mes posterior.
 */
export async function certificacionPendiente(
  contratoId: string,
  periodoId: string,
  anioGravable: number,
): Promise<boolean> {
  if (!RETENCION_OBLIGATORIA) return false

  const admin = createAdminSupabaseClient()

  // 1. ¿Ya existe la certificación para (contrato, año)?
  const { data: cert } = await admin
    .from('certificaciones_retencion')
    .select('id')
    .eq('contrato_id', contratoId)
    .eq('anio_gravable', anioGravable)
    .maybeSingle()
  if (cert) return false

  // 2. ¿Es el primer informe del contrato? Basta con que exista OTRO periodo
  //    que ya haya pasado de borrador (enviado/revisión/aprobado/radicado, o
  //    histórico migrado) para saber que este NO es el primer envío.
  const { count } = await admin
    .from('periodos')
    .select('id', { count: 'exact', head: true })
    .eq('contrato_id', contratoId)
    .neq('id', periodoId)
    .neq('estado', 'borrador')

  const esPrimerInforme = (count ?? 0) === 0
  return esPrimerInforme
}
