import 'server-only'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { requireRole } from '@/lib/auth'
import { pdmHabilitado } from '@/lib/pdm/habilitado'
import { PLAN } from '@/lib/pdm/identidad'

/**
 * La puerta de TODAS las pantallas del módulo.
 *
 * Se llama al principio de cada página y no una vez en un layout: un layout no
 * se vuelve a ejecutar cuando se navega entre sus páginas hijas, así que una
 * comprobación puesta solo ahí protegería la primera pantalla y dejaría abiertas
 * las demás. Con una función y una línea por página, olvidarla salta a la vista.
 *
 * 1. Fuera de vista previa o desarrollo el módulo no existe: 404, y falla hacia
 *    lo cerrado (ver `pdmHabilitado`).
 * 2. Solo el administrador, por ahora. El módulo se abre por roles de a uno.
 *
 * `connection()` obliga a decidirlo EN CADA PETICIÓN. Sin él, en un entorno donde
 * `pdmHabilitado()` responde «no», `notFound()` se lanza antes de que nada lea
 * las cookies y Next da la página por estática: hornea el 404 al compilar. La
 * decisión quedaría tomada con el entorno de la compilación y no con el de
 * ejecución, que es el que importa.
 */
export async function exigirAccesoPdm() {
  await connection()
  if (!pdmHabilitado()) notFound()
  return requireRole(['admin'])
}

/**
 * El título de la pestaña del navegador.
 *
 * Next calcula los metadatos de una página AUNQUE su cuerpo termine en 404, así
 * que un `metadata` fijo pondría «Resumen · Por Amor a Fredonia» en la pestaña
 * de quien abra esta dirección en producción, donde el módulo no existe.
 * Pasando por la misma regla que la puerta, allí no dice nada.
 */
export function metadataPdm(seccion: string): Metadata {
  return pdmHabilitado() ? { title: `${seccion} · ${PLAN.nombre}` } : {}
}
