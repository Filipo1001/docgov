import { estadoDe, sinAsignar, type Indicador } from './plan'
import { requiereReporte } from './seguimiento'

/**
 * Los filtros rápidos de la lista de indicadores.
 *
 * Viven aquí y no en `ListaIndicadores` porque los usan dos lados: la lista (en
 * el navegador) y la página que lee el filtro de la dirección (en el servidor).
 * Un valor exportado desde un archivo `'use client'` NO llega al servidor como
 * valor sino como una referencia opaca, y `FILTROS.find(...)` fallaría en
 * ejecución sin que TypeScript lo note. Un módulo sin `'use client'` sirve a los dos.
 *
 *   sin_reporte   ningún reporte aprobado todavía (nada cuenta en el cumplimiento)
 *   por_reportar  hay corte abierto y a quien lo tiene le falta reportar, o se lo devolvieron
 *   por_validar   hay corte abierto y lo reportado espera a la secretaría
 */
export type Filtro = 'todos' | 'sin_responsable' | 'atencion' | 'sin_reporte' | 'por_reportar' | 'por_validar'
export const FILTROS: readonly Filtro[] = ['todos', 'sin_responsable', 'atencion', 'sin_reporte', 'por_reportar', 'por_validar']

/** Los dos filtros que solo tienen sentido con un corte abierto. */
export const FILTROS_DE_CORTE: readonly Filtro[] = ['por_reportar', 'por_validar']

export function cumpleFiltro(i: Indicador, f: Filtro): boolean {
  switch (f) {
    case 'todos': return true
    case 'sin_responsable': return sinAsignar(i)
    case 'atencion': { const e = estadoDe(i); return e === 'critico' || e === 'atrasado' }
    case 'sin_reporte': return estadoDe(i) === 'sin_reporte'
    case 'por_reportar': return requiereReporte(i.enCorte?.situacion)
    case 'por_validar': return i.enCorte?.situacion === 'pendiente'
  }
}
