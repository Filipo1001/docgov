'use client'

/**
 * El botón de Plan de Desarrollo en la barra lateral.
 *
 * ── Por qué no se parece del todo a sus vecinos ──────────────────────────
 *
 * Los demás botones de la barra son gris sobre blanco y el activo es grafito. Este lleva un
 * contorno de tinta: sigue siendo de la casa (mismo grafito de la marca) pero no se confunde con una
 * pantalla de contratación, porque el resto de la barra es la gestión de contratos y esto es otro
 * módulo. Se distingue por el contorno, no por otro color.
 *
 * ── Por qué no lleva una etiqueta «Beta» ─────────────────────────────────
 *
 * La llevó. La barra mide 256 px y, descontados los márgenes y el icono, quedan unos 160 para el
 * texto: «Plan de Desarrollo» (~128 px) y la etiqueta (~36) no caben juntos, así que el nombre se
 * partía en dos líneas y el botón salía más alto que todos sus vecinos. Medido en pantalla, no
 * calculado. Que esto es una vista previa ya lo dice el aviso en la cabecera de la propia página.
 * `whitespace-nowrap` fija el nombre en una línea por si un día la barra se estrecha.
 */

import Link from 'next/link'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import type { ItemMenu } from '@/lib/constants'

export default function EnlaceMenuPdm({ item, activo }: { item: ItemMenu; activo: boolean }) {
  return (
    <Link
      href={item.href}
      // `ring-inset` y no `border`: el borde suma 2 px de alto y el botón salía más
      // alto que sus vecinos. El anillo interior se dibuja sin ocupar espacio.
      className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
        activo
          ? 'bg-[#192031] text-white ring-[#192031]'
          : 'bg-white text-[#192031] ring-[#192031]/35 hover:bg-gray-50 hover:ring-[#192031]'
      }`}
    >
      <Icono
        glifo={Iconos.navegacion[item.icono]}
        tamano="md"
        className={activo ? 'text-white' : 'text-[#192031]'}
      />
      <span className="flex-1 whitespace-nowrap">{item.label}</span>
    </Link>
  )
}
