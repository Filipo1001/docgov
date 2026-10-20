import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generarConstanciaPdf } from './constancia-documento'
import { armarPaquete, type EvidenciaParaPaquete, type ResultadoDePaquete } from './paquete'

/**
 * El paquete ZIP de una versión de reporte, del lado del servidor.
 *
 * QUIÉN VE QUÉ: la lista de archivos se lee con la SESIÓN de quien pide (seguridad por filas): si la base no le muestra una
 * evidencia, no entra al paquete —lo mismo que al abrir una evidencia suelta (`urlEvidencia`)—. Solo después se firma cada
 * archivo y se lee con la clave de servicio, porque el espacio de archivos es privado y sin políticas.
 */

const BUCKET = 'pdm-evidencias'
/** Cuánto vale la dirección firmada con que se lee cada archivo: lo justo para leerlo una vez. */
const SEGUNDOS_DE_LECTURA = 120

async function leerDeAlmacenamiento(admin: SupabaseClient, ruta: string): Promise<Uint8Array> {
  const firmada = await admin.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_DE_LECTURA)
  if (firmada.error || !firmada.data?.signedUrl) throw new Error(firmada.error?.message ?? 'sin dirección firmada')
  const r = await fetch(firmada.data.signedUrl, { cache: 'no-store' })
  if (!r.ok) throw new Error(`lectura ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}

export type PaqueteConstruido =
  | { ok: true; codigo: string; resultado: Extract<ResultadoDePaquete, { ok: true }> }
  | { ok: false; estado: 500 | 502; error: string }

export async function construirPaquete(sesion: SupabaseClient, reporteId: string): Promise<PaqueteConstruido> {
  const { data, error } = await sesion
    .from('pdm_evidencias')
    .select('ruta, nombre, tipo, bytes, sha256')
    .eq('reporte_id', reporteId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    console.error('[pdm/paquete] no se pudieron leer los archivos:', error.message)
    return { ok: false, estado: 500, error: 'No se pudo generar el paquete.' }
  }
  const evidencias: EvidenciaParaPaquete[] = (data ?? []).map(e => ({
    ruta: String(e.ruta), nombre: String(e.nombre), tipo: String(e.tipo), bytes: Number(e.bytes) || 0, sha256: typeof e.sha256 === 'string' ? e.sha256 : null,
  }))

  const constancia = await generarConstanciaPdf(reporteId)
  if (!constancia.ok) return { ok: false, estado: 500, error: constancia.error }

  const admin = createAdminSupabaseClient()
  const resultado = await armarPaquete({
    codigo: constancia.codigo, url: constancia.url, constanciaPdf: constancia.pdf, generadoEn: constancia.generadaEn, evidencias,
    leer: ruta => leerDeAlmacenamiento(admin, ruta),
  })
  if (!resultado.ok) return { ok: false, estado: 502, error: resultado.error }
  return { ok: true, codigo: constancia.codigo, resultado }
}
