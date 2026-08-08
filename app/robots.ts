/**
 * app/robots.ts — robots.txt.
 *
 * Antes no existía: `/robots.txt` devolvía una redirección 301 al subdominio de
 * la aplicación, donde tampoco había nada. Un rastreador que no encuentra
 * robots.txt asume que puede recorrerlo todo, y aquí hay dos zonas que no debe
 * tocar.
 *
 * `/verificar/` es la importante. Esas páginas son públicas a propósito —un QR
 * impreso tiene que poder consultarse sin cuenta— pero muestran nombre
 * completo, dependencia, valor del contrato y supervisor de personas reales.
 * Que sean accesibles no significa que deban aparecer en Google cuando alguien
 * busque el nombre de un contratista. La exclusión va por partida doble: aquí
 * y con `noindex` en la propia página, porque robots.txt evita el rastreo pero
 * no impide que una URL enlazada desde fuera acabe listada.
 */

import type { MetadataRoute } from 'next'
import { SITIO } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard/',   // tras autenticación; no hay nada que rastrear
          '/api/',
          '/auth/',
          '/verificar/',   // datos personales de contratistas y supervisores
          '/maintenance',
        ],
      },
    ],
    sitemap: `${SITIO}/sitemap.xml`,
    host: SITIO,
  }
}
