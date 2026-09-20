/**
 * Funciones de validación reutilizables.
 * Módulo puro — no contiene server actions ni imports de servidor.
 * Puede importarse tanto desde client components como desde server actions.
 */

/**
 * Valida el número de planilla PILA.
 * Formato: 6–70 caracteres (basado en datos reales Colombia).
 * Retorna un mensaje de error o null si es válido.
 */
export function validarNumeroPlanilla(valor: string): string | null {
  const v = valor.trim()
  if (!v) return 'Ingresa el número de planilla'
  if (v.length < 6)  return 'El número de planilla debe tener al menos 6 caracteres'
  if (v.length > 70) return 'El número de planilla no puede superar 70 caracteres'
  return null
}

/**
 * Hoy en Bogotá, como «YYYY-MM-DD». El servidor corre en UTC.
 *
 * Se exporta para que el tope del selector de fecha y la validación usen el
 * mismo «hoy»: si el navegador pusiera el suyo, un equipo con la zona horaria
 * mal configurada ofrecería días que el servidor después rechaza.
 */
export function hoyBogotaISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * Valida la fecha de pago de la planilla de seguridad social.
 *
 * Es el cuarto dato de la llave con la que el Ministerio de Salud responde si
 * una planilla existe y fue pagada —los otros tres son el tipo y el número de
 * documento del cotizante y el número de planilla—. Se compara contra un día
 * exacto, así que se guarda y se valida como día civil, sin hora ni zona.
 *
 * Dos límites, y nada más:
 *
 *  · No puede ser futura. Un pago que todavía no ocurrió no está en el
 *    sistema del Ministerio, y la fecha se lee de un comprobante que ya
 *    existe. El «hoy» se toma en Bogotá porque el servidor corre en UTC: al
 *    final de la tarde colombiana el UTC ya va por el día siguiente, y esa
 *    diferencia habría rechazado un pago hecho esa misma tarde.
 *
 *  · No puede ser anterior a 2016. Es el año de la Resolución 2388, que fijó
 *    la estructura de planilla vigente. El límite no pretende ser exacto: está
 *    para atrapar el año mal tecleado —1025, 2015 por 2025— que convertiría la
 *    consulta al Ministerio en un «no encontrada» sin causa aparente.
 *
 * Deliberadamente NO comprueba que la fecha caiga cerca del mes del informe.
 * El pago por mes vencido es legal y corriente, y el desfase real lo vigilan
 * las alertas de planilla repetida y el mes de cotización, que ya existen.
 */
export function validarFechaPagoPlanilla(valor: string): string | null {
  const v = valor.trim()
  if (!v) return 'Ingresa la fecha de pago de la planilla'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'La fecha de pago no es válida'

  // `new Date('2026-02-31')` no falla: rueda al 3 de marzo. Se compara el ISO
  // de vuelta para que una fecha inexistente no pase por válida.
  const d = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    return 'La fecha de pago no es válida'
  }

  if (v > hoyBogotaISO()) return 'La fecha de pago no puede ser futura'
  if (v < '2016-01-01')   return 'Revisa la fecha de pago: el año no parece correcto'

  return null
}
