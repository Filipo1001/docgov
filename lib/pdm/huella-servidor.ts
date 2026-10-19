import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { huellaDeFlujo } from './huella'

/**
 * Quién calcula la huella y dónde se anota (migración 070).
 *
 * La calcula el SERVIDOR leyendo el archivo ya guardado en el almacenamiento: nada de lo que mande el navegador cuenta.
 * Y se anota en el libro `pdm_huellas`, al que solo escribe la clave de servicio; de ahí la copia el disparador de la
 * base a la evidencia al registrarla, solo si la ruta, el tamaño y la persona coinciden (ver la migración).
 */

export type ResultadoDeHuella = { ok: true; sha256: string; bytes: number } | { ok: false; error: string }

/** Cuánto vale la dirección firmada con que se lee el archivo: lo justo para leerlo una vez. */
const SEGUNDOS_DE_LECTURA = 120

/** Lee el objeto del almacenamiento, trozo a trozo, y devuelve su SHA-256 y su tamaño reales. */
export async function huellaDeObjeto(admin: SupabaseClient, bucket: string, ruta: string): Promise<ResultadoDeHuella> {
  try {
    const firmada = await admin.storage.from(bucket).createSignedUrl(ruta, SEGUNDOS_DE_LECTURA)
    if (firmada.error || !firmada.data?.signedUrl) return { ok: false, error: firmada.error?.message ?? 'sin dirección firmada' }
    const respuesta = await fetch(firmada.data.signedUrl, { cache: 'no-store' })
    if (!respuesta.ok || !respuesta.body) return { ok: false, error: `lectura ${respuesta.status}` }
    // En Node el cuerpo de una respuesta se puede recorrer con `for await`.
    const { sha256, bytes } = await huellaDeFlujo(respuesta.body as unknown as AsyncIterable<Uint8Array>)
    return { ok: true, sha256, bytes }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'lectura fallida' }
  }
}

export interface HuellaCalculada {
  ruta: string
  sha256: string
  bytes: number
}

/**
 * Anota en el libro las huellas de los archivos de una persona. Si la misma ruta ya estaba (un reintento del mismo
 * reporte), se vuelve a escribir: el servidor acaba de leer el archivo y esa es la huella vigente. Devuelve `false` si no
 * se pudo.
 */
export async function anotarHuellas(admin: SupabaseClient, usuarioId: string, huellas: HuellaCalculada[]): Promise<boolean> {
  if (huellas.length === 0) return true
  const { error } = await admin.from('pdm_huellas').upsert(
    huellas.map(h => ({ ruta: h.ruta, sha256: h.sha256, bytes: h.bytes, usuario_id: usuarioId, calculada_en: new Date().toISOString() })),
    { onConflict: 'ruta' },
  )
  if (error) console.error('[pdm/huella] no se pudo anotar el libro:', error.message)
  return !error
}
