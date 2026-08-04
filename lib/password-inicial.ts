/**
 * Contraseña inicial de una cuenta nueva: su número de cédula.
 *
 * Decisión operativa, no técnica. Antes se generaba una clave aleatoria que
 * alguien tenía que copiar y hacer llegar a cada contratista; en la práctica
 * eso se convertía en mensajes de WhatsApp con la clave escrita y llamadas
 * pidiendo que la repitieran. Con la cédula, quien crea la cuenta ya no tiene
 * nada que transmitir: el contratista sabe su número.
 *
 * Es un dato adivinable, y por eso el sistema mantiene el cambio de contraseña
 * disponible desde el perfil. La protección real está en que la cuenta no da
 * acceso a nada de otro contratista: las políticas de la base de datos limitan
 * cada sesión a sus propios contratos.
 *
 * Supabase exige al menos 6 caracteres. Las cédulas colombianas tienen entre 8
 * y 10 dígitos, pero un NIT corto o un dato mal digitado podrían quedarse por
 * debajo, así que se rellena para que la creación no falle por eso.
 */

const LARGO_MINIMO = 6

export function passwordInicialDesdeCedula(cedula: string): string {
  const limpia = (cedula ?? '').replace(/\D/g, '')
  if (!limpia) return ''
  return limpia.length >= LARGO_MINIMO ? limpia : limpia.padStart(LARGO_MINIMO, '0')
}
