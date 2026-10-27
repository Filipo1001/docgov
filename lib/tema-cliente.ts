'use client'

/**
 * El tema en el navegador: leer lo guardado, aplicarlo a la raíz y guardarlo. La regla (qué es «oscuro», dónde vale) es de `lib/tema.ts`;
 * aquí solo se toca `localStorage` y `<html>`. Nada de esto lanza: sin `localStorage` la aplicación se queda en claro.
 */

import {
  ATRIBUTO_TEMA, CLAVE_TEMA, leerPreferencia, rutaAdmiteTema, temaAplicado,
  type PreferenciaTema,
} from './tema'

const CONSULTA_OSCURO = '(prefers-color-scheme: dark)'

/** La preferencia guardada en este dispositivo («claro» si no hay o no se puede leer). */
export function preferenciaGuardada(): PreferenciaTema {
  try {
    return leerPreferencia(window.localStorage.getItem(CLAVE_TEMA))
  } catch {
    return 'claro'
  }
}

export function guardarPreferencia(pref: PreferenciaTema): void {
  try {
    window.localStorage.setItem(CLAVE_TEMA, pref)
  } catch { /* sin almacenamiento: vale para esta visita y nada más */ }
}

/** Lo que dice el sistema ahora mismo. */
export const sistemaEsOscuro = (): boolean => window.matchMedia(CONSULTA_OSCURO).matches

/** Pone o quita el atributo de la raíz según la preferencia y la ruta en que se está. */
export function aplicarTema(pref: PreferenciaTema, pathname: string = window.location.pathname): void {
  const oscuro = rutaAdmiteTema(pathname) && temaAplicado(pref, sistemaEsOscuro()) === 'oscuro'
  const raiz = document.documentElement
  if (oscuro) raiz.setAttribute(ATRIBUTO_TEMA, 'oscuro')
  else raiz.removeAttribute(ATRIBUTO_TEMA)
}

/** Avisa cuando el sistema cambia de claro a oscuro (o al revés). Devuelve cómo dejar de escuchar. */
export function alCambiarElSistema(fn: () => void): () => void {
  const m = window.matchMedia(CONSULTA_OSCURO)
  m.addEventListener('change', fn)
  return () => m.removeEventListener('change', fn)
}
