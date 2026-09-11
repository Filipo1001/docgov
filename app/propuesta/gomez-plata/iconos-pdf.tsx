import { Svg, Path } from '@react-pdf/renderer'

/**
 * Iconografía del PDF.
 *
 * Se dibuja con las primitivas del renderizador y no con imágenes: un trazo
 * vectorial se imprime nítido a cualquier tamaño, y una imagen de 16 píxeles
 * se vería sucia en papel — que es donde va a acabar este documento.
 *
 * Los trazados son los de Lucide, la misma familia que usa la aplicación. No
 * es coquetería: quien reciba la propuesta y luego entre a la plataforma se
 * encuentra los mismos símbolos, y eso es media explicación ahorrada.
 */

export const TRAZOS = {
  duplicados:   'M4 16V6a2 2 0 012-2h10 M8 8h12v12H8z',
  huella:       'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  escudo:       'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  correo:       'M2 6h20v12H2z M2 7l10 6 10-6',
  candado:      'M5 11h14v10H5z M8 11V7a4 4 0 018 0v4',
  dispositivos: 'M3 5h11v9H3z M6 18h5 M17 8h4v11h-4z',
  paquete:      'M3 7h6l2 2h10v10H3z M3 12h18',
  persona:      'M12 12a4 4 0 100-8 4 4 0 000 8z M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  pluma:        'M12 20h9 M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  documento:    'M14 2H6v20h12V6z M14 2v4h4 M9 13h6 M9 17h6',
  municipio:    'M3 21h18 M5 21V10 M9 21V10 M15 21V10 M19 21V10 M2 10l10-7 10 7',
  reloj:        'M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2',
  billete:      'M2 6h20v12H2z M12 15a3 3 0 100-6 3 3 0 000 6z',
  chispa:       'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
} as const

export function Ico({ d, tam = 13, color = '#0B7A5C', grosor = 1.9 }: {
  d: string; tam?: number; color?: string; grosor?: number
}) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24">
      <Path d={d} stroke={color} strokeWidth={grosor} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
