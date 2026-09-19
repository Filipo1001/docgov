import 'server-only'
import { createAdminSupabaseClient } from './supabase-admin'

// Reactivada en septiembre de 2026, con el municipio entero entrando al
// sistema: la carta debe acompañar la primera cuenta de cobro por norma, y
// hasta ahora se firmaba en papel y quedaba imposible de encontrar. Con esto
// el sistema la emite, la verifica y la guarda en el expediente.
const RETENCION_OBLIGATORIA = true

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

/** Nombre con el que la carta entra en los paquetes ZIP. */
export const NOMBRE_ARCHIVO_CERTIFICACION = 'Certificacion_de_Retencion.pdf'

/**
 * La carta de no retención que debe viajar DENTRO del paquete de este periodo,
 * o `null` si a este periodo no le corresponde.
 *
 * ── Por qué hace falta ───────────────────────────────────────────────────
 *
 * La carta se emitía, se verificaba y se podía descargar suelta, pero no
 * entraba en ningún ZIP: ni en el de SECOP —el que arma la contratista para
 * radicar— ni en el paquete completo del supervisor. O sea que el documento
 * que por norma acompaña a la PRIMERA cuenta de cobro había que acordarse de
 * bajarlo aparte y adjuntarlo a mano, que es exactamente lo que se hacía
 * cuando la carta se firmaba en papel.
 *
 * ── Por qué solo en un periodo ───────────────────────────────────────────
 *
 * La carta es una por contrato y año gravable, y la norma la pide con la
 * primera cuenta. Metida en los doce paquetes del año sería un documento
 * repetido once veces dentro del expediente, y quien reciba el paquete de
 * octubre no sabría si esa carta es de octubre o de enero.
 *
 * ── Cuál es «el primero», que no es el que parece ────────────────────────
 *
 * NO es el de menor `numero_periodo`. Casi todos los contratos arrancaron en
 * enero y entraron al sistema en julio, así que sus periodos 1 a 6 existen
 * pero están en borrador y nunca saldrán de ahí: se pagaron por fuera. De las
 * catorce cartas emitidas, las catorce tienen su periodo #1 en borrador — con
 * ese criterio la carta no habría aparecido en un solo ZIP, porque el
 * paquete solo se genera desde `aprobado`.
 *
 * El portador es el primer periodo que SALIÓ de borrador, por `fecha_envio`.
 * Es además donde la carta se aceptó de verdad: `certificacionPendiente` se
 * evalúa al enviar, así que el primer envío y la firma del juramento son el
 * mismo acto. Con esta regla trece de las catorce quedan dentro de un paquete
 * descargable, y la catorceava en cuanto se apruebe su periodo.
 *
 * Se acota al año porque la carta está indexada por (contrato, año): un
 * contrato que cruzara de diciembre a enero tendría dos cartas, y cada una
 * debe salir con la primera cuenta de SU año.
 *
 * La pantalla del periodo usa esta MISMA función para decidir si enseña la
 * tarjeta de descarga, de modo que lo que se ve y lo que va en el ZIP no
 * puedan discrepar.
 */
export async function certificacionParaPaquete(periodoId: string): Promise<string | null> {
  if (!RETENCION_OBLIGATORIA) return null

  const admin = createAdminSupabaseClient()

  const { data: periodo } = await admin
    .from('periodos')
    .select('contrato_id, anio, fecha_envio')
    .eq('id', periodoId)
    .single()
  if (!periodo) return null
  // Un periodo que nunca se envió no puede ser el portador de nada.
  if (!periodo.fecha_envio) return null

  const { data: cert } = await admin
    .from('certificaciones_retencion')
    .select('pdf_path')
    .eq('contrato_id', periodo.contrato_id)
    .eq('anio_gravable', periodo.anio)
    .maybeSingle()
  if (!cert?.pdf_path) return null

  const { data: primero } = await admin
    .from('periodos')
    .select('id')
    .eq('contrato_id', periodo.contrato_id)
    .eq('anio', periodo.anio)
    .not('fecha_envio', 'is', null)
    .order('fecha_envio', { ascending: true })
    .limit(1)
    .maybeSingle()

  return primero?.id === periodoId ? cert.pdf_path : null
}

export async function adjuntarCertificacion(
  periodoId: string,
  poner: (nombre: string, contenido: Buffer) => void,
): Promise<void> {
  try {
    const path = await certificacionParaPaquete(periodoId)
    if (!path) return
    const { data: blob } = await createAdminSupabaseClient()
      .storage.from('certificaciones').download(path)
    if (blob) poner(NOMBRE_ARCHIVO_CERTIFICACION, Buffer.from(await blob.arrayBuffer()))
  } catch { /* el paquete sale sin la carta */ }
}
