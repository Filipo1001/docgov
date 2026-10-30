/**
 * Cuándo una lista de archivos se muestra COMPACTA: los primeros y, debajo, «Ver los N archivos restantes».
 *
 * Un reporte puede llevar muchos archivos (ver `MAX_EVIDENCIAS`; el primero que llenó el tope de 30 traía 30). Uno debajo de otro,
 * cien archivos son metros de pantalla en el teléfono: lo que va después (el botón de enviar, la validación, los comentarios) queda
 * lejísimos. Felipe (30-oct-2026): «100, sin mostrar el número, con listas compactas».
 *
 * La regla es la misma en todas las listas del módulo (el formulario, la ficha del reporte, la devolución, la pantalla de Evidencias
 * y la verificación pública), y vive aquí para que sea una sola y se pruebe (tests/pdm/lista-compacta.test.ts):
 *
 *   · Con pocos archivos no se esconde nada: hasta `COMPACTA_DESDE - 1` se ven todos. Esconder dos o tres ahorra menos de lo que
 *     estorba el botón.
 *   · Desde `COMPACTA_DESDE`, se ven los primeros `VISIBLES_EN_LISTA` y el resto se despliega con un clic. Así el botón siempre
 *     esconde al menos cuatro.
 *
 * Pura: sin React. El componente es `components/pdm/ListaCompacta.tsx`.
 */

/** Cuántos se ven de una lista compacta antes de «Ver los N restantes». */
export const VISIBLES_EN_LISTA = 5

/** Desde cuántos elementos la lista se compacta. */
export const COMPACTA_DESDE = 9

export interface ListaPartida<T> {
  /** Lo que se ve siempre. */
  primeros: T[]
  /** Lo que se despliega con «Ver los N restantes» (vacío si la lista es corta). */
  resto: T[]
}

export function partirLista<T>(lista: readonly T[], visibles = VISIBLES_EN_LISTA, desde = COMPACTA_DESDE): ListaPartida<T> {
  if (lista.length < Math.max(desde, visibles + 1)) return { primeros: [...lista], resto: [] }
  return { primeros: lista.slice(0, visibles), resto: lista.slice(visibles) }
}

/** Lo que dice el botón que despliega el resto. */
export function textoVerResto(n: number, nombre: { uno: string; varios: string } = { uno: 'archivo', varios: 'archivos' }): string {
  return n === 1 ? `Ver el ${nombre.uno} restante` : `Ver los ${n} ${nombre.varios} restantes`
}
