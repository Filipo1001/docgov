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
 * Incluye los archivos que un buscador pide por convención en la raíz del
 * dominio. `robots.txt` y `sitemap.xml` tienen que responder 200 en el ápice:
 * redirigidos a otro host pierden su sentido, porque ambos son válidos
 * únicamente para el dominio que los sirve.
 */
const RUTAS_COMERCIALES = [
  '/inicio',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon.svg',
  '/apple-icon.png',
  '/marca',
]

export function esRutaComercial(pathname: string): boolean {
  return pathname === '/' || RUTAS_COMERCIALES.some(r => pathname === r || pathname.startsWith(`${r}/`))
}

/**
 * Contacto comercial que publica la landing.
 *
 * Hoy es WhatsApp y no correo por una razón concreta: el dominio no tiene
 * registros MX, así que no puede recibir correo — cualquier mensaje a
 * `@contratistadigital.com` rebota. Lo que sí está configurado es el envío
 * (SPF y DKIM de Resend), que es de una sola vía.
 *
 * Cuando exista el buzón, cambiar de canal es sustituir el destino de los
 * botones en app/inicio/page.tsx. Por eso ambos valores viven aquí juntos.
 */

/** Número comercial en formato internacional, sin `+` ni separadores. */
export const WHATSAPP_COMERCIAL = '573192420334'

/** PENDIENTE: el buzón todavía no existe. No usar hasta que haya MX. */
export const EMAIL_CONTACTO = 'contacto@contratistadigital.com'

/**
 * Enlace de WhatsApp con el mensaje ya redactado.
 *
 * El texto previo importa: quien llega a la página no tiene que pensar cómo
 * empezar, y a ti te llega el contexto en el primer mensaje en vez de un
 * "hola" suelto.
 */
export function enlaceWhatsApp(
  mensaje = 'Buen día. Quisiera conocer Contratista Digital para mi alcaldía.'
): string {
  return `https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(mensaje)}`
}
