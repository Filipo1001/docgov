import 'server-only'
import { randomInt } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { esCodigoPdm, generarCodigoPdm, leerConstancia, normalizarCodigo, type ConstanciaPublica } from './constancia'

/**
 * La constancia de una versión de reporte, del lado del servidor (migración 072).
 *
 * Todo va con la CLAVE DE SERVICIO: la tabla y las dos funciones solo las alcanza el servidor. Quién puede pedir la constancia
 * (la ruta que genera el PDF lo comprueba con la sesión de quien la pide) y qué ve el público (lo decide la base:
 * `pdm_constancia_publica`) NO se deciden aquí.
 */

const INTENTOS = 6

/**
 * El código de una versión de reporte: el que ya tiene o uno nuevo. Idempotente y a prueba de carreras (lo decide la base:
 * una versión tiene un solo código). Un código al azar que ya existiera —de otra versión— se vuelve a intentar con otro.
 */
export async function emitirConstancia(reporteId: string): Promise<{ ok: true; codigo: string } | { ok: false; error: string }> {
  const admin = createAdminSupabaseClient()
  for (let i = 0; i < INTENTOS; i++) {
    const { data, error } = await admin.rpc('pdm_constancia_emitir', { p_reporte: reporteId, p_codigo: generarCodigoPdm(randomInt) })
    if (!error && typeof data === 'string' && esCodigoPdm(data)) return { ok: true, codigo: data }
    // 23505 = el código elegido ya era de otra versión: se prueba con otro. Cualquier otro error es una falla real.
    if (error && error.code !== '23505') {
      console.error('[pdm/constancia] no se pudo emitir:', error.message)
      return { ok: false, error: 'No se pudo emitir el código de la constancia.' }
    }
  }
  return { ok: false, error: 'No se pudo generar un código único para la constancia.' }
}

export type LecturaDeConstancia =
  | { estado: 'ok'; constancia: ConstanciaPublica }
  | { estado: 'no_existe' }
  | { estado: 'error' }

/**
 * Lo que la página pública sabe de un código. Distingue «no existe» de «no se pudo leer»: decir que un código no existe cuando
 * lo que falló fue la lectura sería decirle a quien tiene un documento válido que podría ser falso.
 */
export async function cargarConstanciaPublica(codigo: string): Promise<LecturaDeConstancia> {
  const c = normalizarCodigo(codigo)
  if (!esCodigoPdm(c)) return { estado: 'no_existe' }
  try {
    const { data, error } = await createAdminSupabaseClient().rpc('pdm_constancia_publica', { p_codigo: c })
    if (error) {
      console.error('[pdm/constancia] no se pudo leer:', error.message)
      return { estado: 'error' }
    }
    if (data === null || data === undefined) return { estado: 'no_existe' }
    const constancia = leerConstancia(data)
    return constancia ? { estado: 'ok', constancia } : { estado: 'error' }
  } catch (e) {
    console.error('[pdm/constancia] fallo al leer:', e instanceof Error ? e.message : e)
    return { estado: 'error' }
  }
}
