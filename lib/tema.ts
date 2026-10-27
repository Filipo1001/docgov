/**
 * El tema claro/oscuro de la aplicación: qué elige la persona, dónde vale y cómo se aplica antes de pintar.
 *
 * ── Cómo funciona ────────────────────────────────────────────────────────
 *
 * El oscuro es un ATRIBUTO en la raíz (`<html data-tema="oscuro">`), y todo lo demás sale de las variables de color de
 * `globals.css`: la paleta de Tailwind se redefine ahí cuando el atributo está puesto, así que las pantallas no cambian una línea
 * (ver el bloque `html[data-tema="oscuro"]`). Quien elige no toca nada más que un interruptor (`components/SelectorTema.tsx`).
 *
 *   claro     (por defecto)  como la aplicación ha sido siempre.
 *   oscuro                   siempre oscuro.
 *   sistema                  el que tenga el teléfono o el computador.
 *
 * Se guarda en ESTE dispositivo (`localStorage`), no en la cuenta: no hay nada que migrar y el teléfono puede ser oscuro mientras el
 * computador de la oficina no.
 *
 * ── Dónde vale ───────────────────────────────────────────────────────────
 *
 * Solo en la aplicación (el panel y el inicio de sesión), no en el sitio comercial, ni en `/verificar` (un documento público que tiene
 * que verse y poder imprimirse igual para todos), ni en las propuestas. Y, por ahora, tampoco en el módulo Plan de Desarrollo, cuyos
 * colores están escritos uno a uno y se pasarán a la paleta en otra fase. La raíz `layout.tsx` se comparte con todos esos sitios: por
 * eso lo decide la RUTA, y por eso `AplicarTema` quita el atributo al salir de donde vale.
 *
 * ── Sin parpadeo ─────────────────────────────────────────────────────────
 *
 * El atributo se pone con un script que corre ANTES de pintar (`SCRIPT_TEMA`, en el `<head>`). Si esperara a React, quien eligió el
 * oscuro vería un destello blanco en cada carga.
 *
 * Pura: sin `window`. El script se arma como texto para que no dependa de nada que el navegador aún no haya cargado, y las
 * pruebas lo ejecutan tal cual (tests/cd/tema.test.ts) para que lo que se prueba sea lo que corre.
 */

export type PreferenciaTema = 'claro' | 'oscuro' | 'sistema'
export type TemaAplicado = 'claro' | 'oscuro'

export const PREFERENCIAS_TEMA: readonly PreferenciaTema[] = ['claro', 'oscuro', 'sistema']
export const ROTULO_TEMA: Record<PreferenciaTema, string> = { claro: 'Claro', oscuro: 'Oscuro', sistema: 'Automático' }

/** Dónde se guarda la elección en el dispositivo. */
export const CLAVE_TEMA = 'cd-tema'
/** El atributo de la raíz que activa la paleta oscura. */
export const ATRIBUTO_TEMA = 'data-tema'

/** Lo guardado (o cualquier cosa) como una preferencia: lo que no se entiende es «claro», que es como siempre se ha visto. */
export function leerPreferencia(valor: unknown): PreferenciaTema {
  return valor === 'oscuro' || valor === 'sistema' ? valor : 'claro'
}

/** Qué tema se aplica con esa preferencia, según lo que diga el sistema. */
export const temaAplicado = (pref: PreferenciaTema, sistemaOscuro: boolean): TemaAplicado =>
  pref === 'oscuro' || (pref === 'sistema' && sistemaOscuro) ? 'oscuro' : 'claro'

/**
 * Las rutas donde existe el tema oscuro, como expresión regular sobre el `pathname`: el panel y el inicio de sesión.
 * El módulo Plan de Desarrollo queda fuera (ver arriba): por ahora se ve siempre claro.
 */
const RUTAS_CON_TEMA = '^/(?:dashboard|login|auth)(?:/|$)'
const RUTAS_SIN_TEMA = '^/dashboard/plan-desarrollo(?:/|$)'

export function rutaAdmiteTema(pathname: string): boolean {
  return new RegExp(RUTAS_CON_TEMA).test(pathname) && !new RegExp(RUTAS_SIN_TEMA).test(pathname)
}

/**
 * El script de `<head>`: pone `data-tema="oscuro"` antes del primer pintado si la persona lo eligió y la ruta lo admite. Nunca lanza:
 * sin `localStorage` (navegación privada, políticas del navegador) se queda en claro.
 */
export const SCRIPT_TEMA = `(function(){try{
var p=location.pathname;
if(!new RegExp(${JSON.stringify(RUTAS_CON_TEMA)}).test(p)||new RegExp(${JSON.stringify(RUTAS_SIN_TEMA)}).test(p))return;
var v=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});
var o=v==='oscuro'||(v==='sistema'&&matchMedia('(prefers-color-scheme: dark)').matches);
if(o)document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_TEMA)},'oscuro');
}catch(e){}})();`
