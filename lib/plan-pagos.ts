/**
 * Valor vigente de un contrato para cuadrar su plan de pagos.
 *
 * `contratos.valor_total` es el valor con que se firmó el contrato y NO cambia cuando se registra un otrosí: el
 * otrosí guarda lo que añade (`valor_adicion`) y, si trae plazo, genera los periodos nuevos. La pestaña «Plan de
 * Pagos» comparaba la suma de los periodos con `valor_total` a secas, así que cualquier contrato con un otrosí que
 * añade valor aparecía como «los pagos no cuadran» (11 de 12 el 15-oct-2026, con una diferencia igual al valor
 * añadido).
 *
 * Cuentan TODOS los otrosíes registrados, estén aplicados o no: el valor del contrato cambia con el otrosí, no con
 * la creación de sus periodos. Uno que añade valor sin plazo (no genera periodos) o uno todavía sin aplicar deja una
 * diferencia positiva, y eso es lo correcto: es plata del contrato que aún no está repartida en pagos.
 */
export function valorVigenteDelContrato(
  valorTotal: number | string | null | undefined,
  otrosies: ReadonlyArray<{ valor_adicion?: number | string | null }>,
): number {
  const adicion = otrosies.reduce((acc, o) => acc + (Number(o.valor_adicion ?? 0) || 0), 0)
  return (Number(valorTotal ?? 0) || 0) + adicion
}

/** Lo que añaden los otrosíes, para mostrarlo junto al total. */
export function adicionDeOtrosies(otrosies: ReadonlyArray<{ valor_adicion?: number | string | null }>): number {
  return otrosies.reduce((acc, o) => acc + (Number(o.valor_adicion ?? 0) || 0), 0)
}
