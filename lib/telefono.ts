/**
 * Normalización de teléfonos colombianos a E.164, para WhatsApp.
 *
 * Nace de un dato concreto de producción: de 70 usuarios con teléfono, solo 53
 * tenían un móvil colombiano bien escrito. Los otros 17 se repartían así:
 * 6 números fijos de 7 dígitos, 5 móviles correctos pero con espacios o
 * paréntesis, 3 de 9 dígitos (falta un dígito), 2 con letras y 1 de 6 dígitos.
 *
 * La distinción que importa —y que el código anterior no hacía— es entre
 * «mal escrito» y «no puede recibir WhatsApp». Un fijo de Fredonia no es un
 * error de digitación: es un número que jamás va a recibir un mensaje, y
 * tratarlo como fallo de envío manda a buscar un problema que no existe.
 * Por eso `normalizarTelefono` no devuelve `null` a secas, sino el motivo.
 */

/** Móvil colombiano: 10 dígitos que empiezan por 3. */
const MOVIL_COL = /^3\d{9}$/

export type TelefonoNormalizado =
  | { ok: true; e164: string }
  | { ok: false; motivo: 'vacio' | 'fijo' | 'invalido' }

/**
 * Devuelve el número en E.164 sin el «+» (formato que espera la API de
 * WhatsApp Cloud: `573001234567`).
 */
export function normalizarTelefono(bruto: string | null | undefined): TelefonoNormalizado {
  if (!bruto || !bruto.trim()) return { ok: false, motivo: 'vacio' }

  // Fuera todo lo que no sea dígito: cubre espacios, paréntesis, guiones y
  // los dos registros con letras.
  let d = bruto.replace(/\D/g, '')

  // Prefijo internacional, con o sin el 0 de salida o el 00.
  if (d.startsWith('0057')) d = d.slice(4)
  else if (d.startsWith('057')) d = d.slice(3)
  else if (d.startsWith('57') && d.length > 10) d = d.slice(2)

  if (MOVIL_COL.test(d)) return { ok: true, e164: `57${d}` }

  // Un fijo colombiano son 7 dígitos (o 8 con indicativo). No es un error de
  // digitación: es un número que no puede recibir WhatsApp.
  if (d.length === 7 || (d.length === 8 && !d.startsWith('3'))) {
    return { ok: false, motivo: 'fijo' }
  }

  return { ok: false, motivo: 'invalido' }
}

/** ¿Este número puede recibir WhatsApp? Atajo para la interfaz. */
export function puedeRecibirWhatsApp(bruto: string | null | undefined): boolean {
  return normalizarTelefono(bruto).ok
}

/** Explicación corta para mostrarle a quien administra los usuarios. */
export function motivoTelefonoInvalido(motivo: 'vacio' | 'fijo' | 'invalido'): string {
  switch (motivo) {
    case 'vacio':   return 'Sin teléfono registrado'
    case 'fijo':    return 'Es un número fijo: no puede recibir WhatsApp'
    case 'invalido': return 'El número no parece un móvil colombiano válido'
  }
}
