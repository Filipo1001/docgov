/**
 * lib/terminacion-contrato.ts — la terminación anticipada de un contrato (migración 081).
 *
 * Felipe (30-oct-2026): los contratos que terminan antes de su fecha seguían «Pendientes de enviar», recibiendo
 * recordatorios y contando como activos. La terminación no la deduce el sistema: la REGISTRAN admin, contratación o el
 * supervisor del contrato, con su causal. Registrarla es un hecho con efectos, y los hace la base en una transacción
 * (`terminar_contrato`); aquí vive lo que la pantalla necesita antes de confirmar: las causales, qué periodos se anulan,
 * cuál se recorta y por cuánto, y qué lo impide. La base vuelve a comprobarlo todo.
 *
 *   · Se anulan los periodos que empiezan después del último día de ejecución (no se borran; se pueden reponer).
 *   · Se recorta el que contiene ese día: termina ese día y vale el proporcional por días, que se puede corregir.
 *   · Los anteriores siguen siendo obligaciones: con su informe se cobra lo ejecutado.
 *   · Lo ya presentado (o histórico) más allá de ese día lo impide: lo presentado no se reescribe (regla 3).
 */

import type { Rol } from '@/lib/types'

export type CausalTerminacion =
  | 'mutuo_acuerdo'
  | 'unilateral'
  | 'muerte_incapacidad'
  | 'caducidad'
  | 'inhabilidad'
  | 'nulidad'
  | 'fuerza_mayor'
  | 'otra'

/**
 * Las causales. `nombre` es el mismo que devuelve `terminacion_causal_nombre` en la base (migración 081), y la prueba
 * tests/cd/terminacion-contrato.test.ts vigila que coincidan. Las cláusulas excepcionales (unilateral, caducidad) solo
 * aplican si el contrato las pactó (Ley 80, art. 14): el sistema registra el acto, no lo juzga.
 */
export const CAUSALES_TERMINACION: ReadonlyArray<{
  id: CausalTerminacion
  nombre: string
  norma: string | null
  /** Qué es, en los términos del trámite. */
  ayuda: string
  /** El documento que la formaliza, para orientar el número que se pide. */
  acto: 'acta' | 'resolución'
}> = [
  { id: 'mutuo_acuerdo', nombre: 'Mutuo acuerdo', norma: 'Código Civil, arts. 1602 y 1625',
    ayuda: 'Las partes acuerdan terminarlo antes del plazo. Incluye la renuncia del contratista aceptada por la entidad.', acto: 'acta' },
  { id: 'unilateral', nombre: 'Terminación unilateral', norma: 'Ley 80 de 1993, art. 17',
    ayuda: 'Resolución motivada de la entidad: exigencias del servicio u orden público, interdicción, cesación de pagos o embargos del contratista.', acto: 'resolución' },
  { id: 'muerte_incapacidad', nombre: 'Muerte o incapacidad permanente del contratista', norma: 'Ley 80 de 1993, art. 17, num. 2',
    ayuda: 'Lo ejecutado hasta ese día se paga a quien corresponda.', acto: 'resolución' },
  { id: 'caducidad', nombre: 'Caducidad', norma: 'Ley 80 de 1993, art. 18',
    ayuda: 'Incumplimiento grave declarado por resolución, tras el procedimiento del art. 86 de la Ley 1474 de 2011. Mientras no exista la resolución, el contrato sigue vigente.', acto: 'resolución' },
  { id: 'inhabilidad', nombre: 'Inhabilidad o incompatibilidad sobreviniente', norma: 'Ley 80 de 1993, art. 9',
    ayuda: 'Al contratista le sobrevino una inhabilidad y no cedió el contrato.', acto: 'resolución' },
  { id: 'nulidad', nombre: 'Nulidad absoluta', norma: 'Ley 80 de 1993, arts. 44 y 45',
    ayuda: 'La entidad declara terminado un contrato viciado de nulidad absoluta.', acto: 'resolución' },
  { id: 'fuerza_mayor', nombre: 'Fuerza mayor o imposibilidad de ejecución', norma: 'Código Civil, art. 64',
    ayuda: 'Un hecho imprevisible e irresistible impide seguir ejecutándolo.', acto: 'acta' },
  { id: 'otra', nombre: 'Otra causal', norma: null,
    ayuda: 'Explica cuál en la observación.', acto: 'acta' },
]

export function causalTerminacion(id: string | null | undefined) {
  return CAUSALES_TERMINACION.find(c => c.id === id) ?? null
}

/** Los estados que una terminación puede tocar: lo que no se ha presentado o volvió para corregirse. */
export const ESTADOS_TERMINABLES = ['borrador', 'rechazado'] as const

/** Quién registra o deshace una terminación: admin y contratación en todos los contratos; el supervisor, en los suyos. */
export function puedeGestionarTerminacion(
  rol: Rol | null | undefined,
  usuarioId: string | null | undefined,
  contrato: { supervisor_id?: string | null },
): boolean {
  if (rol === 'admin' || rol === 'contratacion') return true
  return rol === 'supervisor' && !!usuarioId && contrato.supervisor_id === usuarioId
}

// ─── Fechas y valor ──────────────────────────────────────────────────────────

function partes(fecha: string): [number, number, number] {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return [a, m, d]
}

function iso(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** El día anterior: «el último día de ejecución» de un contrato que nunca se ejecutó. */
export function diaAnterior(fecha: string): string {
  const [a, m, d] = partes(fecha)
  const f = new Date(Date.UTC(a, m - 1, d - 1))
  return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate())
}

/**
 * Días ejecutados, en meses de 30 días (la cuenta comercial con la que se liquida un contrato de prestación de
 * servicios): del 1 al 15 son 15 días en cualquier mes, y el último día del mes cuenta como el 30.
 */
export function diasComerciales(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde)
  const [a2, m2, d2] = partes(hasta)
  const ultimo = new Date(Date.UTC(a2, m2, 0)).getUTCDate()
  const dia1 = Math.min(d1, 30)
  const dia2 = d2 === ultimo ? 30 : Math.min(d2, 30)
  return Math.max(0, (a2 - a1) * 360 + (m2 - m1) * 30 + (dia2 - dia1) + 1)
}

/**
 * Lo que vale el periodo recortado: el valor mensual del contrato por los días ejecutados sobre 30. Nunca más de lo que
 * valía completo. Si el contrato no tiene valor mensual (hay uno así), se parte del valor del propio periodo.
 */
export function valorProporcional(valorMensual: number | null | undefined, valorPeriodo: number, dias: number): number {
  const base = Number(valorMensual) > 0 ? Number(valorMensual) : valorPeriodo
  return Math.max(0, Math.min(valorPeriodo, Math.round((base * dias) / 30)))
}

// ─── El plan: qué pasa si el contrato termina ese día ────────────────────────

export interface PeriodoParaTerminar {
  id: string
  numero_periodo: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
  estado: string
  es_historico: boolean | null
}

export interface PlanTerminacion {
  /** Si el día no sirve, por qué; el resto del plan viene vacío. */
  error: string | null
  /** Los que empiezan después del último día: quedan anulados. */
  anulados: PeriodoParaTerminar[]
  /** El que contiene el último día: termina ese día y vale lo propuesto (se puede corregir). */
  recortado: { periodo: PeriodoParaTerminar; fechaFinNueva: string; dias: number; valorPropuesto: number } | null
  /** Lo que impide terminar ese día: periodos ya presentados (o históricos) que pasan de él. */
  bloqueos: PeriodoParaTerminar[]
  /** Lo que sigue siendo obligación: informes sin presentar hasta el último día, incluido el recortado. */
  pendientes: PeriodoParaTerminar[]
}

const editable = (p: PeriodoParaTerminar) =>
  !p.es_historico && (ESTADOS_TERMINABLES as readonly string[]).includes(p.estado)

export function planDeTerminacion(
  contrato: { fecha_inicio: string; fecha_fin: string; valor_mensual?: number | null },
  periodos: PeriodoParaTerminar[],
  fecha: string,
): PlanTerminacion {
  const vacio: PlanTerminacion = { error: null, anulados: [], recortado: null, bloqueos: [], pendientes: [] }
  const dia = fecha.slice(0, 10)
  const fin = contrato.fecha_fin.slice(0, 10)
  const inicio = contrato.fecha_inicio.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { ...vacio, error: 'Indica el último día de ejecución.' }
  if (dia >= fin) {
    return { ...vacio, error: 'El último día de ejecución tiene que ser anterior a la terminación pactada. Si el contrato llega a su fecha, termina solo.' }
  }
  if (dia < diaAnterior(inicio)) {
    return { ...vacio, error: 'El último día de ejecución no puede ser anterior al inicio del contrato.' }
  }

  const vivos = [...periodos]
    .filter(p => p.estado !== 'anulado')
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
  const anulados = vivos.filter(p => p.fecha_inicio.slice(0, 10) > dia)
  const enCurso = vivos.find(p => p.fecha_inicio.slice(0, 10) <= dia && p.fecha_fin.slice(0, 10) > dia) ?? null
  const afectados = enCurso ? [enCurso, ...anulados] : anulados

  const recortado = enCurso
    ? (() => {
        const dias = diasComerciales(enCurso.fecha_inicio, dia)
        return {
          periodo: enCurso,
          fechaFinNueva: dia,
          dias,
          valorPropuesto: valorProporcional(contrato.valor_mensual, Number(enCurso.valor_cobro ?? 0), dias),
        }
      })()
    : null

  return {
    error: null,
    anulados,
    recortado,
    bloqueos: afectados.filter(p => !editable(p)),
    pendientes: vivos.filter(p => p.fecha_inicio.slice(0, 10) <= dia && editable(p)),
  }
}

/** «1 de octubre de 2026», para los textos de la pantalla y del correo. */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = partes(fecha)
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${d} de ${meses[m - 1]} de ${a}`
}
