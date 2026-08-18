/**
 * lib/valor-contrato.ts — Cuánto vale un contrato y cuánto se cobra cada mes.
 *
 * Son dos preguntas distintas. La pantalla las venía respondiendo con dos
 * campos estáticos de la tabla `contratos`, y ninguno de los dos decía la
 * verdad.
 *
 * ── `valor_total` ignora los otrosíes ────────────────────────────────────
 *
 * Es el valor con el que se firmó. Registrar un otrosí de adición no lo
 * actualiza: `crearOtrosi` inserta la fila en `otrosies` y nada más. El
 * contrato 023 mostraba $24.000.000 cuando su adición de $11.200.000 ya lo
 * había llevado a $35.200.000 — y sus periodos, que sí se extendieron, sumaban
 * exactamente esa cifra. La pantalla contradecía a sus propios datos.
 *
 * ── `valor_mensual` supone que todos los meses son iguales ───────────────
 *
 * Y casi nunca lo son. Un contrato que arranca el 14 de agosto cobra ese mes
 * proporcional: el 178 va de $1.650.000 el primer mes a $3.300.000 los cuatro
 * siguientes. Además el campo admite cero, así que el 178 —que lo tenía en
 * cero— mostraba «$0» en pantalla, que es peor que no mostrar nada: parece un
 * dato y es la ausencia de uno.
 *
 * ── Lo que se hace en su lugar ───────────────────────────────────────────
 *
 * Cada cifra pasa a tener una definición que se puede defender ante quien
 * pregunte:
 *
 *   total       = lo firmado + las adiciones registradas   (el valor jurídico)
 *   por periodo = lo que dicen los periodos                (lo que se cobra)
 *
 * No se promedia ni se reparte nada: dividir el total entre los meses volvería
 * a inventar una mensualidad que no existe. Cuando los periodos difieren se
 * dice que difieren, y se muestra el rango.
 *
 * Funciones puras. No consultan nada; reciben lo que la pantalla ya cargó.
 */

/** Suma tolerante: descarta nulos y valores no finitos. */
function sumar(valores: ReadonlyArray<number | null | undefined>): number {
  return valores.reduce<number>((acc, v) => (typeof v === 'number' && Number.isFinite(v) ? acc + v : acc), 0)
}

export type TotalContrato = {
  /** Lo firmado más las adiciones. Es la cifra que debe verse en pantalla. */
  total: number
  /** Suma de las adiciones por otrosí. Cero si no hay ninguna. */
  adiciones: number
}

/**
 * Valor del contrato incluyendo los otrosíes de adición.
 *
 * Los otrosíes llegan de forma asíncrona a la pantalla; mientras no estén,
 * esto devuelve el valor firmado, que es lo correcto: nunca muestra una cifra
 * inflada por error, solo una que puede quedarse corta un instante.
 */
export function totalConAdiciones(
  valorTotal: number | null | undefined,
  otrosies: ReadonlyArray<{ valor_adicion?: number | null }> = [],
): TotalContrato {
  const firmado = typeof valorTotal === 'number' && Number.isFinite(valorTotal) ? valorTotal : 0
  const adiciones = sumar(otrosies.map(o => o.valor_adicion))
  return { total: firmado + adiciones, adiciones }
}

export type ValorPorPeriodo =
  /** Hay periodos con valor y todos cobran lo mismo. */
  | { clase: 'uniforme'; valor: number; periodos: number; sinValor: number }
  /** Hay periodos con valor y no cobran lo mismo: primer mes proporcional, adiciones, etc. */
  | { clase: 'variable'; minimo: number; maximo: number; periodos: number; sinValor: number }
  /** No hay ningún periodo con valor: o no se han generado, o están en blanco. */
  | { clase: 'sin-periodos' }

/**
 * Qué se cobra por periodo, leído de los periodos y no del campo del contrato.
 *
 * Los periodos en cero no entran en el rango. Existen —un periodo puede
 * crearse antes de tener su valor— pero incluirlos daría rangos como
 * «$0 – $3.300.000», que sugiere un mes gratis en vez de un dato pendiente.
 *
 * Sí se cuentan aparte, en `sinValor`, y por una razón concreta: al filtrarlos
 * en silencio, el contrato 015 —diez de sus doce periodos en blanco— quedaba
 * descrito como «varía entre los 2 periodos», que suena a un contrato de dos
 * meses. Quien lea la pantalla tiene que poder ver que faltan datos.
 */
export function valorPorPeriodo(
  periodos: ReadonlyArray<{ valor_cobro?: number | null }>,
): ValorPorPeriodo {
  const cobros = periodos
    .map(p => p.valor_cobro)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)

  if (cobros.length === 0) return { clase: 'sin-periodos' }

  const sinValor = periodos.length - cobros.length
  const minimo = Math.min(...cobros)
  const maximo = Math.max(...cobros)

  return minimo === maximo
    ? { clase: 'uniforme', valor: minimo, periodos: cobros.length, sinValor }
    : { clase: 'variable', minimo, maximo, periodos: cobros.length, sinValor }
}

/** Pesos colombianos, sin decimales. `null` y `0` se muestran como raya. */
export function pesos(valor: number | null | undefined): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor === 0) return '—'
  return `$${Math.round(valor).toLocaleString('es-CO')}`
}
