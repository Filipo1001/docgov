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
 * Hosts que redirigen al canónico.
 *
 * El ápice y `www` son el dominio anterior; `docgov-black.vercel.app` es el
 * host de Vercel que se usó antes de tener dominio propio y que ya venía
 * redirigiendo. Ninguno se elimina: cada uno tiene enlaces vivos allá afuera.
 */
export const HOSTS_REDIRIGIDOS = [
  'contratistadigital.com',
  'www.contratistadigital.com',
  'docgov-black.vercel.app',
] as const
