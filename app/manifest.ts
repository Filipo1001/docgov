/**
 * app/manifest.ts — manifiesto web.
 *
 * Es lo que usa un teléfono cuando alguien guarda la plataforma en su pantalla
 * de inicio: define el nombre corto, el icono y el color de la barra. Sin él,
 * Android muestra una captura recortada de la página y el nombre del dominio.
 *
 * Importa más de lo que parece en este producto: los contratistas entran desde
 * el celular todos los meses, y un acceso directo con la marca es la diferencia
 * entre "la página esa de la alcaldía" y una aplicación reconocible.
 *
 * `start_url` apunta a la aplicación, no al sitio comercial: quien guarda el
 * acceso directo quiere entrar a trabajar, no leer la propuesta.
 */

import type { MetadataRoute } from 'next'
import { NOMBRE, DESCRIPCION } from '@/lib/seo'
import { ORIGEN_APP } from '@/lib/dominio'
import { MARCA } from '@/lib/marca'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOMBRE,
    short_name: NOMBRE,
    description: DESCRIPCION,
    start_url: `${ORIGEN_APP}/dashboard`,
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: MARCA,
    lang: 'es-CO',
    categories: ['business', 'productivity', 'government'],
    icons: [
      { src: '/marca/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/marca/icono-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/marca/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
