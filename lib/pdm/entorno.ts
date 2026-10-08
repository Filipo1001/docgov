/**
 * La regla: ¿admite este entorno el módulo de Plan de Desarrollo?
 *
 * Es una función pura y sin `server-only` a propósito: la leen DOS sitios que
 * no pueden discrepar. El servidor (`habilitado.ts`, que cierra páginas y decide
 * el botón) y el navegador (`menu.ts`, que decide si el layout del panel pinta
 * el marco del módulo). Si cada uno llevara su propia condición, bastaría una
 * diferencia para que, en producción, un 404 saliera vestido con la cabecera
 * de un módulo que no existe allí.
 *
 * Falla hacia lo cerrado: solo dice «sí» cuando puede AFIRMAR vista previa o
 * desarrollo local. Un valor ausente o desconocido es «no» (ver `habilitado.ts`).
 *
 * ── El interruptor de producción ─────────────────────────────────────────
 *
 * En producción el módulo existe SOLO si alguien lo enciende a propósito: la variable
 * `PDM_PRODUCCION` del proyecto en Vercel (entorno Production) con el valor exacto `si`.
 * Así, fusionar el código en `main` no abre nada: el módulo sigue apagado hasta que se
 * encienda, y apagarlo es borrar la variable y volver a desplegar. Cualquier otro valor
 * —vacío, «true», «Si»— es «no»: el interruptor también falla hacia lo cerrado.
 *
 * Las variables se leen al COMPILAR (la copia que usa el navegador) y al ejecutar (el
 * servidor): cambiar la variable exige un despliegue nuevo, y los dos lados la ven igual.
 */
export function entornoPermiteModulo(
  vercelEnv: string | undefined,
  nodeEnv: string | undefined,
  interruptorProduccion?: string | undefined,
): boolean {
  if (vercelEnv === 'preview' || nodeEnv === 'development') return true
  return produccionAbierta(vercelEnv, interruptorProduccion)
}

/** El valor que enciende el módulo en producción. Exacto: cualquier otro lo deja apagado. */
export const PDM_ENCENDIDO = 'si'

/**
 * ¿Está el módulo abierto en PRODUCCIÓN, para la gente real? Es la pregunta que deciden, además de la puerta, los
 * correos (en vista previa solo le llegan a la lista de prueba, porque la vista previa comparte la base real) y el
 * aviso de «vista previa» de la barra.
 */
export function produccionAbierta(vercelEnv: string | undefined, interruptorProduccion: string | undefined): boolean {
  return vercelEnv === 'production' && interruptorProduccion === PDM_ENCENDIDO
}
