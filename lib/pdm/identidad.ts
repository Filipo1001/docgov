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
 * En la vista previa, una línea que recuerda lo que más fácil se olvida: que comparte la base de datos con
 * producción. Lo que alguien reporte, apruebe o asigne aquí es real. En producción no se pinta (lo decide el
 * layout del módulo).
 */
export const VISTA_PREVIA = {
  activa: true,
  texto: 'Usa la base de datos real: lo que reportes, apruebes o asignes aquí queda registrado de verdad.',
} as const
