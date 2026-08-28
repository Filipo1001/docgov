'use server'

/**
 * DIAGNÓSTICO TEMPORAL — retirar tras resolver el bug del dashboard.
 *
 * El dashboard del preview se queda en skeleton aunque sus peticiones a
 * Supabase devuelven 200. No podemos ver la consola del navegador del
 * usuario, así que el cliente nos manda aquí una foto de su estado interno
 * (estado de las queries de TanStack, conectividad, sesión) y la escribimos
 * en los logs de la función, que sí son legibles desde la CLI de Vercel.
 */
export async function reportarDiagnosticoDashboard(payload: unknown): Promise<{ ok: boolean }> {
  try {
    console.log('[diagnostico-dashboard]', JSON.stringify(payload).slice(0, 6000))
  } catch {
    console.log('[diagnostico-dashboard] payload no serializable')
  }
  return { ok: true }
}
