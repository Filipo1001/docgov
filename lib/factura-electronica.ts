import 'server-only'

/**
 * Cuenta de Cobro vs. factura electrónica.
 *
 * Para un puñado de contratistas —los obligados a facturar electrónicamente
 * ante la DIAN— la Cuenta de Cobro NO se genera: la sustituye el PDF de su
 * factura, que ellos adjuntan al periodo. Todo lo demás del flujo documental
 * queda igual.
 *
 * La condición se consulta desde ocho sitios distintos (cuatro rutas de
 * descarga, la validación de envío, la pantalla del periodo y las acciones de
 * carga). Vive aquí para que ninguno la reescriba a su manera: si mañana la
 * regla cambia —por ejemplo, si pasa a depender del contrato y no de la
 * persona— hay un solo lugar que tocar.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export const FACTURA_BUCKET = 'documentos'
export const FACTURA_MAX_BYTES = 15 * 1024 * 1024

export interface EstadoFactura {
  /** El contratista de este periodo factura electrónicamente. */
  exigeFactura: boolean
  /** Ruta del PDF ya adjuntado, si lo hay. */
  facturaUrl: string | null
}

/**
 * Periodos anteriores a la marca.
 *
 * Cuando a un contratista se le activa la obligación de facturar, sus periodos
 * YA CERRADOS no se tocan: si su Cuenta de Cobro se emitió —existe un código de
 * verificación para ella—, ese documento se generó, se selló con QR y pudo
 * entregarse impreso. Dejar de servirlo lo volvería indescargable y rompería un
 * expediente ya archivado.
 *
 * Un documento ya emitido no se reescribe. La sustitución aplica de ahí en
 * adelante.
 */
async function cuentaDeCobroYaEmitida(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  periodoId: string,
): Promise<boolean> {
  const { count } = await admin
    .from('documentos_emitidos')
    .select('id', { count: 'exact', head: true })
    .eq('periodo_id', periodoId)
    .eq('tipo', 'cuenta-cobro')
  return (count ?? 0) > 0
}

/**
 * Resuelve la condición para un periodo concreto.
 *
 * Devuelve `exigeFactura: false` ante cualquier fallo de consulta: si no se
 * puede determinar, lo seguro es el camino de siempre —generar la Cuenta de
 * Cobro— y no dejar al contratista sin ningún documento de cobro.
 */
export async function estadoFacturaPeriodo(periodoId: string): Promise<EstadoFactura> {
  try {
    const admin = createAdminSupabaseClient()
    const { data } = await admin
      .from('periodos')
      .select('factura_electronica_url, contrato:contratos(contratista:usuarios!contratos_contratista_id_fkey(obligado_facturar_electronicamente))')
      .eq('id', periodoId)
      .single()

    if (!data) return { exigeFactura: false, facturaUrl: null }

    // Supabase devuelve las relaciones anidadas como objeto o array de uno
    // según cómo infiera la cardinalidad.
    const primero = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const contrato = primero<any>((data as any).contrato)
    const contratista = contrato ? primero<any>(contrato.contratista) : null

    const obligado = contratista?.obligado_facturar_electronicamente === true
    const facturaUrl = (data as any).factura_electronica_url ?? null

    // Si ya se emitió la Cuenta de Cobro de este periodo, ese documento manda:
    // el cambio aplica a los periodos siguientes, no a los ya cerrados.
    if (obligado && !facturaUrl && await cuentaDeCobroYaEmitida(admin, periodoId)) {
      return { exigeFactura: false, facturaUrl: null }
    }

    return { exigeFactura: obligado, facturaUrl }
  } catch {
    return { exigeFactura: false, facturaUrl: null }
  }
}

/** Nombre del archivo dentro de los ZIP de descarga. */
export const NOMBRE_ARCHIVO_FACTURA = 'Factura_Electronica.pdf'
