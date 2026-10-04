/**
 * A dónde lleva el botón de cada correo.
 *
 * ── Por qué hay que mirar de dónde viene la petición ─────────────────────
 *
 * El módulo solo existe en la vista previa de Vercel (nunca en `app.contratistadigital.com`). Un enlace fijo a
 * producción llevaría a una página que no existe; un enlace a la vista previa tiene que salir de la dirección donde
 * está corriendo el módulo en ese momento. Se toma de la cabecera de la petición, PERO solo si es una dirección que
 * reconocemos: lo que llega en una cabecera no se cree sin comprobarlo (un enlace a otro sitio en un correo nuestro
 * sería un anzuelo de suplantación).
 *
 * Puro y sin `server-only`: la cabecera se lee en la acción (`origen-solicitud.ts`) y aquí solo se valida.
 */

import { ORIGEN_APP } from '@/lib/dominio'

const HOST_LOCAL = /^(localhost|127\.0\.0\.1)(:\d{2,5})?$/i
const HOST_VERCEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.vercel\.app$/i
const HOST_PROPIO = /^([a-z0-9-]+\.)?contratistadigital\.com$/i

/** ¿Es una dirección donde corre esta aplicación? */
export const esHostReconocido = (host: string): boolean => HOST_LOCAL.test(host) || HOST_VERCEL.test(host) || HOST_PROPIO.test(host)

/**
 * El origen (`https://…`) para armar los enlaces.
 *
 * Orden: la dirección de la petición si se reconoce; si no, la de la rama en Vercel (`VERCEL_BRANCH_URL`); si no, la
 * de la aplicación. `http` solo se admite en local.
 */
export function origenSeguro(host: string | null | undefined, proto: string | null | undefined, ramaVercel?: string | null): string {
  const h = (host ?? '').trim().toLowerCase()
  if (h !== '' && esHostReconocido(h)) {
    // Fuera de local, siempre https; en local, lo que diga la petición (por defecto http).
    const esquema = HOST_LOCAL.test(h) && proto !== 'https' ? 'http' : 'https'
    return `${esquema}://${h}`
  }
  const r = (ramaVercel ?? '').trim().toLowerCase()
  if (r !== '' && HOST_VERCEL.test(r)) return `https://${r}`
  return ORIGEN_APP
}

const RAIZ = '/dashboard/plan-desarrollo'

/** La ficha de un indicador (la identifica por su fila del plan), en un año si se sabe cuál. */
export function enlaceDeIndicador(origen: string, fila: number, anio?: number): string {
  return `${origen}${RAIZ}/indicadores?abrir=${fila}${anio !== undefined ? `&anio=${anio}` : ''}`
}

/** «Mi trabajo»: el inicio de quien responde por indicadores. */
export const enlaceDeMiTrabajo = (origen: string): string => `${origen}${RAIZ}`
