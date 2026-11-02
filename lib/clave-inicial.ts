/**
 * La contraseña inicial es la cédula (lib/password-inicial.ts), y una cuenta que todavía la tiene debe cambiarla antes de
 * seguir. Este archivo es el vocabulario común de ese cambio obligatorio: la marca, quién la tiene y qué se acepta como
 * contraseña nueva.
 *
 * ── Por qué existe (auditoría del 2-nov-2026) ────────────────────────────
 *
 * 94 de 124 contratistas, 3 de 5 secretarios, el alcalde y contratación seguían con la cédula como contraseña, meses
 * después de entrar. La decisión de usar la cédula se mantiene —quien crea la cuenta no tiene nada que transmitir—, pero
 * lo que la hacía tolerable era que «cambiarla estaba disponible», y nadie lo hacía. Ahora no es opcional.
 *
 * ── Cómo se marca ────────────────────────────────────────────────────────
 *
 * Con una bandera en `app_metadata` de la cuenta de acceso (`debe_cambiar_clave`). Solo el servidor la escribe
 * (`app_metadata` no se puede editar con una sesión de usuario), viaja dentro del token, y el middleware la lee sin
 * llamar a la red. Se pone al crear la cuenta, cuando alguien de administración le fija una contraseña a otra persona y
 * en la migración 083 para las cuentas que ya estaban así; se quita cuando la persona elige la suya.
 */

import { passwordInicialDesdeCedula } from '@/lib/password-inicial'

/** Nombre de la bandera en `app_metadata`. */
export const MARCA_CLAVE_INICIAL = 'debe_cambiar_clave'

/** Lo que se le pasa a `auth.admin.createUser` / `updateUserById` para marcar una cuenta. */
export const APP_METADATA_CLAVE_INICIAL = { [MARCA_CLAVE_INICIAL]: true } as const

/** ¿Esta cuenta debe cambiar su contraseña? Acepta el `app_metadata` tal como llega del token o de la API. */
export function debeCambiarClave(appMetadata: unknown): boolean {
  return typeof appMetadata === 'object' && appMetadata !== null
    && (appMetadata as Record<string, unknown>)[MARCA_CLAVE_INICIAL] === true
}

export const LARGO_MINIMO_CLAVE = 8

/** Corridas que no son una contraseña: 12345678, 87654321, abcdefgh. */
function esCorrida(s: string): boolean {
  if (s.length < 4) return false
  let sube = true
  let baja = true
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1)
    if (d !== 1) sube = false
    if (d !== -1) baja = false
  }
  return sube || baja
}

/**
 * Valida la contraseña nueva. Devuelve el mensaje para la persona, o `null` si sirve.
 *
 * Lo que rechaza es lo que un atacante probaría primero: la cédula (que es justo lo que se está dejando), un solo
 * carácter repetido y las corridas obvias. No impone mayúsculas ni símbolos: una regla de composición hace que la gente
 * escriba «Contrasena1!» y la olvide; el largo y no ser adivinable aportan más.
 */
export function validarClaveNueva(nueva: string, confirmacion: string, cedula: string | null | undefined): string | null {
  if (nueva.length < LARGO_MINIMO_CLAVE) return `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`
  if (nueva !== confirmacion) return 'Las contraseñas no coinciden.'

  const digitos = (cedula ?? '').replace(/\D/g, '')
  const inicial = passwordInicialDesdeCedula(cedula ?? '')
  if (digitos && (nueva === digitos || nueva === inicial)) {
    return 'No puede ser tu número de documento: es la contraseña que te dimos al crear tu cuenta.'
  }
  if (new Set(nueva).size === 1) return 'Elige una contraseña que no sea un solo carácter repetido.'
  if (esCorrida(nueva.toLowerCase())) return 'Elige una contraseña que no sea una secuencia como 12345678.'
  return null
}
