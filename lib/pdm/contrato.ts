/**
 * Qué decir del contrato de una persona: cuál, y si sigue en pie.
 *
 * ── Por qué se calcula por fecha y no se lee `estado` ────────────────────
 *
 * En la base los 160 contratos tienen `estado = 'vigente'`, y 56 de ellos ya
 * pasaron su fecha de fin. El estado no se actualiza solo al vencer el plazo,
 * así que «vigente» ahí no significa «en fecha». Aquí «en fecha» exige las dos
 * cosas: estado `vigente` Y fecha de fin no anterior a hoy.
 *
 * Un contrato que aún no ha empezado cuenta como en fecha: es uno válido que
 * viene, y llamarlo «vencido» sería falso.
 *
 * ── Qué se muestra cuando hay varios ─────────────────────────────────────
 *
 * 42 contratistas tienen más de un contrato (adiciones, contratos sucesivos).
 * Se muestra el en fecha que termina más tarde, y se avisa de que hay más. Si
 * ninguno está en fecha, se muestra el que terminó más tarde, con «terminó».
 *
 * Funciones puras y sin dependencias: se pueden probar sin base de datos.
 */

export type EstadoContrato = 'en_fecha' | 'vencido' | 'sin_contrato' | 'planta'

export interface ContratoFila {
  numero: string
  anio: number | null
  estado: string
  /** ISO `YYYY-MM-DD`. */
  fecha_fin: string
}

export interface ContratoResumen {
  estado: EstadoContrato
  numero: string | null
  anio: number | null
  /** ISO `YYYY-MM-DD` del contrato mostrado. */
  fin: string | null
  /** Días que faltan para que termine (negativo si ya terminó). */
  dias: number | null
  /** Cuántos contratos en fecha tiene. */
  enFecha: number
  total: number
}

/** Hoy en Colombia, como `YYYY-MM-DD`. La fecha de un contrato es civil, no un instante: en UTC, de 7 p. m. en adelante ya sería «mañana». */
export function hoyBogota(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

const MS_DIA = 86_400_000
const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / MS_DIA

/** Ordena de más a menos reciente por fin; a igual fin, el de año y número mayores. */
function masReciente(a: ContratoFila, b: ContratoFila): number {
  if (a.fecha_fin !== b.fecha_fin) return a.fecha_fin < b.fecha_fin ? 1 : -1
  const ya = a.anio ?? 0, yb = b.anio ?? 0
  if (ya !== yb) return yb - ya
  return (Number(b.numero) || 0) - (Number(a.numero) || 0)
}

export function resumirContratos(
  contratos: ContratoFila[],
  rol: string,
  hoy: string,
): ContratoResumen {
  const total = contratos.length
  if (total === 0) {
    return { estado: rol === 'contratista' ? 'sin_contrato' : 'planta', numero: null, anio: null, fin: null, dias: null, enFecha: 0, total: 0 }
  }
  const vivos = contratos.filter(c => c.estado === 'vigente' && c.fecha_fin >= hoy).sort(masReciente)
  const elegido = vivos[0] ?? [...contratos].sort(masReciente)[0]
  return {
    estado: vivos.length > 0 ? 'en_fecha' : 'vencido',
    numero: elegido.numero,
    anio: elegido.anio,
    fin: elegido.fecha_fin,
    dias: Math.round(dia(elegido.fecha_fin) - dia(hoy)),
    enFecha: vivos.length,
    total,
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * `2026-07-31` → «31 jul 2026».
 *
 * Se arma con las partes de la fecha y no con `toLocaleDateString`: el nombre
 * abreviado del mes depende de la versión de ICU de cada Node («sept» aquí,
 * «sep» allá), y el servidor de Vercel no tiene por qué coincidir con este
 * equipo. Tampoco pasa por `Date`, así que la zona horaria no puede mover el día.
 */
export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number)
  if (!anio || !mes || !dia || mes < 1 || mes > 12) return iso
  return `${dia} ${MESES[mes - 1]} ${anio}`
}

export type TonoContrato = 'ok' | 'pronto' | 'vencido' | 'neutro'

/** Lo que se escribe en pantalla, y con qué tono. Vence «pronto» dentro de 30 días. */
export function describirContrato(c: ContratoResumen): { texto: string; tono: TonoContrato } {
  if (c.estado === 'planta') return { texto: 'Personal de planta', tono: 'neutro' }
  if (c.estado === 'sin_contrato' || c.numero === null || c.fin === null || c.dias === null) {
    return { texto: 'Sin contrato', tono: 'neutro' }
  }
  const id = `Contrato ${c.numero}${c.anio ? ` de ${c.anio}` : ''}`
  if (c.estado === 'vencido') return { texto: `${id} · terminó el ${fechaCorta(c.fin)}`, tono: 'vencido' }

  const mas = c.enFecha > 1 ? ` · y ${c.enFecha - 1} más` : ''
  if (c.dias === 0) return { texto: `${id} · vence hoy${mas}`, tono: 'pronto' }
  if (c.dias === 1) return { texto: `${id} · vence mañana${mas}`, tono: 'pronto' }
  if (c.dias <= 30) return { texto: `${id} · vence en ${c.dias} días${mas}`, tono: 'pronto' }
  return { texto: `${id} · vence el ${fechaCorta(c.fin)}${mas}`, tono: 'ok' }
}
