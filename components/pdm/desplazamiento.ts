/**
 * Plegar algo largo sin sacar a nadie de donde estaba.
 *
 * Quien despliega una lista o un texto largo, baja hasta el final y pulsa «Ver menos» tiene el botón bajo el dedo. Si lo plegado estaba
 * por ENCIMA de la vista, al plegarse todo lo de abajo sube de golpe y la persona queda en otra parte de la pantalla. Aquí se pliega y,
 * en el mismo instante, se corrige el desplazamiento (de la ventana o de la ficha que lo contiene) para que el botón quede donde estaba.
 *
 * Lo usan `ListaCompacta` y `TextoLargo`.
 */

import { flushSync } from 'react-dom'

/** Lo que se desplaza cuando el contenido crece: la ventana o, dentro de una ficha con su propio desplazamiento, la ficha. */
export function contenedorConScroll(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && p.scrollHeight > p.clientHeight) return p
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement
}

/** ¿Lo que empieza en `inicio` quedó por encima de lo que se ve (de la ventana, o de la ficha que contiene a `ancla`)? */
export function empiezaFueraDeVista(inicio: HTMLElement, ancla: HTMLElement): boolean {
  const caja = contenedorConScroll(ancla)
  const techo = caja === document.scrollingElement || caja === document.documentElement ? 0 : caja.getBoundingClientRect().top
  return inicio.getBoundingClientRect().top < techo
}

/** Pliega (`plegar` deja la pantalla ya plegada: se llama dentro de `flushSync`) sin que `ancla` se mueva en la pantalla. */
export function plegarSinMoverAncla(ancla: HTMLElement, plegar: () => void): void {
  const caja = contenedorConScroll(ancla)
  const antes = ancla.getBoundingClientRect().top
  flushSync(plegar)
  caja.scrollTop += ancla.getBoundingClientRect().top - antes
}
