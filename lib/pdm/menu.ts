import type { ItemMenu } from '@/lib/constants'

/**
 * El botón del módulo en la barra lateral del administrador.
 *
 * `destacado` hace que la barra lo pinte con su propio estilo y no con el de un
 * elemento de menú corriente: es el único botón de la barra que no pertenece a
 * la gestión contractual, y tiene que leerse como algo distinto.
 */
export const ITEM_PLAN_DESARROLLO: ItemMenu = {
  href: '/dashboard/plan-desarrollo',
  label: 'Plan de Desarrollo',
  icono: 'planDesarrollo',
  destacado: true,
}

/**
 * Coloca `extra` justo debajo de «Inicio».
 *
 * Es idempotente —si ya está, no lo duplica— y, si por algún cambio futuro
 * «Inicio» dejara de existir, el botón va primero y no se pierde. Nunca muta la
 * lista que recibe: `getMenuPorRol` la construye de nuevo en cada llamada, pero
 * eso es un detalle suyo del que este código no debe depender.
 */
export function insertarDebajoDeInicio(items: ItemMenu[], extra: ItemMenu): ItemMenu[] {
  if (items.some(i => i.href === extra.href)) return items
  const posInicio = items.findIndex(i => i.href === '/dashboard')
  const corte = posInicio === -1 ? 0 : posInicio + 1
  return [...items.slice(0, corte), extra, ...items.slice(corte)]
}
