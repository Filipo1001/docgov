/**
 * Un rastro de cada paso de la subida de evidencias, para saber dónde se corta cuando algo falla.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * Si la pestaña se queda sin memoria o se recarga sola, no hay error que registrar: la página simplemente deja de existir y
 * el servidor no se entera. `sendBeacon` sobrevive a eso: cada paso sale hacia el servidor en el momento en que ocurre, y el
 * ÚLTIMO que llegó dice hasta dónde se llegó. También lleva la memoria de JavaScript (donde el navegador la da) para ver si
 * crece.
 *
 * Solo manda pasos y cifras (cuántos archivos, cuántos MB, qué etapa): nunca nombres de archivo, textos ni datos de nadie. Fuera
 * de la vista previa el servidor lo descarta (`app/api/pdm-diagnostico`). Nunca lanza.
 */

export function marcar(paso: string, datos: Record<string, string | number | boolean | null> = {}): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return
    const memoria = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const cuerpo = JSON.stringify({
      paso, datos,
      ruta: location.pathname,
      vp: `${window.innerWidth}x${window.innerHeight}`,
      ua: navigator.userAgent.slice(0, 140),
      mem: memoria ? Math.round(memoria.usedJSHeapSize / 1e6) : null,
    })
    navigator.sendBeacon('/api/pdm-diagnostico', new Blob([cuerpo], { type: 'application/json' }))
  } catch { /* el rastro nunca rompe nada */ }
}

/** Un texto apto para el rastro: corto y solo con letras, números y signos comunes (lo demás se cambia por «?»). Sin nombres de archivo. */
export const limpio = (t: unknown, max = 100): string =>
  String(t ?? '').replace(/«[^»]*»/g, '').slice(0, max).replace(/[^A-Za-z0-9 .:()+,;=%_-]/g, '?')
