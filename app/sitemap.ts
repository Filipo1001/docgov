/**
 * app/sitemap.ts — sitemap.xml.
 *
 * El sitio comercial es hoy una sola página, así que el mapa es corto. Aun así
 * vale la pena: es la vía por la que se le pide a Google que rastree una URL
 * nueva, y sin él el descubrimiento depende de que alguien enlace el dominio.
 *
 * Solo entra lo indexable. La aplicación y `/verificar` quedan fuera a
 * propósito; ver app/robots.ts.
 */

import type { MetadataRoute } from 'next'
import { SITIO } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITIO,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
