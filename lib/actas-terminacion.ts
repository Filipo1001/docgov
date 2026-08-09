import 'server-only'
import { createAdminSupabaseClient } from './supabase-admin'

/**
 * ¿Debe exigirse el Acta de Terminación antes de este envío?
 *
 * Espejo de `certificacionPendiente`: aquella se pide en el PRIMER informe del
 * contrato, esta en el ÚLTIMO. Se exige solo cuando:
 *
 *   1. Aún no existe acta para el contrato (es única: se termina una vez), y
 *   2. Este periodo es genuinamente el último.
 *
 * ── Qué cuenta como "el último" ──────────────────────────────────────────
 *
 * Dos condiciones, y la segunda es la que protege:
 *
 *   a) Ningún otro periodo del contrato tiene un `numero_periodo` mayor.
 *   b) Este periodo ALCANZA el fin contractual (`fecha_fin >= contrato.fecha_fin`).
 *
 * La (b) existe por los otrosíes. Un otrosí puede prorrogar el plazo, y los
 * periodos nuevos no aparecen en el mismo instante: entre la prórroga y su
 * generación, el último periodo existente deja de alcanzar el fin del contrato.
 * Sin la (b) le pediríamos al contratista firmar la terminación de un contrato
 * que acaba de ser extendido.
 *
 * El sesgo es deliberado: ante la duda, NO se pide. Que un acta se firme un mes
 * tarde es un trámite; que se firme la terminación de un contrato vigente es un
 * problema jurídico.
 */
export async function actaTerminacionPendiente(
  contratoId: string,
  periodoId: string,
): Promise<boolean> {
  const admin = createAdminSupabaseClient()

  // 1. ¿Ya existe el acta de este contrato?
  const { data: acta } = await admin
    .from('actas_terminacion')
    .select('id')
    .eq('contrato_id', contratoId)
    .maybeSingle()
  if (acta) return false

  // 2. Datos del periodo y del contrato para decidir si es el último.
  const [{ data: periodo }, { data: contrato }] = await Promise.all([
    admin.from('periodos').select('numero_periodo, fecha_fin').eq('id', periodoId).maybeSingle(),
    admin.from('contratos').select('fecha_fin').eq('id', contratoId).maybeSingle(),
  ])
  if (!periodo || !contrato?.fecha_fin) return false

  // (a) ¿Hay algún periodo posterior?
  const { count: posteriores } = await admin
    .from('periodos')
    .select('id', { count: 'exact', head: true })
    .eq('contrato_id', contratoId)
    .gt('numero_periodo', periodo.numero_periodo as number)
  if ((posteriores ?? 0) > 0) return false

  // (b) ¿Este periodo llega al fin del contrato?
  return (periodo.fecha_fin as string) >= (contrato.fecha_fin as string)
}

/**
 * Fecha de terminación que se congelará en el acta: la del contrato.
 *
 * Se lee en el momento de aceptar y se guarda en la fila, de modo que una
 * prórroga posterior no altere un acta ya emitida — la misma regla que rige
 * para el resto de documentos del sistema: lo ya emitido no se reescribe.
 */
export async function fechaTerminacionContrato(contratoId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('contratos')
    .select('fecha_fin')
    .eq('id', contratoId)
    .maybeSingle()
  return (data?.fecha_fin as string) ?? null
}
