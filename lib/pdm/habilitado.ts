import 'server-only'

/**
 * ¿Existe hoy el módulo de Plan de Desarrollo en este entorno?
 *
 * ── Una sola fuente de verdad ────────────────────────────────────────────
 *
 * El botón de la barra lateral y la página a la que lleva preguntan lo mismo,
 * aquí. Antes cada uno tenía su propia condición, y con dos condiciones basta
 * una discrepancia para dejar un botón que lleva a un 404 —o, peor, una página
 * accesible sin botón—. Con una sola función no pueden discrepar.
 *
 * ── Falla hacia lo cerrado ───────────────────────────────────────────────
 *
 * Solo responde «sí» cuando puede AFIRMAR que está en vista previa o en
 * desarrollo local. Si `VERCEL_ENV` no llega —porque el proyecto no exponga
 * las variables del sistema, o por cualquier otra razón—, la respuesta es «no».
 * Lo contrario (`!== 'production'`) trataría lo desconocido como permitido, y
 * un módulo en construcción aparecería en producción justo el día en que
 * alguien fusione la rama sin acordarse de esto.
 *
 * El coste de equivocarse hacia el lado cerrado es que en la vista previa no se
 * vea el botón y haya que decirlo. El de equivocarse hacia el otro lado es un
 * módulo a medias frente a usuarios reales de una alcaldía.
 *
 * Dejará de existir cuando el módulo se abra en producción de forma
 * deliberada: ese día esta función pasa a leer una habilitación por usuario.
 */
export function pdmHabilitado(): boolean {
  return process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development'
}
