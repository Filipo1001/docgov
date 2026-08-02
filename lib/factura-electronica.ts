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

    return {
      exigeFactura: contratista?.obligado_facturar_electronicamente === true,
      facturaUrl: (data as any).factura_electronica_url ?? null,
    }
  } catch {
    return { exigeFactura: false, facturaUrl: null }
  }
}

/** Nombre del archivo dentro de los ZIP de descarga. */
export const NOMBRE_ARCHIVO_FACTURA = 'Factura_Electronica.pdf'
