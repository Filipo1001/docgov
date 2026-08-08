/**
 * lib/seo.ts — Identidad del sitio para buscadores y redes.
 *
 * Un único lugar donde vive lo que Google y las redes sociales leen del sitio.
 * Estaba repartido entre el layout y la landing, y buena parte simplemente no
 * existía: sin Open Graph, sin canónica, sin datos estructurados.
 *
 * DOS SITIOS, UN DESPLIEGUE. `contratistadigital.com` es el sitio comercial y
 * `app.contratistadigital.com` la aplicación. Para un buscador son dominios
 * distintos, así que la autoridad hay que concentrarla a propósito: la canónica
 * apunta siempre al comercial, y la aplicación se marca como no indexable.
 */

import { ORIGEN_APP } from './dominio'

/** Origen canónico del sitio comercial. Todo lo indexable vive aquí. */
export const SITIO = 'https://contratistadigital.com'

export const NOMBRE = 'Contratista Digital'

/**
 * Título de la portada.
 *
 * Google corta alrededor de los 60 caracteres. Este cabe entero y lleva
 * delante lo que se busca: el producto y para quién es.
 */
export const TITULO = 'Contratista Digital | Software de contratación pública'

export const DESCRIPCION =
  'Software para alcaldías que automatiza la supervisión de contratos de prestación '
  + 'de servicios: informes de actividades, cuentas de cobro y actas generados sin errores, '
  + 'con evidencias, trazabilidad y verificación por código QR.'

/** Imagen de la tarjeta al compartir el enlace. 1200×630. */
export const PORTADA_SOCIAL = `${SITIO}/marca/portada-social.png`

/**
 * Datos estructurados.
 *
 * Le dicen a Google qué es esto —una organización y una aplicación de software,
 * no un blog— y habilitan los resultados enriquecidos. Van como JSON-LD porque
 * es el formato que Google recomienda y no afecta a lo que ve el usuario.
 */
export function datosEstructurados(preguntas: { p: string; r: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITIO}/#organizacion`,
        name: NOMBRE,
        url: SITIO,
        logo: {
          '@type': 'ImageObject',
          url: `${SITIO}/marca/icono-512.png`,
          width: 512,
          height: 512,
        },
        image: PORTADA_SOCIAL,
        description: DESCRIPCION,
        areaServed: { '@type': 'Country', name: 'Colombia' },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITIO}/#sitio`,
        url: SITIO,
        name: NOMBRE,
        inLanguage: 'es-CO',
        publisher: { '@id': `${SITIO}/#organizacion` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITIO}/#software`,
        name: NOMBRE,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Gestión documental contractual',
        operatingSystem: 'Web, iOS, Android',
        url: ORIGEN_APP,
        description: DESCRIPCION,
        inLanguage: 'es-CO',
        publisher: { '@id': `${SITIO}/#organizacion` },
        offers: {
          '@type': 'Offer',
          price: '2900000',
          priceCurrency: 'COP',
          // Sin fecha de caducidad: es una licencia mensual vigente.
          category: 'Licencia mensual',
          url: SITIO,
        },
        featureList: [
          'Informes de actividades generados automáticamente',
          'Cuentas de cobro sin errores de digitación',
          'Actas de supervisión y de pago',
          'Evidencias y soportes en PDF como anexos numerados',
          'Verificación de documentos por código QR',
          'Trazabilidad completa con historial inalterable',
          'Notificaciones en tiempo real',
          'Paquete listo para radicar en SECOP II',
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITIO}/#preguntas`,
        mainEntity: preguntas.map(({ p, r }) => ({
          '@type': 'Question',
          name: p,
          acceptedAnswer: { '@type': 'Answer', text: r },
        })),
      },
    ],
  }
}
