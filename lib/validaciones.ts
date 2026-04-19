/**
 * Funciones de validación reutilizables.
 * Módulo puro — no contiene server actions ni imports de servidor.
 * Puede importarse tanto desde client components como desde server actions.
 */

/**
 * Valida el número de planilla PILA.
 * Formato: solo dígitos, 6–20 caracteres (basado en datos reales Colombia).
 * Retorna un mensaje de error o null si es válido.
 */
export function validarNumeroPlanilla(valor: string): string | null {
  const v = valor.trim()
  if (!v) return 'Ingresa el número de planilla'
  if (!/^\d+$/.test(v)) return 'El número de planilla solo puede contener dígitos (ej: 6016087440)'
  if (v.length < 6)  return 'El número de planilla debe tener al menos 6 dígitos'
  if (v.length > 20) return 'El número de planilla no puede superar 20 dígitos'
  return null
}
