import 'server-only'

/**
 * lib/expediente-contrato.ts — el contrato dentro del paquete de SECOP.
 *
 * ── Por qué ──────────────────────────────────────────────────────────────
 *
 * El expediente de legalización acompaña por norma a la PRIMERA cuenta de
 * cobro. Hasta ahora se quedaba archivado en la pantalla del contrato y había
 * que acordarse de bajarlo aparte y adjuntarlo a mano — el mismo trabajo
 * manual que el sistema venía a quitar.
 *
 * ── Por qué solo en un periodo ───────────────────────────────────────────
 *
 * Es uno por contrato y pesa lo que pesa: mediana de 104 páginas y 6,8 MB,
 * hasta 16,7 MB el mayor. Metido en los doce paquetes del año serían once
 * copias del mismo tocho dentro del expediente, y descargas de 20 MB cada mes
 * para quien está en un teléfono.
 *
 * El portador es el primer periodo que SALIÓ de borrador, por `fecha_envio`.
 * Es la misma regla que la carta de no retención, y por el mismo motivo: casi
 * todos los contratos arrancaron en enero y entraron al sistema en julio, así
 * que sus periodos 1 a 6 existen pero están en borrador y nunca saldrán de
 * ahí. Tomar «el de menor número» dejaría el documento en una pantalla a la
 * que nadie entra.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/** Nombre con el que el expediente entra en el ZIP. */
export const NOMBRE_ARCHIVO_CONTRATO = 'Contrato.pdf'

/**
 * El contrato ya descargado, listo para meter en un ZIP, o `null` si a este
 * periodo no le toca.
 *
 * Devuelve el contenido en vez de recibir un callback para poder lanzarlo en
 * paralelo con la generación de los PDF, que es lo que tarda.
 *
 * No lanza: si el depósito falla, el paquete sale sin él. Un ZIP incompleto se
 * vuelve a bajar; un 500 deja a la contratista sin nada el día que radica.
 */
export async function descargarContratoDelPaquete(
  periodoId: string,
): Promise<Buffer | null> {
  try {
    const admin = createAdminSupabaseClient()

    const { data: periodo } = await admin
      .from('periodos')
      .select('contrato_id, anio, fecha_envio')
      .eq('id', periodoId)
      .single()
    if (!periodo?.fecha_envio) return null

    const { data: primero } = await admin
      .from('periodos')
      .select('id')
      .eq('contrato_id', periodo.contrato_id)
      .not('fecha_envio', 'is', null)
      .order('fecha_envio', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (primero?.id !== periodoId) return null

    const { data: doc } = await admin
      .from('documentos_adjuntos')
      .select('storage_path')
      .eq('entidad_tipo', 'contrato')
      .eq('entidad_id', periodo.contrato_id)
      .eq('tipo_documento', 'contrato')
      .is('eliminado_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!doc?.storage_path) return null

    const { data: blob } = await admin.storage.from('adjuntos').download(doc.storage_path)
    return blob ? Buffer.from(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}
