/**
 * lib/dominio.ts — Dónde vive la aplicación.
 *
 * Antes de este archivo el dominio estaba escrito a mano en seis sitios
 * (middleware, verificación, dos plantillas de correo, WhatsApp y la página de
 * mantenimiento). Cambiarlo obligaba a encontrarlos todos, y olvidar uno no
 * rompe el build: se descubre cuando a un contratista le llega un correo con un
 * enlace muerto. Con una sola constante ese error deja de ser posible.
 *
 * ── Por qué el ápice no se puede apagar ──────────────────────────────────
 *
 * Los códigos QR se imprimen dentro del PDF como imagen. La URL queda grabada
 * en el mapa de bits: no se puede reescribir después. Los documentos emitidos
 * antes de agosto de 2026 —240 de ellos, con 138 periodos ya radicados en
 * SECOP II— llevan grabado `https://contratistadigital.com/verificar/{codigo}`
 * y están en manos de terceros: alcaldía, contratistas, entes de control.
 *
 * De ahí la regla que gobierna cualquier cambio futuro de dominio:
 *
 *   contratistadigital.com/verificar/* DEBE seguir resolviendo, para siempre.
 *
 * Hoy se cumple con la redirección 301 del middleware. Si algún día el ápice
 * pasa a servir otra cosa —una landing comercial, por ejemplo— quien la monte
 * tiene que reimplementar esa redirección. No hacerlo no rompe nada visible:
 * simplemente, el día que un auditor escanee un documento de 2026, no cargará.
 */

/** Host canónico de la aplicación. Todo lo demás redirige aquí. */
export const HOST_APP = 'app.contratistadigital.com'

/** Origen canónico, con protocolo. Sin barra final. */
export const ORIGEN_APP = `https://${HOST_APP}` as const

/**
 * Hosts del sitio comercial: el ápice y `www`.
 *
 * Sirven la página de negocio en su raíz y redirigen todo lo demás al app.
 * Son los mismos que antes redirigían por completo; al montar la landing, la
 * raíz dejó de redirigir pero el resto de rutas no cambió.
 */
export const HOSTS_COMERCIALES = [
  'contratistadigital.com',
  'www.contratistadigital.com',
] as const

/**
 * Hosts que redirigen absolutamente todo al canónico.
 *
 * `docgov-black.vercel.app` es el host de Vercel anterior al dominio propio.
 * No se elimina: quedan enlaces vivos apuntando ahí.
 */
export const HOSTS_REDIRIGIDOS = [
  'docgov-black.vercel.app',
] as const

/**
 * Rutas que los hosts comerciales sirven por sí mismos. Todo lo demás —
 * incluido `/verificar/*` — se redirige al app.
 *
 * `/icon` es la ruta que Next genera para el favicon; sin ella la landing
 * pediría su propio icono al otro dominio.
 */
const RUTAS_COMERCIALES = ['/inicio', '/icon']

export function esRutaComercial(pathname: string): boolean {
  return pathname === '/' || RUTAS_COMERCIALES.some(r => pathname === r || pathname.startsWith(`${r}/`))
}

/**
 * Dirección de contacto comercial que publica la landing.
 *
 * PENDIENTE: hay que crear este buzón (o el alias correspondiente) antes de
 * anunciar el sitio. El dominio ya envía correo por Resend desde
 * `notificaciones@`, así que el DNS está listo; falta la casilla de entrada.
 */
export const EMAIL_CONTACTO = 'contacto@contratistadigital.com'
