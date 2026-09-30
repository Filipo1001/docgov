/**
 * Los filtros rápidos de la lista de indicadores.
 *
 * Viven aquí y no en `ListaIndicadores` porque los usan dos lados: la lista (en
 * el navegador) y la página que lee el filtro de la dirección (en el servidor).
 * Un valor exportado desde un archivo `'use client'` NO llega al servidor como
 * valor sino como una referencia opaca, y `FILTROS.find(...)` fallaría en
 * ejecución sin que TypeScript lo note. Un módulo sin `'use client'` sirve a los dos.
 */
export type Filtro = 'todos' | 'sin_responsable' | 'atencion' | 'sin_reporte'
export const FILTROS: readonly Filtro[] = ['todos', 'sin_responsable', 'atencion', 'sin_reporte']
