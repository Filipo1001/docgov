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
 */
export function entornoPermiteModulo(
  vercelEnv: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  return vercelEnv === 'preview' || nodeEnv === 'development'
}
