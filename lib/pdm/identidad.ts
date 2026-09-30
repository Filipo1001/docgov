/**
 * Cómo se presenta el módulo: el nombre del plan y su periodo.
 *
 * ── Por qué es un archivo aparte ─────────────────────────────────────────
 *
 * `lib/pdm/plan.ts` carga los 257 indicadores (un JSON entero) al importarse.
 * El marco del módulo vive en el layout del panel, que lo ve TODA la
 * aplicación: importar el nombre del plan desde `plan.ts` metería ese JSON en
 * la carga de cada pantalla de Contratista Digital. Este archivo no importa
 * nada, y por eso es seguro traerlo desde el layout.
 *
 * ── Hoy son constantes; no van a serlo ───────────────────────────────────
 *
 * Contratista Digital sirve a varias alcaldías y cada una tiene su plan con su
 * nombre. Con el esquema real, esto sale de los datos del plan del municipio.
 * El nombre, «Por Amor a Fredonia», es el mismo que ya usa `AlcaldeHome`.
 * El periodo sale de las columnas del archivo de seguimiento (2024 a 2027).
 */

export const PLAN = {
  /** El nombre con que la administración presenta el plan. */
  nombre: 'Por Amor a Fredonia',
  /** Lo que el sistema es: se queda igual en cualquier municipio. */
  denominacion: 'Plan de Desarrollo',
  periodo: '2024–2027',
} as const

/**
 * Mientras el módulo muestre el archivo de Excel y no una base de datos, lo
 * dice en pantalla. Apagar esto es lo único que hay que hacer para quitar el
 * aviso, y solo debe apagarse el día que los datos salgan de la base.
 */
export const VISTA_PREVIA = {
  activa: true,
  /** El archivo se llama «Septiembre de 2026», pero su columna de seguimiento dice «Junio/2026». */
  corte: 'junio de 2026',
} as const
