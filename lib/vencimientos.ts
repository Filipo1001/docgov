/**
 * Contratos por vencer: la lógica del resumen semanal que reemplaza al correo «uno por contrato».
 *
 * Antes (R7 del cron de recordatorios) salía un correo por cada contrato que cumplía EXACTAMENTE 60 o 30 días para
 * vencer. Como casi todos terminan a fin de año (36 el 31-dic, 31 el 30-dic, 18 el 30-nov), el 31-oct y el 1-nov
 * cada administrador recibió 85 correos iguales, y en 30 días fueron 96 a administración, 96 a contratación y 96 entre
 * los cinco secretarios. Ahora los lunes sale UN correo por persona, con la lista, solo si hay algo.
 *
 * Las ventanas son de siete días y consecutivas, así que cada contrato cae exactamente una vez en cada una sin
 * guardar estado: el lunes D mira a quienes les quedan de 54 a 60 días («60») y de 24 a 30 («30»); el lunes D+7, de
 * 61 a 67 y de 31 a 37. Cada fila dice los días que de verdad le quedan, no el umbral.
 */

export interface ContratoPorVencer {
  numero: string
  contratista: string
  /** Fecha pactada de fin (YYYY-MM-DD). Los terminados antes de tiempo no llegan aquí. */
  fechaFin: string
  supervisorId: string | null
}

export interface FilaVencimiento {
  numero: string
  contratista: string
  fechaFin: string
  /** Días que faltan desde hoy hasta la fecha de fin. */
  dias: number
}

/** Lo que viaja a la plantilla del correo. */
export interface DatosVencimientos {
  /** Los que ya están a 30 días o menos (entraron esta semana en la ventana de 30). */
  en30: FilaVencimiento[]
  /** Los que entraron esta semana en la ventana de 60. */
  en60: FilaVencimiento[]
}

const DIA_MS = 86_400_000

/** ISO date a N días de otra (calculado en UTC al mediodía: no depende de la zona del servidor). */
export function fechaMasDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.round((Date.parse(hastaIso.slice(0, 10) + 'T12:00:00Z') - Date.parse(desdeIso + 'T12:00:00Z')) / DIA_MS)
}

export function esLunes(iso: string): boolean {
  return new Date(iso + 'T12:00:00Z').getUTCDay() === 1
}

/** Las dos ventanas del lunes `iso`, con sus extremos incluidos. */
export function ventanasSemana(iso: string) {
  return {
    en60: { desde: fechaMasDias(iso, 54), hasta: fechaMasDias(iso, 60) },
    en30: { desde: fechaMasDias(iso, 24), hasta: fechaMasDias(iso, 30) },
  }
}

/** Rango que cubre las dos ventanas: una sola consulta y luego se reparte en memoria. */
export function rangoDeConsulta(iso: string) {
  const v = ventanasSemana(iso)
  return { desde: v.en30.desde, hasta: v.en60.hasta }
}

/**
 * Reparte los contratos en las dos ventanas.
 *
 * `yaAvisados` evita repetir lo que el sistema anterior ya avisó con su correo por contrato: claves `numero|60` y
 * `numero|30`. Solo importa en la transición (el primer lunes después del cambio vuelve a mirar los de diciembre,
 * que el 31-oct y el 1-nov ya recibieron su aviso de 60 días).
 */
export function repartirVencimientos(
  contratos: ContratoPorVencer[],
  hoy: string,
  yaAvisados: ReadonlySet<string> = new Set(),
): DatosVencimientos {
  const v = ventanasSemana(hoy)
  const fila = (c: ContratoPorVencer): FilaVencimiento => ({
    numero: c.numero, contratista: c.contratista, fechaFin: c.fechaFin, dias: diasEntre(hoy, c.fechaFin),
  })
  const entre = (f: string, w: { desde: string; hasta: string }) => f >= w.desde && f <= w.hasta
  const orden = (a: FilaVencimiento, b: FilaVencimiento) => a.fechaFin.localeCompare(b.fechaFin) || a.numero.localeCompare(b.numero, 'es', { numeric: true })

  const en30 = contratos.filter(c => entre(c.fechaFin, v.en30) && !yaAvisados.has(`${c.numero}|30`)).map(fila).sort(orden)
  const en60 = contratos.filter(c => entre(c.fechaFin, v.en60) && !yaAvisados.has(`${c.numero}|60`)).map(fila).sort(orden)
  return { en30, en60 }
}

/** Los contratos que le tocan a esa persona: quien gestiona ve todos; un secretario, solo los suyos. */
export function paraDestinatario(contratos: ContratoPorVencer[], personaId: string, veTodos: boolean): ContratoPorVencer[] {
  return veTodos ? contratos : contratos.filter(c => c.supervisorId === personaId)
}

export function totalVencimientos(d: DatosVencimientos): number {
  return d.en30.length + d.en60.length
}

/** El texto plano de la campana: corto, y dice a dónde ir. */
export function mensajeCampana(d: DatosVencimientos): string {
  const partes: string[] = []
  if (d.en30.length) partes.push(`${d.en30.length} ${d.en30.length === 1 ? 'vence' : 'vencen'} en 30 días o menos`)
  if (d.en60.length) partes.push(`${d.en60.length} ${d.en60.length === 1 ? 'vence' : 'vencen'} en unos 60 días`)
  return `${partes.join(' y ')}. Si alguno continuará, es momento de tramitar la prórroga u otrosí. La lista completa está en tu correo y en Contratos.`
}
