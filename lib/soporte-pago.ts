/**
 * Soporte del pago de la seguridad social: el segundo documento que Hacienda pide junto a la planilla.
 *
 * Es otro archivo por periodo (`periodos.soporte_pago_url`), de la misma familia que la planilla y la factura
 * electrónica: PDF en el bucket privado `documentos`, subida directa del navegador con URL prefirmada, y registro por
 * el cliente administrador. Se revisa junto con la planilla (un solo `planilla_estado`) y va al paquete de SECOP justo
 * después de ella.
 */
export const SOPORTE_PAGO_BUCKET = 'documentos'
export const SOPORTE_PAGO_MAX_BYTES = 10 * 1024 * 1024

/** Nombre del archivo dentro del paquete: sigue a `Planilla_Seguridad_Social.pdf` en el listado. */
export const NOMBRE_ARCHIVO_SOPORTE_PAGO = 'Soporte_Pago_Seguridad_Social.pdf'

/** Carpeta del periodo dentro del bucket. Solo se aceptan rutas que cuelguen de ella. */
export function prefijoSoportePago(periodoId: string): string {
  return `soportes-pago/${periodoId}/`
}

/** Ruta nueva para un archivo subido ahora. */
export function rutaNuevaSoportePago(periodoId: string, ahora: number = Date.now()): string {
  return `${prefijoSoportePago(periodoId)}${ahora}.pdf`
}

/**
 * ¿Esta ruta pertenece a ESTE periodo? La subida va directa del navegador a Storage, así que la ruta que llega al
 * confirmar la manda el cliente: una que apunte al soporte de otro periodo, o que se escape de la carpeta con `..`,
 * se rechaza.
 */
export function esRutaDeSoportePago(periodoId: string, ruta: string): boolean {
  if (!ruta.startsWith(prefijoSoportePago(periodoId))) return false
  const resto = ruta.slice(prefijoSoportePago(periodoId).length)
  return /^[\w.-]+\.pdf$/i.test(resto) && !resto.includes('..')
}

export function esNombrePdf(nombre: string): boolean {
  return (nombre.split('.').pop()?.toLowerCase() ?? '') === 'pdf'
}
